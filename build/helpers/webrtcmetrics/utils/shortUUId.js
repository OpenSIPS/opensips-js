'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
function shortUUID () {
    const uuid = +new Date()
    return `${uuid}`
}
exports.default = shortUUID
