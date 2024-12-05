'use strict';

var utils_index = require('../utils/index.js');
var commands_GenExport = require('./GenExport.js');
var commands_Init = require('./Init.js');
var commands_Translate = require('./Translate.js');
var utils_log = require('../utils/log.js');

class I18nCommand {
    command;
    constructor(command) {
        this.command = command;
    }
    run() {
        let config = this.command == 'init' ? {} : utils_index.getConfiguration();
        const commandMap = {
            init: new commands_Init.Init(),
            translate: new commands_Translate.Translate(config),
            genExport: new commands_GenExport.GenExport(config)
        };
        let command = commandMap[this.command];
        if (!command) {
            utils_log.logger.error(`${this.command} 命令不存在`);
            utils_log.logger.info('npx i18n init: 初始化配置文件');
            utils_log.logger.info('npx i18n translate: 生成语言包');
            utils_log.logger.info('npx i18n genExport: 生成导出文件');
            return;
        }
        command.run();
    }
}

exports.I18nCommand = I18nCommand;
