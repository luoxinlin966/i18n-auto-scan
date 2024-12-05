'use strict';

var utils_index = require('../utils/index.js');
var utils_parser = require('../utils/parser.js');

function i18nAutoPlugin() {
    let config = utils_index.getConfiguration();
    return {
        name: 'vite-plugin-i18n-parser',
        enforce: 'pre',
        transform: function (code, file) {
            if (!/node_modules/.test(file) && /.(js|ts|tsx|jsx)$/.test(file)) {
                let res = utils_parser.i18nPlugin(code, {
                    ...(config || {}),
                    filePath: file,
                    // @ts-ignore
                    emitWarning: this.warn.bind(this),
                    isVite: true
                });
                if (res)
                    return res;
            }
            return {
                code,
                map: null
            };
        }
    };
}

exports.i18nAutoPlugin = i18nAutoPlugin;
