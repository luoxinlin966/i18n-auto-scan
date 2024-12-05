'use strict';

var path = require('path');
var fs = require('fs');
var utils_index = require('../utils/index.js');
var axios = require('axios');
var crypto = require('crypto');
var t = require('@babel/types');
var _traverse = require('@babel/traverse');
var utils_constants = require('../utils/constants.js');
var utils_disableRule = require('../utils/disableRule.js');
var utils_tpl = require('../utils/tpl.js');
var utils_log = require('../utils/log.js');

const traverse = utils_index.getDefault(_traverse);
class Translate {
    config;
    languages = {};
    newLanguages = {};
    chinese = {};
    translateTable = {}; // 存放待翻译列表，按语种为key值存放
    translateSource = {}; // 按语种为key值存放当前语种已有的语料清单（含已翻译的语料）
    constructor(config) {
        this.config = config;
    }
    readLanguagesConfig() {
        const { languages, __rootPath, output, template = utils_tpl.defaultTpl } = this.config;
        languages.forEach((name) => {
            const { dir, ext = 'js' } = output;
            let dirPath = path.resolve(__rootPath, dir, `${name}.${ext}`);
            if (!fs.existsSync(dirPath)) {
                utils_index.createLanguageFile(dirPath, template);
                this.languages[name] = {};
            }
            else {
                this.languages[name] = utils_index.readLanguages(name, this.config);
            }
            this.newLanguages[name] = [];
        });
    }
    readFile() {
        const dir = this.config.entry;
        if (typeof dir === 'string') {
            this.readFiles(dir);
        }
        else if (Array.isArray(dir)) {
            dir.forEach((d) => this.readFiles(d));
        }
    }
    readFiles(dir) {
        const __rootPath = this.config.__rootPath;
        const dirPath = path.resolve(__rootPath, dir);
        utils_index.scanFile(dirPath, this.config, (path) => {
            utils_log.logger.info(`发现文件: ${path}`);
            const code = fs.readFileSync(path, { encoding: 'utf8' });
            this.babelOpt(code, path);
        });
    }
    babelOpt(code, file) {
        const importInfo = this.config.importInfo;
        const ast = utils_index.babelParse(code);
        if (!ast)
            return;
        const _this = this;
        // 注释禁用
        let disableRule = new utils_disableRule.DisableRule(ast.comments || []);
        if (disableRule.entireFileDisabled)
            return;
        traverse(ast, {
            // jsx文本： <div>花飘万家雪</div>
            JSXText(path) {
                if (utils_index.isCallExpression(path, importInfo))
                    return;
                if (disableRule.test(path.node.loc))
                    return;
                if (utils_tpl.zhExt.test(path.toString())) {
                    const value = path.toString().trim();
                    const id = utils_index.generateId(value, _this.config.templateInfo);
                    _this.validateKey(value, id, file);
                }
            },
            // 模板文本： `花飘万家雪${xxx}`
            TemplateLiteral(path) {
                if (utils_index.isCallExpression(path, importInfo))
                    return;
                if (disableRule.test(path.node.loc))
                    return;
                if (utils_tpl.zhExt.test(path.toString())) {
                    const node = path.node;
                    let isCh = false;
                    node.quasis?.forEach?.((item) => utils_tpl.zhExt.test(item.value.raw) && (isCh = true));
                    if (isCh) {
                        let i = 0;
                        let value = path
                            .toString()
                            .replace(/^`|`$/g, '')
                            .replace(utils_constants.cutBraceReg, () => utils_index.generateTemplateLiteralParamsKey(++i));
                        const id = utils_index.generateId(value, _this.config.templateInfo);
                        _this.validateKey(value, id, file);
                    }
                }
            },
            // 普通文本： '花飘万家雪'
            StringLiteral(path) {
                // 如果父节点是 ts 则不处理, 如 type AA = '你好' | '大家好'
                if (t.isTSLiteralType(path.parent))
                    return;
                if (utils_index.isCallExpression(path, importInfo))
                    return;
                if (disableRule.test(path.node.loc))
                    return;
                if (utils_tpl.zhExt.test(path.toString())) {
                    const value = path.node.value.toString();
                    const id = utils_index.generateId(value, _this.config.templateInfo);
                    _this.validateKey(value, id, file);
                }
            }
        });
    }
    validateKey(zh, key, file) {
        for (let languageKey in this.languages) {
            if (!this.languages[languageKey][key] &&
                !this.newLanguages[languageKey].find((n) => n.id === key)) {
                this.newLanguages[languageKey].push({
                    chinese: languageKey === 'zh'
                        ? this.formatChinese({
                            chinese: zh
                        }).replace(utils_constants.unSymbolReg, (_$1, $2) => `{${$2}}`)
                        : zh,
                    id: key,
                    file
                });
            }
        }
    }
    createChineseFile() {
        let newData = (this.newLanguages.zh || []).reduce((p, c) => ((p[c.id] = c.chinese), p), {});
        const { output, template = utils_tpl.defaultTpl, __rootPath } = this.config;
        let curFilePath = path.resolve(__rootPath, output.dir, `zh.${output.ext || 'js'}`);
        utils_index.createLanguageFile(curFilePath, template, Object.assign(this.languages.zh, newData));
    }
    // 分割语料，按50个次分割
    sliceWords(words) {
        const len = words.length;
        const res = [];
        let i = 0;
        const resLen = 50;
        while (i < len) {
            res.push(words.slice(i, i + resLen));
            i += resLen;
        }
        return res;
    }
    formatChinese(word) {
        return word.chinese.replace(utils_constants.unbracketReg, (...args) => args[2]);
    }
    async translate() {
        const { server, output, template = utils_tpl.defaultTpl, __rootPath } = this.config;
        const curQps = server.qps || 1; // 翻译API有QPS限制s
        for (let curLanguage in this.newLanguages) {
            if (curLanguage === 'zh')
                continue;
            const words = this.newLanguages[curLanguage];
            words.length && utils_log.logger.info(`开始翻译 ${curLanguage}`, 'green', true);
            // 词条分成50个来翻译
            const list = this.sliceWords(words);
            const newData = {};
            for (let item of list) {
                if (!item.length)
                    continue;
                const data = await this.requestTranslate(item.map((n) => this.formatChinese(n)).join('\n'), curLanguage);
                for (let i = 0; i < data.length; i++) {
                    const target = item.find((n) => this.formatChinese(n) === data[i].src);
                    const translated = data[i].dst.replace(utils_constants.unSymbolReg, (_$1, $2) => `{${$2}}`);
                    if (target) {
                        utils_log.logger.info(`${target.chinese} => ${translated}`, 'white');
                        newData[target.id] = translated;
                    }
                }
                const sleepTime = Math.round(1000 / curQps);
                if (sleepTime > 0)
                    await utils_index.sleep(sleepTime);
            }
            let curFilePath = path.resolve(__rootPath, output.dir, `${curLanguage}.${output.ext || 'js'}`);
            utils_index.createLanguageFile(curFilePath, template, Object.assign(this.languages[curLanguage], newData));
        }
    }
    async requestTranslate(word, targetLanguage) {
        const { appId, key } = this.config.server;
        const salt = Date.now().toString();
        const from = 'zh';
        const to = targetLanguage || 'en';
        const md5 = crypto.createHash('md5');
        // @ts-ignore
        md5.update(Buffer.from(appId + word + salt + key));
        const sign = md5.digest('hex');
        const res = await axios({
            method: 'POST',
            baseURL: 'http://api.fanyi.baidu.com',
            url: '/api/trans/vip/translate',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: { q: word, from, to, salt, sign, appid: appId }
        });
        let trans_result = '';
        if (res.status === 200) {
            if (res.data.error_code) {
                let msg = utils_tpl.ERROE_CODE_MAP[res.data.error_code];
                utils_log.logger.error(msg);
                throw new Error(res.data.error_msg);
            }
            trans_result = res.data.trans_result;
        }
        return trans_result;
    }
    async run() {
        this.readLanguagesConfig(); // 读取旧语言包
        this.readFile(); // 扫描文件中的中文
        this.createChineseFile(); // 更新中文语言包
        await this.translate(); // 翻译其他语言
        utils_log.logger.info('翻译完成！', 'green', true);
    }
}

exports.Translate = Translate;
