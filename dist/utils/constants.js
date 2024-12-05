'use strict';

const unbracketReg = /(\{\{(\@[0-9]+?\=)\}\})/g;
const unSymbolReg = /\@\s*([0-9]+)\=/g;
const cutBraceReg = /\$\{([\s\S]+?)\}/g;

exports.cutBraceReg = cutBraceReg;
exports.unSymbolReg = unSymbolReg;
exports.unbracketReg = unbracketReg;
