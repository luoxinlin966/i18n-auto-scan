'use strict';

var path = require('path');
var fs = require('fs');
require('../utils/index.js');
var utils_tpl = require('../utils/tpl.js');
var utils_log = require('../utils/log.js');

class Init {
    genConfigFile() {
        let filePath = path.resolve(process.cwd(), './i18n.config.js');
        fs.writeFileSync(filePath, utils_tpl.configCode, { encoding: 'utf-8' });
    }
    run() {
        this.genConfigFile();
        utils_log.logger.info('初始配置文件完成');
    }
}

exports.Init = Init;
