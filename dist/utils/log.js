'use strict';

var chalk = require('chalk');

class Logger {
    info(msg, color = 'blue', isBold = false) {
        if (isBold) {
            console.log(chalk[color].bold(msg));
        }
        else {
            console.log(chalk[color](msg));
        }
    }
    warning(msg) {
        console.log(chalk.yellow(`${chalk.bold('Warning: ')}${msg}`));
    }
    error(msg) {
        msg = msg instanceof Error ? msg.message : msg;
        console.log(chalk.red(`${chalk.bold('Error: ')}${msg}`));
    }
}
const logger = new Logger();

exports.logger = logger;
