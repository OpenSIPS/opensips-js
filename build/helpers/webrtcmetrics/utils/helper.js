"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSSRCDataFromBunch = exports.getLastReport = exports.lastOfReports = exports.maxValueOfReports = exports.minValueOfReports = exports.sumValuesOfReports = exports.averageValuesOfReports = exports.volatilityValuesOfReports = exports.call = exports.timeout = exports.createCollectorId = exports.createProbeId = exports.average = void 0;
//import shortUUID from "./shortUUId";
const generate_unique_id_1 = __importDefault(require("generate-unique-id"));
const models_1 = require("./models");
const getValues = (reports, key, subKey, avoidZeroValue = false, ssrc) => {
    let arr = reports.map((report) => {
        if (!subKey) {
            return report[key];
        }
        if (!ssrc) {
            return report[key][subKey];
        }
        const data = report[key][ssrc];
        if (data) {
            return data[subKey];
        }
        return null;
    });
    // Avoid null value
    arr = arr.filter((item) => {
        if (avoidZeroValue) {
            return (Number.isFinite(item) && item > 0);
        }
        return Number.isFinite(item);
    });
    if (arr.length === 0) {
        return [];
    }
    return arr;
};
const average = (nums) => (nums.reduce((a, b) => a + b, 0) / nums.length);
exports.average = average;
const createProbeId = () => (`probe-${(0, generate_unique_id_1.default)()}`);
exports.createProbeId = createProbeId;
const createCollectorId = () => (`coltr-${(0, generate_unique_id_1.default)()}`);
exports.createCollectorId = createCollectorId;
const timeout = (ms) => (new Promise((resolve) => setTimeout(resolve, ms)));
exports.timeout = timeout;
const call = (fct, context, value) => {
    if (!context) {
        fct(value);
    }
    else {
        fct.call(context, value);
    }
};
exports.call = call;
const volatilityValuesOfReports = (reports, key, subKey, ssrc) => {
    const values = getValues(reports, key, subKey, true, ssrc);
    if (values.length === 0) {
        return null;
    }
    const avg = values.reduce((p, c) => p + c, 0) / values.length;
    if (avg === 0) {
        return null;
    }
    const diff = values.map((data) => (Math.abs(avg - data)));
    const totalDiff = diff.reduce((p, c) => p + c, 0);
    const volatility = ((totalDiff / values.length) * 100) / avg;
    return volatility;
};
exports.volatilityValuesOfReports = volatilityValuesOfReports;
const averageValuesOfReports = (reports, key, subKey, avoidZeroValue = false, ssrc) => {
    const values = getValues(reports, key, subKey, avoidZeroValue, ssrc);
    if (values.length === 0) {
        return null;
    }
    return values.reduce((p, c) => p + c, 0) / values.length;
};
exports.averageValuesOfReports = averageValuesOfReports;
const sumValuesOfReports = (reports, key, subKey) => {
    const values = getValues(reports, key, subKey);
    return values.reduce((p, c) => p + c, 0);
};
exports.sumValuesOfReports = sumValuesOfReports;
const minValueOfReports = (reports, key, subKey, ssrc) => {
    const values = getValues(reports, key, subKey, true, ssrc);
    if (values.length === 0) {
        return null;
    }
    return Math.min(...values);
};
exports.minValueOfReports = minValueOfReports;
const maxValueOfReports = (reports, key, subKey, ssrc) => {
    const values = getValues(reports, key, subKey, false, ssrc);
    if (values.length === 0) {
        return null;
    }
    return Math.max(...values);
};
exports.maxValueOfReports = maxValueOfReports;
const lastOfReports = (reports, key, subKey, ssrc) => {
    const lastReport = reports.slice().pop();
    if (!lastReport) {
        return null;
    }
    if (!subKey) {
        return lastReport[key];
    }
    if (!ssrc) {
        return lastReport[key][subKey];
    }
    const ssrcData = lastReport[key][ssrc];
    if (ssrcData) {
        return ssrcData[subKey];
    }
    return null;
};
exports.lastOfReports = lastOfReports;
const getLastReport = (reports) => (reports.slice().pop());
exports.getLastReport = getLastReport;
const getSSRCDataFromBunch = (ssrc, bunch, direction) => {
    if (!bunch) {
        return null;
    }
    const ssrcBunch = {};
    let audioBunch = bunch[models_1.VALUE.AUDIO][ssrc];
    if (!audioBunch) {
        audioBunch = direction === models_1.DIRECTION.INBOUND ? Object.assign({}, models_1.defaultAudioMetricIn) : Object.assign({}, models_1.defaultAudioMetricOut);
    }
    ssrcBunch[models_1.VALUE.AUDIO] = audioBunch;
    let videoBunch = bunch[models_1.VALUE.VIDEO][ssrc];
    if (!videoBunch) {
        videoBunch = direction === models_1.DIRECTION.INBOUND ? Object.assign({}, models_1.defaultVideoMetricIn) : Object.assign({}, models_1.defaultVideoMetricOut);
    }
    ssrcBunch[models_1.VALUE.VIDEO] = videoBunch;
    return ssrcBunch;
};
exports.getSSRCDataFromBunch = getSSRCDataFromBunch;
