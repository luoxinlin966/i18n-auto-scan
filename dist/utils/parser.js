'use strict';

var utils_index = require('./index.js');
var path = require('path');
var ignore = require('ignore');
var t = require('@babel/types');
var parser = require('@babel/parser');
var helperModuleImports = require('@babel/helper-module-imports');
var chalk = require('chalk');
var _traverse = require('@babel/traverse');
var _generator = require('@babel/generator');
var utils_constants = require('./constants.js');
var utils_disableRule = require('./disableRule.js');
var utils_tpl = require('./tpl.js');

let traverse = utils_index.getDefault(_traverse);
let generator = utils_index.getDefault(_generator);
let baseLocale;
let _options;
function i18nPlugin(content, options) {
    options.__rootPath = options.__rootPath || process.cwd();
    if (!_options)
        _options = options;
    let relativePath = path.relative(options.__rootPath, options.filePath);
    try {
        let includes = ignore().add(options.include);
        let included = includes.ignores(relativePath);
        let ig = ignore().add(options.exclude || []);
        if (ig.ignores(relativePath) && !included)
            return;
    }
    catch (error) {
        return;
    }
    const { source: importSource, imported: importImported, local: importLocal } = options.importInfo;
    let plugins = ['jsx', 'typescript', 'decorators-legacy'];
    let ast = parser.parse(content, {
        sourceType: 'module',
        errorRecovery: true,
        plugins: plugins
    });
    if (ast.errors.length > 0) {
        console.warn(ast.errors);
        return;
    }
    // 注释禁用
    let disableRule = new utils_disableRule.DisableRule(ast.comments || []);
    if (disableRule.entireFileDisabled)
        return;
    if (!baseLocale)
        baseLocale = utils_index.readLanguages('zh', options, true);
    let needI18n = false;
    traverse(ast, {
        // 增加导入翻译函数
        Program: {
            exit(path) {
                // 如果需要国际化
                if (needI18n) {
                    let addI18n_1 = true;
                    path.traverse({
                        ImportDeclaration(importPath) {
                            if (importPath.node.source.value.includes(importSource)) {
                                let specifiers = importPath.node.specifiers;
                                if (specifiers.length > 0) {
                                    let registerLocaleIndex = specifiers.findIndex((n) => n.local.name === importLocal);
                                    addI18n_1 = registerLocaleIndex === -1;
                                }
                            }
                        }
                    });
                    if (addI18n_1) {
                        helperModuleImports.addNamed(path, importImported, importSource, {
                            nameHint: importLocal,
                            importPosition: 'after'
                        });
                    }
                }
            }
        },
        // jsx文本： <div>花飘万家雪</div>
        JSXText: function (path) {
            if (utils_index.isCallExpression(path, options.importInfo))
                return;
            if (disableRule.test(path.node.loc))
                return;
            if (utils_tpl.zhExt.test(path.toString())) {
                let value = path.toString().trim();
                let id = utils_index.generateId(value, options.templateInfo);
                if (noLocale(value, id, relativePath, path.node.loc))
                    return;
                let origininalValue = path.node.value;
                let trimmedValue = origininalValue.trim();
                let valueIndex = origininalValue.indexOf(trimmedValue);
                let spacesLeft = origininalValue.substring(0, valueIndex);
                let spacesRight = origininalValue.substring(valueIndex + trimmedValue.length);
                path.replaceWithMultiple([
                    t.jsxText(spacesLeft),
                    t.jsxExpressionContainer(t.callExpression(t.identifier(importLocal), [t.stringLiteral(id)])),
                    t.jsxText(spacesRight)
                ]);
                needI18n = true;
            }
        },
        // 模板文本： `花飘万家雪${xxx}`
        TemplateLiteral: function (path) {
            if (utils_index.isCallExpression(path, options.importInfo))
                return;
            if (disableRule.test(path.node.loc))
                return;
            if (utils_tpl.zhExt.test(path.toString())) {
                let node = path.node;
                let isCh = false;
                node.quasis &&
                    node.quasis.forEach((item) => {
                        if (utils_tpl.zhExt.test(item.value.raw))
                            isCh = true;
                    });
                if (isCh) {
                    let i = 0;
                    let value = path
                        .toString()
                        .replace(/^`|`$/g, '')
                        .replace(utils_constants.cutBraceReg, () => utils_index.generateTemplateLiteralParamsKey(++i));
                    let id = utils_index.generateId(value, options.templateInfo);
                    if (noLocale(value, id, relativePath, path.node.loc))
                        return;
                    path.replaceWith(t.callExpression(t.identifier(importLocal), [
                        t.stringLiteral(id),
                        t.objectExpression(node.expressions.map((item, index) => t.objectProperty(t.stringLiteral(`${index + 1}`), item)))
                    ]));
                    needI18n = true;
                }
            }
        },
        // 普通文本： '花飘万家雪'
        StringLiteral: function (path) {
            // 如果父节点是 ts 则不处理, 如 type AA = '你好' | '大家好'
            if (t.isTSLiteralType(path.parent))
                return;
            if (utils_index.isCallExpression(path, options.importInfo))
                return;
            if (disableRule.test(path.node.loc))
                return;
            let value = path?.node?.value?.toString();
            if (utils_tpl.zhExt.test(value)) {
                let id = utils_index.generateId(value, options.templateInfo);
                if (noLocale(value, id, relativePath, path.node.loc))
                    return;
                // 如果是属性中有中文，需要加上{}
                if (t.isJSXAttribute(path.parent)) {
                    path.replaceWith(t.jsxExpressionContainer(t.callExpression(t.identifier(importLocal), [t.stringLiteral(id)])));
                }
                else {
                    // 普通文本
                    path.replaceWith(t.callExpression(t.identifier(importLocal), [t.stringLiteral(id)]));
                }
                needI18n = true;
            }
        }
    });
    if (needI18n) {
        let codeRes = generator(ast, {
            retainLines: true,
            jsescOption: { minimal: true },
            decoratorsBeforeExport: true,
            sourceMaps: true,
            sourceFileName: options.filePath
        }, content);
        return {
            code: codeRes.code,
            map: codeRes.map
        };
    }
}
function noLocale(value, id, relativePath, loc) {
    if (!baseLocale)
        return false;
    if (!baseLocale[id]) {
        let line = chalk.bold(`Line ${loc.start.line}:${loc.start.column}:`);
        let content = `${line}  在语言包中未发现以下字段【${chalk.blue(value)}】请更新语言包`;
        let res = new Error(`[i18n-auto-react]\n${relativePath}\n  ${content}`);
        // @ts-ignore
        _options.warning && _options.emitWarning(_options.isVite ? content : res);
        return true;
    }
}

exports.i18nPlugin = i18nPlugin;
