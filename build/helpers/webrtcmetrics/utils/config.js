'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.getGlobalConfig = exports.getConfig = void 0
const models_1 = require('./models')
const log_1 = require('./log')
const moduleName = 'config      '
const getConfig = (peerConnection, cfg = {}, globalConfig) => {
    const config = Object.assign(Object.assign({}, globalConfig), cfg)
    if (!cfg.pname) {
        (0, log_1.warn)(moduleName, `Argument [String] 'cfg.pname' for the peerConnection name or id is missing - use generated '${globalConfig.pname}'`)
    }
    if (!cfg.cid) {
        (0, log_1.warn)(moduleName, `Argument [String] 'cfg.cid' for the call name or id is missing - use generated '${globalConfig.cid}'`)
    }
    if (!cfg.uid) {
        (0, log_1.warn)(moduleName, `Argument [String] 'cfg.uid' for the user name or id is missing - use generated '${globalConfig.uid}'`)
    }
    config.pc = peerConnection
    return config
}
exports.getConfig = getConfig
const getGlobalConfig = (cfg = {}) => {
    const config = Object.assign(Object.assign({}, models_1.defaultConfig), cfg)
    config.name = (0, models_1.getLibName)()
    config.version = (0, models_1.getVersion)()
    return config
}
exports.getGlobalConfig = getGlobalConfig
