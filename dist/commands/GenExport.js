'use strict';

var fs = require('fs');
var path = require('path');
var utils_index = require('../utils/index.js');
var utils_tpl = require('../utils/tpl.js');
var utils_log = require('../utils/log.js');

class GenExport {
    config;
    params = {};
    constructor(config) {
        this.config = config;
    }
    async genExportFile() {
        let { languages, output, __rootPath } = this.config;
        let imports = languages
            .map((name) => {
            let newName = name.replace('-', '_');
            return `import ${newName} from './${name}';`;
        })
            .join('\n');
        let resources = languages
            .map((name) => {
            let _name = name.replace('-', '_');
            return `extendLocale('${_name}', ${_name});`;
        })
            .join('\n');
        const file = utils_tpl.exportTpl
            .replace('$import', imports)
            .replace('$resources', resources);
        let dirPath = output.dir;
        let ext = output.ext || 'js';
        let curFilePath = path.resolve(__rootPath, dirPath, `index.${ext}`);
        let code = await utils_index.prettierJs(file);
        fs.writeFileSync(curFilePath, code, { encoding: 'utf-8' });
    }
    run() {
        this.genExportFile();
        utils_log.logger.info('\n生成导出文件成功！\n', 'green', true);
    }
}

exports.GenExport = GenExport;
