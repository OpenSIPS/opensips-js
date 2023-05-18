"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.error = exports.warn = exports.info = exports.trace = exports.debug = exports.setLogLevel = exports.setVerboseLog = void 0;
const log = __importStar(require("loglevel"));
const getHeader = () => `${new Date().toISOString()} | metrics`;
const format = (header, module, message) => `${header} | ${module} | ${message}`;
log.setDefaultLevel(log.levels.TRACE);
const setVerboseLog = (shouldHaveVerboseLog) => {
    log.info(format(getHeader(), "log         ", `set log level to ${shouldHaveVerboseLog ? "verbose" : "info"}`));
    log.setLevel(shouldHaveVerboseLog ? log.levels.TRACE : log.levels.INFO);
};
exports.setVerboseLog = setVerboseLog;
const setLogLevel = (logLevel) => {
    const levels = [...Object.keys(log.levels)];
    if (levels.includes(logLevel)) {
        log.info(format(getHeader(), "log         ", `update log level to ${logLevel.toLowerCase()}`));
        log.setLevel(logLevel);
    }
    else {
        log.warn(format(getHeader(), "log         ", "Incorrect log level please choose one of "), levels);
    }
};
exports.setLogLevel = setLogLevel;
const debug = (name, message, data) => {
    if (data) {
        log.debug(format(getHeader(), name, message), data);
    }
    else {
        log.debug(format(getHeader(), name, message));
    }
};
exports.debug = debug;
const trace = (name, message) => {
    log.info(format(getHeader(), name, message));
};
exports.trace = trace;
const info = (name, message) => {
    log.info(format(getHeader(), name, message));
};
exports.info = info;
const warn = (name, message) => {
    log.warn(format(getHeader(), name, message));
};
exports.warn = warn;
const error = (name, message) => {
    log.error(format(getHeader(), name, message));
};
exports.error = error;
