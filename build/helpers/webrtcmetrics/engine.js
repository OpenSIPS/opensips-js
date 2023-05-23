'use strict'
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt (value) { return value instanceof P ? value : new P(function (resolve) { resolve(value) }) }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled (value) { try { step(generator.next(value)) } catch (e) { reject(e) } }
        function rejected (value) { try { step(generator['throw'](value)) } catch (e) { reject(e) } }
        function step (result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected) }
        step((generator = generator.apply(thisArg, _arguments || [])).next())
    })
}
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { 'default': mod }
}
Object.defineProperty(exports, '__esModule', { value: true })
const log_1 = require('./utils/log')
const config_1 = require('./utils/config')
const probe_1 = __importDefault(require('./probe'))
const models_1 = require('./utils/models')
const helper_1 = require('./utils/helper')
const moduleName = 'engine      '
class ProbesEngine {
    constructor (cfg) {
        this._config = cfg
        this._probes = []
        this._startedTime = null
        this._callbacks = {
            onresult: null,
        };
        (0, log_1.info)(moduleName, `configured for probing every ${this._config.refreshEvery}ms`);
        (0, log_1.info)(moduleName, `configured for starting after ${this._config.startAfter}ms`);
        (0, log_1.info)(moduleName, `${(!this._config.stopAfter || this._config.stopAfter !== -1) ? `configured for stopped after ${this._config.stopAfter}ms` : 'configured for never stopped'}`);
        (0, log_1.debug)(moduleName, 'engine initialized')
    }
    get probes () {
        return this._probes
    }
    get isRunning () {
        return this._probes.some((probe) => (probe.isRunning))
    }
    get isIdle () {
        return this._probes.every((probe) => (probe.isIdle))
    }
    addNewProbe (peerConnection, options) {
        if (!peerConnection) {
            throw new Error('undefined peer connection')
        }
        const probeConfig = (0, config_1.getConfig)(peerConnection, options, this._config)
        const probe = new probe_1.default(probeConfig)
        this._probes.push(probe);
        (0, log_1.debug)(moduleName, `${this._probes.length} probes registered`)
        return probe
    }
    removeExistingProbe (probe) {
        if (!probe) {
            throw new Error('undefined probe')
        }
        if (probe.state === models_1.COLLECTOR_STATE.RUNNING) {
            probe.stop()
        }
        this._probes = this._probes.filter((existingProbe) => (probe.id !== existingProbe.id))
    }
    start () {
        return __awaiter(this, void 0, void 0, function* () {
            const startProbes = () => {
                this._probes.forEach((probe) => probe.start())
            }
            const takeReferenceStat = () => __awaiter(this, void 0, void 0, function* () {
                return (Promise.all(this._probes.map((probe) => (probe.takeReferenceStats()))))
            })
            const shouldCollectStats = () => {
                if (this.isIdle) {
                    // don't collect if there is no running probes
                    return false
                }
                if (!this._config.stopAfter || this._config.stopAfter < 0) {
                    // always collect if stopAfter has not been set
                    return true
                }
                // Else check expiration
                return (Date.now() < this._startedTime + this._config.stopAfter)
            }
            const collectStats = () => __awaiter(this, void 0, void 0, function* () {
                const globalReport = (0, models_1.getDefaultGlobalMetric)()
                const runningProbes = this._probes.filter((probe) => (probe.isRunning))
                for (const probe of runningProbes) {
                    const report = yield probe.collectStats()
                    if (report) {
                        globalReport.probes.push(report)
                    }
                    (0, log_1.debug)(moduleName, `got probe ${probe.id}`)
                    yield (0, helper_1.timeout)(0)
                }
                // Compute total measure time
                globalReport.delta_time_to_measure_probes_ms = (0, helper_1.sumValuesOfReports)(globalReport.probes, 'experimental', 'time_to_measure_ms')
                globalReport.delta_KBytes_in = (0, helper_1.sumValuesOfReports)(globalReport.probes, 'data', 'delta_KBytes_in')
                globalReport.delta_KBytes_out = (0, helper_1.sumValuesOfReports)(globalReport.probes, 'data', 'delta_KBytes_out')
                globalReport.delta_kbs_in = (0, helper_1.sumValuesOfReports)(globalReport.probes, 'data', 'delta_kbs_in')
                globalReport.delta_kbs_out = (0, helper_1.sumValuesOfReports)(globalReport.probes, 'data', 'delta_kbs_out')
                globalReport.total_time_decoded_in = (0, helper_1.sumValuesOfReports)(globalReport.probes, 'video', 'total_time_decoded_in')
                globalReport.total_time_encoded_out = (0, helper_1.sumValuesOfReports)(globalReport.probes, 'video', 'total_time_encoded_out')
                return globalReport
            });
            (0, log_1.debug)(moduleName, 'starting to collect')
            startProbes();
            (0, log_1.debug)(moduleName, 'generating reference reports...')
            yield takeReferenceStat();
            (0, log_1.debug)(moduleName, 'reference reports generated')
            this._startedTime = Date.now()
            while (shouldCollectStats()) {
                (0, log_1.debug)(moduleName, `wait ${this._config.refreshEvery}ms before collecting`)
                yield (0, helper_1.timeout)(this._config.refreshEvery)
                if (shouldCollectStats()) {
                    (0, log_1.debug)(moduleName, 'collecting...')
                    const preTime = Date.now()
                    const globalReport = yield collectStats()
                    const postTime = Date.now()
                    globalReport.delta_time_consumed_to_measure_ms = postTime - preTime
                    this.fireOnReports(globalReport);
                    (0, log_1.debug)(moduleName, 'collected')
                }
            }
            (0, log_1.debug)(moduleName, 'reaching end of the collecting period...')
            if (this.isRunning) {
                setTimeout(() => {
                    this.stop()
                }, 0)
            }
        })
    }
    stop (forced) {
        const stopProbes = (manual) => {
            this._probes.forEach((probe) => {
                probe.stop(manual)
            })
        };
        (0, log_1.info)(moduleName, 'stop collecting')
        stopProbes(forced)
    }
    registerCallback (name, callback, context) {
        if (name in this._callbacks) {
            this._callbacks[name] = { callback, context };
            (0, log_1.debug)(moduleName, `registered callback '${name}'`)
        }
        else {
            (0, log_1.error)(moduleName, `can't register callback for '${name}' - not found`)
        }
    }
    unregisterCallback (name) {
        if (name in this._callbacks) {
            this._callbacks[name] = null
            delete this._callbacks[name];
            (0, log_1.debug)(this._moduleName, `unregistered callback '${name}'`)
        }
        else {
            (0, log_1.error)(this._moduleName, `can't unregister callback for '${name}' - not found`)
        }
    }
    fireOnReports (report) {
        if (this._callbacks.onresult && report.probes.length > 0) {
            (0, helper_1.call)(this._callbacks.onresult.callback, this._callbacks.onresult.context, report)
        }
    }
}
exports.default = ProbesEngine
