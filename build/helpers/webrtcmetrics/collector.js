"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const exporter_1 = __importDefault(require("./exporter"));
const extractor_1 = require("./extractor");
const score_1 = require("./utils/score");
const models_1 = require("./utils/models");
const helper_1 = require("./utils/helper");
const log_1 = require("./utils/log");
class Collector {
    constructor(cfg, refProbeId) {
        this._callbacks = {
            onreport: null,
            onticket: null,
        };
        this._id = (0, helper_1.createCollectorId)();
        this._moduleName = this._id;
        this._probeId = refProbeId;
        this._config = cfg;
        this._exporter = new exporter_1.default(cfg);
        this._state = models_1.COLLECTOR_STATE.IDLE;
        this.registerToPCEvents();
        (0, log_1.info)(this._moduleName, `new collector created for probe ${this._probeId}`);
    }
    analyze(stats, previousReport, beforeLastReport, referenceReport) {
        const getDefaultSSRCMetric = (kind, reportType) => {
            if (kind === models_1.VALUE.AUDIO) {
                if (reportType === models_1.TYPE.INBOUND_RTP) {
                    return Object.assign({}, models_1.defaultAudioMetricIn);
                }
                return Object.assign({}, models_1.defaultAudioMetricOut);
            }
            if (reportType === models_1.TYPE.INBOUND_RTP) {
                return Object.assign({}, models_1.defaultVideoMetricIn);
            }
            return Object.assign({}, models_1.defaultVideoMetricOut);
        };
        const report = (0, models_1.getDefaultMetric)(previousReport);
        report.pname = this._config.pname;
        report.call_id = this._config.cid;
        report.user_id = this._config.uid;
        report.count = previousReport ? previousReport.count + 1 : 1;
        let timestamp = null;
        stats.forEach((stat) => {
            if (!timestamp && stat.timestamp) {
                timestamp = stat.timestamp;
            }
            const values = (0, extractor_1.extract)(stat, report, report.pname, referenceReport);
            values.forEach((data) => {
                if (data.value && data.type) {
                    if (data.ssrc) {
                        let ssrcReport = report[data.type][data.ssrc];
                        if (!ssrcReport) {
                            ssrcReport = getDefaultSSRCMetric(data.type, stat.type);
                            ssrcReport.ssrc = data.ssrc;
                            report[data.type][data.ssrc] = (ssrcReport);
                        }
                        Object.keys(data.value).forEach((key) => {
                            ssrcReport[key] = data.value[key];
                        });
                    }
                    else {
                        Object.keys(data.value).forEach((key) => {
                            report[data.type][key] = data.value[key];
                        });
                    }
                }
            });
        });
        report.timestamp = timestamp;
        Object.keys(report[models_1.VALUE.AUDIO]).forEach((key) => {
            const ssrcReport = report[models_1.VALUE.AUDIO][key];
            if (ssrcReport.direction === models_1.DIRECTION.INBOUND) {
                ssrcReport.mos_emodel_in = (0, score_1.computeEModelMOS)(report, models_1.VALUE.AUDIO, previousReport, beforeLastReport, ssrcReport.ssrc);
                ssrcReport.mos_in = (0, score_1.computeMOS)(report, models_1.VALUE.AUDIO, previousReport, beforeLastReport, ssrcReport.ssrc);
            }
            else {
                ssrcReport.mos_emodel_out = (0, score_1.computeEModelMOSForOutgoing)(report, models_1.VALUE.AUDIO, previousReport, beforeLastReport, ssrcReport.ssrc);
                ssrcReport.mos_out = (0, score_1.computeMOSForOutgoing)(report, models_1.VALUE.AUDIO, previousReport, beforeLastReport, ssrcReport.ssrc);
            }
        });
        return report;
    }
    takeReferenceStats() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const preWaitTime = Date.now();
                setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                    try {
                        const waitTime = Date.now() - preWaitTime;
                        const preTime = Date.now();
                        const reports = yield this._config.pc.getStats();
                        const referenceReport = this.analyze(reports, null, null, null);
                        const postTime = Date.now();
                        referenceReport.experimental.time_to_measure_ms = postTime - preTime;
                        referenceReport.experimental.time_to_wait_ms = waitTime;
                        this._exporter.saveReferenceReport(referenceReport);
                        (0, log_1.debug)(this._moduleName, `got reference report for probe ${this._probeId}`);
                        resolve();
                    }
                    catch (err) {
                        reject(err);
                    }
                }), this._config.startAfter);
            });
        });
    }
    collectStats() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this._state !== models_1.COLLECTOR_STATE.RUNNING || !this._config.pc) {
                    (0, log_1.debug)(this._moduleName, `report discarded (too late) for probe ${this._probeId}`);
                    return null;
                }
                // Take into account last report in case no report have been generated (eg: candidate-pair)
                const preTime = Date.now();
                const reports = yield this._config.pc.getStats();
                const report = this.analyze(reports, this._exporter.getLastReport(), this._exporter.getBeforeLastReport(), this._exporter.getReferenceReport());
                const postTime = Date.now();
                report.experimental.time_to_measure_ms = postTime - preTime;
                this._exporter.addReport(report);
                (0, log_1.debug)(this._moduleName, `got report for probe ${this._probeId}#${this._exporter.getReportsNumber() + 1}`);
                this.fireOnReport(report);
                return report;
            }
            catch (err) {
                (0, log_1.error)(this._moduleName, `got error ${err}`);
                return null;
            }
        });
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            (0, log_1.debug)(this._moduleName, "starting");
            this.state = models_1.COLLECTOR_STATE.RUNNING;
            this._startedTime = this._exporter.start();
            (0, log_1.debug)(this._moduleName, "started");
        });
    }
    mute() {
        return __awaiter(this, void 0, void 0, function* () {
            this.state = models_1.COLLECTOR_STATE.MUTED;
            (0, log_1.debug)(this._moduleName, "muted");
        });
    }
    unmute() {
        return __awaiter(this, void 0, void 0, function* () {
            this.state = models_1.COLLECTOR_STATE.RUNNING;
            (0, log_1.debug)(this._moduleName, "unmuted");
        });
    }
    stop(forced) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, log_1.debug)(this._moduleName, `stopping${forced ? " by watchdog" : ""}...`);
            this._stoppedTime = this._exporter.stop();
            this.state = models_1.COLLECTOR_STATE.IDLE;
            if (this._config.ticket) {
                const { ticket } = this._exporter;
                this.fireOnTicket(ticket);
            }
            this._exporter.reset();
            (0, log_1.debug)(this._moduleName, "stopped");
        });
    }
    registerCallback(name, callback, context) {
        if (name in this._callbacks) {
            this._callbacks[name] = {
                callback,
                context,
            };
            (0, log_1.debug)(this._moduleName, `registered callback '${name}'`);
        }
        else {
            (0, log_1.error)(this._moduleName, `can't register callback for '${name}' - not found`);
        }
    }
    unregisterCallback(name) {
        if (name in this._callbacks) {
            this._callbacks[name] = null;
            delete this._callbacks[name];
            (0, log_1.debug)(this._moduleName, `unregistered callback '${name}'`);
        }
        else {
            (0, log_1.error)(this._moduleName, `can't unregister callback for '${name}' - not found`);
        }
    }
    fireOnReport(report) {
        if (this._callbacks.onreport) {
            (0, helper_1.call)(this._callbacks.onreport.callback, this._callbacks.onreport.context, report);
        }
    }
    fireOnTicket(ticket) {
        if (this._callbacks.onticket) {
            (0, helper_1.call)(this._callbacks.onticket.callback, this._callbacks.onticket.context, ticket);
        }
    }
    updateConfig(config) {
        this._config = config;
        this._exporter.updateConfig(config);
    }
    get state() {
        return this._state;
    }
    set state(newState) {
        this._state = newState;
        (0, log_1.debug)(this._moduleName, `state changed to ${newState}`);
    }
    addCustomEvent(at, category, name, description) {
        this._exporter.addCustomEvent({
            at: typeof at === "object" ? at.toJSON() : at,
            category,
            name,
            description,
        });
    }
    registerToPCEvents() {
        return __awaiter(this, void 0, void 0, function* () {
            const { pc } = this._config;
            navigator.mediaDevices.ondevicechange = () => __awaiter(this, void 0, void 0, function* () {
                try {
                    const devices = yield navigator.mediaDevices.enumerateDevices();
                    this.addCustomEvent(new Date().toJSON(), "device", `${devices.length} devices found`, "Media Devices state");
                    // eslint-disable-next-line no-empty
                }
                catch (err) {
                    (0, log_1.error)(this._moduleName, "can't get devices");
                }
            });
            if (pc) {
                pc.oniceconnectionstatechange = () => {
                    const value = pc.iceConnectionState;
                    if (value === models_1.ICE_CONNECTION_STATE.CONNECTED ||
                        value === models_1.ICE_CONNECTION_STATE.COMPLETED) {
                        this.addCustomEvent(new Date().toJSON(), "call", value, "ICE connection state");
                    }
                    else if (value === models_1.ICE_CONNECTION_STATE.DISCONNECTED ||
                        value === models_1.ICE_CONNECTION_STATE.FAILED) {
                        this.addCustomEvent(new Date().toJSON(), "call", value, "ICE connection state");
                    }
                    else if (value === models_1.ICE_CONNECTION_STATE.CLOSED) {
                        this.addCustomEvent(new Date().toJSON(), "call", "ended", "ICE connection state");
                    }
                };
                pc.onicegatheringstatechange = () => {
                    const value = pc.iceGatheringState;
                    this.addCustomEvent(new Date().toJSON(), "call", value, "ICE gathering state");
                };
                pc.ontrack = (e) => {
                    this.addCustomEvent(new Date().toJSON(), "call", `${e.track.kind}track`, "MediaStreamTrack received");
                };
                pc.onnegotiationneeded = () => {
                    this.addCustomEvent(new Date().toJSON(), "call", "negotiation", "Media changed");
                };
                const receivers = pc.getReceivers();
                if (receivers && receivers.length > 0) {
                    const receiver = receivers[0];
                    const { transport } = receiver;
                    if (transport) {
                        const { iceTransport } = transport;
                        if (iceTransport) {
                            iceTransport.onselectedcandidatepairchange = () => {
                                this.addCustomEvent(new Date().toJSON(), "call", "transport", "Candidates Pair changed");
                            };
                        }
                    }
                }
            }
        });
    }
}
exports.default = Collector;
