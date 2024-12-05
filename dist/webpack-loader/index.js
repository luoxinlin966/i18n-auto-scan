'use strict';

var utils_index = require('../utils/index.js');
var utils_parser = require('../utils/parser.js');

//@ts-nocheck
let options = null;
function webpackLoader (source, map, meta) {
    let resourcePath = this.resourcePath;
    if (!/node_modules/.test(resourcePath)) {
        if (!options)
            options = utils_index.getConfiguration() || {};
        let res = utils_parser.i18nPlugin(source, {
            ...options,
            filePath: resourcePath,
            emitWarning: this.emitWarning
        });
        if (res && res.code) {
            this.callback(null, res.code, map || res.map, meta);
            return;
        }
    }
    this.callback(null, source, map, meta);
}

module.exports = webpackLoader;
