"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterObjectKeys = void 0;
function filterObjectKeys(fullObj, keys) {
    return Object.keys(fullObj)
        .filter((key) => keys.includes(key))
        .reduce((obj, key) => {
        const k = key;
        //const o = obj as ProbeMetricInType
        //o[k] = fullObj[k] //as ProbeMetricInType[keyof ProbeMetricInType]
        return Object.assign(Object.assign({}, obj), { [k]: fullObj[k] });
    }, {});
}
exports.filterObjectKeys = filterObjectKeys;
