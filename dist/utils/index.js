'use strict';

var fs = require('fs');
var path = require('path');
var utils_log = require('./log.js');
var ignore = require('ignore');
var prettier = require('prettier');
var parser = require('@babel/parser');
var t = require('@babel/types');
var crypto = require('crypto');
var _traverse = require('@babel/traverse');

const traverse = getDefault(_traverse);
function getDefault(data) {
    return typeof data === 'function' ? data : data.default;
}
// 获取配置文件
const getConfiguration = () => {
    let filePath = path.resolve(process.cwd(), 'i18n.config.js');
    if (!fs.existsSync(filePath)) {
        utils_log.logger.error(`配置文件不存在，请执行 npx i18n init`);
        process.exit(0);
    }
    let config = require(filePath);
    config.__rootPath = process.cwd();
    config.include = Array.isArray(config.include)
        ? config.include
        : [config.include];
    config.exclude = Array.isArray(config.exclude)
        ? config.exclude
        : [config.exclude];
    return config;
};
// 创建文件夹
const mkdir = (dir) => {
    if (!fs.existsSync(dir)) {
        mkdir(path.dirname(dir));
        fs.mkdirSync(dir);
    }
};
// 创建文件
const createLanguageFile = async (filePath, template, data = {}) => {
    mkdir(path.dirname(filePath));
    const fileName = path.basename(filePath, path.extname(filePath));
    const file = template
        .replace('$name', `'${fileName}'`)
        .replace('$data', () => JSON.stringify(data));
    let code = await prettierJs(file);
    fs.writeFileSync(filePath, code, { encoding: 'utf-8' });
};
async function prettierJs(code) {
    const filePath = await prettier.resolveConfigFile();
    const prettierConfig = (await prettier.resolveConfig(filePath)) || {};
    return prettier.format(code, { parser: 'babel-ts', ...prettierConfig });
}
// 获取需要翻译的列表
function scanFile(dirPath, config, fn) {
    const dirOrFiles = fs.readdirSync(dirPath, { encoding: 'utf8' });
    let fileRegex = config.test;
    if (typeof fileRegex === 'string')
        fileRegex = new RegExp(fileRegex);
    const ig = ignore().add(config.exclude);
    const includes = ignore().add(config.include);
    for (let item of dirOrFiles) {
        const relativePath = path.relative(config.__rootPath, path.resolve(dirPath, item));
        if (!ig.ignores(relativePath) || includes.ignores(relativePath)) {
            const filePath = path.resolve(dirPath, item);
            if (fs.lstatSync(filePath).isFile()) {
                if (fileRegex.test(item))
                    fn(filePath);
            }
            else {
                scanFile(filePath, config, fn);
            }
        }
    }
}
function babelParse(code) {
    try {
        const ast = parser.parse(code, {
            sourceType: 'module',
            errorRecovery: true,
            plugins: ['jsx', 'typescript', 'decorators-legacy'].filter((n) => n)
        });
        if (ast.errors.length > 0) {
            ast.errors.forEach((err) => utils_log.logger.error(err));
            return;
        }
        return ast;
    }
    catch (error) {
        utils_log.logger.error(error);
    }
}
function isCallExpression(path, importInfo) {
    let { imported, local } = importInfo;
    if (t.isCallExpression(path.parent)) {
        let name = path.parent.callee.name;
        if (name === imported || local === name)
            return true;
    }
    return false;
}
function md5Hash(str, secretKey) {
    let md5;
    if (secretKey) {
        md5 = crypto.createHmac('md5', secretKey);
    }
    else {
        md5 = crypto.createHash('md5');
    }
    return md5.update(str).digest('hex');
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function readLanguages(name, config, isExit = false) {
    const { output } = config;
    const { dir: outputPath, ext = 'js' } = output;
    let curFilePath = path.resolve(config.__rootPath, outputPath, `${name}.${ext}`);
    if (!fs.existsSync(curFilePath) && isExit) {
        utils_log.logger.error(`${curFilePath} 文件不存在!`);
        // process.exit(0)
    }
    const file = fs.readFileSync(curFilePath, { encoding: 'utf-8' });
    const ast = parser.parse(file, {
        sourceType: 'module',
        plugins: ['typescript']
    });
    const res = {};
    traverse(ast, {
        ObjectProperty(path) {
            const key = path.node.key.value || path.node.key.name;
            const value = path.node.value.value || path.node.value.name;
            res[key] = value || '';
        }
    });
    return res;
}
const generateId = (value, templateInfo) => {
    const { id: keyId = 'zh', formatId } = templateInfo || {};
    if (formatId) {
        return formatId(value);
    }
    else {
        if (keyId === 'zh') {
            return value;
        }
        else {
            return md5Hash(value);
        }
    }
};
const generateTemplateLiteralParamsKey = (i) => {
    return `{{@${i}=}}`;
};

exports.babelParse = babelParse;
exports.createLanguageFile = createLanguageFile;
exports.generateId = generateId;
exports.generateTemplateLiteralParamsKey = generateTemplateLiteralParamsKey;
exports.getConfiguration = getConfiguration;
exports.getDefault = getDefault;
exports.isCallExpression = isCallExpression;
exports.prettierJs = prettierJs;
exports.readLanguages = readLanguages;
exports.scanFile = scanFile;
exports.sleep = sleep;
