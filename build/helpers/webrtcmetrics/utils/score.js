"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeMOSForOutgoing = exports.computeMOS = exports.computeEModelMOSForOutgoing = exports.computeEModelMOS = void 0;
const models_1 = require("./models");
const helper_1 = require("./helper");
const computeScore = (r) => {
    if (r < 0) {
        return 1;
    }
    if (r > 100) {
        return 4.5;
    }
    return 1 + 0.035 * r + (7.0 / 1000000) * r * (r - 60) * (100 - r);
};
const computeEModelMOS = (report, kind = models_1.VALUE.AUDIO, previousReport, beforeLastReport, ssrc) => {
    const currentSSRCReport = (0, helper_1.getSSRCDataFromBunch)(ssrc, report, models_1.DIRECTION.INBOUND);
    const previousSSRCReport = (0, helper_1.getSSRCDataFromBunch)(ssrc, previousReport, models_1.DIRECTION.INBOUND);
    const beforeLastSSRCReport = (0, helper_1.getSSRCDataFromBunch)(ssrc, beforeLastReport, models_1.DIRECTION.INBOUND);
    const rttValues = [];
    const jitterValues = [];
    const packetsLoss = currentSSRCReport[kind].percent_packets_lost_in;
    const currentJitter = currentSSRCReport[kind].delta_jitter_ms_in;
    const lastJitter = (previousSSRCReport && previousSSRCReport[kind].delta_jitter_ms_in) || null;
    const beforeLastJitter = (beforeLastSSRCReport && beforeLastSSRCReport[kind].delta_jitter_ms_in) ||
        null;
    const currentRTTConnectivity = report.data.delta_rtt_connectivity_ms;
    const lastRTTConnectivity = (previousReport && previousReport.data.delta_rtt_connectivity_ms) ||
        null;
    const beforeLastRTTConnectivity = (beforeLastReport && beforeLastReport.data.delta_rtt_connectivity_ms) ||
        null;
    if (currentRTTConnectivity) {
        rttValues.push(currentRTTConnectivity);
    }
    if (lastRTTConnectivity) {
        rttValues.push(lastRTTConnectivity);
    }
    if (beforeLastRTTConnectivity) {
        rttValues.push(beforeLastRTTConnectivity);
    }
    // Put Jitter values
    if (currentJitter) {
        jitterValues.push(currentJitter);
    }
    if (previousReport && lastJitter) {
        jitterValues.push(lastJitter);
    }
    if (beforeLastReport && beforeLastJitter) {
        jitterValues.push(beforeLastJitter);
    }
    const rtt = rttValues.length > 0 ? (0, helper_1.average)(rttValues) : 100; // Default value if no value;
    const jitter = jitterValues.length > 0 ? (0, helper_1.average)(jitterValues) : 10; // Default value if no value;
    const rx = 93.2 - packetsLoss;
    const ry = 0.18 * rx * rx - 27.9 * rx + 1126.62;
    const d = (rtt + jitter) / 2;
    const h = d - 177.3 < 0 ? 0 : 1;
    const id = 0.024 * d + 0.11 * (d - 177.3) * h;
    const r = ry - id;
    return computeScore(r);
};
exports.computeEModelMOS = computeEModelMOS;
const computeEModelMOSForOutgoing = (report, kind = models_1.VALUE.AUDIO, previousReport, beforeLastReport, ssrc) => {
    const currentSSRCReport = (0, helper_1.getSSRCDataFromBunch)(ssrc, report, models_1.DIRECTION.OUTBOUND);
    const previousSSRCReport = (0, helper_1.getSSRCDataFromBunch)(ssrc, previousReport, models_1.DIRECTION.OUTBOUND);
    const beforeLastSSRCReport = (0, helper_1.getSSRCDataFromBunch)(ssrc, beforeLastReport, models_1.DIRECTION.OUTBOUND);
    const rttValues = [];
    const jitterValues = [];
    const packetsLoss = currentSSRCReport[kind].percent_packets_lost_out;
    const currentRtt = currentSSRCReport[kind].delta_rtt_ms_out;
    const lastRtt = (previousSSRCReport && previousSSRCReport[kind].delta_rtt_ms_out) || null;
    const beforeLastRtt = (beforeLastSSRCReport && beforeLastSSRCReport[kind].delta_rtt_ms_out) ||
        null;
    const currentJitter = currentSSRCReport[kind].delta_jitter_ms_out;
    const lastJitter = (previousSSRCReport && previousSSRCReport[kind].delta_jitter_ms_out) || null;
    const beforeLastJitter = (beforeLastSSRCReport && beforeLastSSRCReport[kind].delta_jitter_ms_out) ||
        null;
    const currentRTTConnectivity = report.data.delta_rtt_connectivity_ms;
    const lastRTTConnectivity = (previousReport && previousReport.data.delta_rtt_connectivity_ms) ||
        null;
    const beforeLastRTTConnectivity = (beforeLastReport && beforeLastReport.data.delta_rtt_connectivity_ms) ||
        null;
    // Put RTT values when exist
    if (currentRtt) {
        rttValues.push(currentRtt);
    }
    else if (currentRTTConnectivity) {
        rttValues.push(currentRTTConnectivity);
    }
    if (lastRtt) {
        rttValues.push(lastRtt);
    }
    else if (lastRTTConnectivity) {
        rttValues.push(lastRTTConnectivity);
    }
    if (beforeLastRtt) {
        rttValues.push(beforeLastRtt);
    }
    else if (beforeLastRTTConnectivity) {
        rttValues.push(beforeLastRTTConnectivity);
    }
    // Put Jitter values
    if (currentJitter) {
        jitterValues.push(currentJitter);
    }
    if (previousReport && lastJitter) {
        jitterValues.push(lastJitter);
    }
    if (beforeLastReport && beforeLastJitter) {
        jitterValues.push(beforeLastJitter);
    }
    const rtt = rttValues.length > 0 ? (0, helper_1.average)(rttValues) : 100; // Default value if no value;
    const jitter = jitterValues.length > 0 ? (0, helper_1.average)(jitterValues) : 10; // Default value if no value;
    const rx = 93.2 - packetsLoss;
    const ry = 0.18 * rx * rx - 27.9 * rx + 1126.62;
    const d = (rtt + jitter) / 2;
    const h = d - 177.3 < 0 ? 0 : 1;
    const id = 0.024 * d + 0.11 * (d - 177.3) * h;
    const r = ry - id;
    return computeScore(r);
};
exports.computeEModelMOSForOutgoing = computeEModelMOSForOutgoing;
const computeMOS = (report, kind = models_1.VALUE.AUDIO, previousReport, beforeLastReport, ssrc) => {
    const currentSSRCReport = (0, helper_1.getSSRCDataFromBunch)(ssrc, report, models_1.DIRECTION.INBOUND);
    const previousSSRCReport = (0, helper_1.getSSRCDataFromBunch)(ssrc, previousReport, models_1.DIRECTION.INBOUND);
    const beforeLastSSRCReport = (0, helper_1.getSSRCDataFromBunch)(ssrc, beforeLastReport, models_1.DIRECTION.INBOUND);
    const rttValues = [];
    const jitterValues = [];
    const packetsLoss = currentSSRCReport[kind].percent_packets_lost_in / 100;
    const currentJitter = currentSSRCReport[kind].delta_jitter_ms_in;
    const lastJitter = (previousSSRCReport && previousSSRCReport[kind].delta_jitter_ms_in) || null;
    const beforeLastJitter = (beforeLastSSRCReport && beforeLastSSRCReport[kind].delta_jitter_ms_in) ||
        null;
    const currentRTTConnectivity = report.data.delta_rtt_connectivity_ms;
    const lastRTTConnectivity = (previousReport && previousReport.data.delta_rtt_connectivity_ms) ||
        null;
    const beforeLastRTTConnectivity = (beforeLastReport && beforeLastReport.data.delta_rtt_connectivity_ms) ||
        null;
    // Put RTT values when exist
    if (currentRTTConnectivity) {
        rttValues.push(currentRTTConnectivity);
    }
    if (lastRTTConnectivity) {
        rttValues.push(lastRTTConnectivity);
    }
    if (beforeLastRTTConnectivity) {
        rttValues.push(beforeLastRTTConnectivity);
    }
    // Put Jitter values
    if (currentJitter) {
        jitterValues.push(currentJitter);
    }
    if (previousSSRCReport && lastJitter) {
        jitterValues.push(lastJitter);
    }
    if (beforeLastSSRCReport && beforeLastJitter) {
        jitterValues.push(beforeLastJitter);
    }
    const rtt = rttValues.length > 0 ? (0, helper_1.average)(rttValues) : 100; // Default value if no value;
    const jitter = jitterValues.length > 0 ? (0, helper_1.average)(jitterValues) : 10; // Default value if no value;
    const codecFittingParameterA = 0;
    const codecFittingParameterB = 19.8;
    const codecFittingParameterC = 29.7;
    const ld = 30;
    const d = (rtt + jitter) / 2 + ld;
    const h = d - 177.3 < 0 ? 0 : 1;
    const id = 0.024 * d + 0.11 * (d - 177.3) * h;
    const ie = codecFittingParameterA +
        codecFittingParameterB * Math.log(1 + codecFittingParameterC * packetsLoss);
    const r = 93.2 - (ie + id);
    return computeScore(r);
};
exports.computeMOS = computeMOS;
const computeMOSForOutgoing = (report, kind = models_1.VALUE.AUDIO, previousReport, beforeLastReport, ssrc) => {
    const currentSSRCReport = (0, helper_1.getSSRCDataFromBunch)(ssrc, report, models_1.DIRECTION.OUTBOUND);
    const previousSSRCReport = (0, helper_1.getSSRCDataFromBunch)(ssrc, previousReport, models_1.DIRECTION.OUTBOUND);
    const beforeLastSSRCReport = (0, helper_1.getSSRCDataFromBunch)(ssrc, beforeLastReport, models_1.DIRECTION.OUTBOUND);
    const rttValues = [];
    const jitterValues = [];
    const packetsLoss = currentSSRCReport[kind].percent_packets_lost_out / 100;
    const currentRtt = currentSSRCReport[kind].delta_rtt_ms_out;
    const lastRtt = (previousSSRCReport && previousSSRCReport[kind].delta_rtt_ms_out) || null;
    const beforeLastRtt = (beforeLastSSRCReport && beforeLastSSRCReport[kind].delta_rtt_ms_out) ||
        null;
    const currentJitter = currentSSRCReport[kind].delta_jitter_ms_out;
    const lastJitter = (previousSSRCReport && previousSSRCReport[kind].delta_jitter_ms_out) || null;
    const beforeLastJitter = (beforeLastSSRCReport && beforeLastSSRCReport[kind].delta_jitter_ms_out) ||
        null;
    const currentRTTConnectivity = report.data.delta_rtt_connectivity_ms;
    const lastRTTConnectivity = (previousReport && previousReport.data.delta_rtt_connectivity_ms) ||
        null;
    const beforeLastRTTConnectivity = (beforeLastReport && beforeLastReport.data.delta_rtt_connectivity_ms) ||
        null;
    // Put RTT values when exist
    if (currentRtt) {
        rttValues.push(currentRtt);
    }
    else if (currentRTTConnectivity) {
        rttValues.push(currentRTTConnectivity);
    }
    if (lastRtt) {
        rttValues.push(lastRtt);
    }
    else if (lastRTTConnectivity) {
        rttValues.push(lastRTTConnectivity);
    }
    if (beforeLastRtt) {
        rttValues.push(beforeLastRtt);
    }
    else if (beforeLastRTTConnectivity) {
        rttValues.push(beforeLastRTTConnectivity);
    }
    // Put Jitter values
    if (currentJitter) {
        jitterValues.push(currentJitter);
    }
    if (previousSSRCReport && lastJitter) {
        jitterValues.push(lastJitter);
    }
    if (beforeLastSSRCReport && beforeLastJitter) {
        jitterValues.push(beforeLastJitter);
    }
    const rtt = rttValues.length > 0 ? (0, helper_1.average)(rttValues) : 100; // Default value if no value;
    const jitter = jitterValues.length > 0 ? (0, helper_1.average)(jitterValues) : 10; // Default value if no value;
    const codecFittingParameterA = 0;
    const codecFittingParameterB = 19.8;
    const codecFittingParameterC = 29.7;
    const ld = 30;
    const d = (rtt + jitter) / 2 + ld;
    const h = d - 177.3 < 0 ? 0 : 1;
    const id = 0.024 * d + 0.11 * (d - 177.3) * h;
    const ie = codecFittingParameterA +
        codecFittingParameterB * Math.log(1 + codecFittingParameterC * packetsLoss);
    const r = 93.2 - (ie + id);
    return computeScore(r);
};
exports.computeMOSForOutgoing = computeMOSForOutgoing;
