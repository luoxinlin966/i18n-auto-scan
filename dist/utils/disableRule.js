'use strict';

class DisableRule {
    nextLine = [];
    thisLine = [];
    entireFileDisabled = false;
    constructor(comments) {
        if (comments.some((item) => /i18n-disable-file/.test(item.value))) {
            this.entireFileDisabled = true;
        }
        else {
            comments.forEach((item) => {
                if (/i18n-disable-next/.test(item.value)) {
                    this.nextLine.push(item.loc.end.line);
                }
                else if (/i18n-disable/.test(item.value)) {
                    this.thisLine.push(item.loc.start.line);
                }
            });
        }
    }
    test(sourceLocation) {
        if (!sourceLocation)
            return false;
        let startLine = sourceLocation.start.line;
        let endLine = sourceLocation.end.line;
        let res = false;
        this.nextLine.forEach((item) => item + 1 == startLine && (res = true));
        this.thisLine.forEach((item) => {
            if (item >= startLine && item <= endLine)
                res = true;
        });
        return res;
    }
}

exports.DisableRule = DisableRule;
