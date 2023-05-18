"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("regenerator-runtime/runtime.js");
const log_1 = require("./utils/log");
const config_1 = require("./utils/config");
const engine_1 = __importDefault(require("./engine"));
const moduleName = "interface   ";
class WebRTCMetrics {
    constructor(cfg) {
        this._config = (0, config_1.getGlobalConfig)(cfg);
        (0, log_1.info)(moduleName, `welcome to ${this._config.name} version ${this._config.version}`);
        (0, log_1.setVerboseLog)(this._config.verbose || false);
        this._engine = new engine_1.default(this._config);
    }
    /**
     * Change log level manually
     * @param {string} level - The level of logs. Can be one of 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'SILENT'
     */
    setupLogLevel(level) {
        (0, log_1.setLogLevel)(level);
    }
    /**
     * Get the version
     */
    get version() {
        return this._config.version;
    }
    /**
     * Get the library name
     */
    get name() {
        return this._config.name;
    }
    /**
     * Get the probes
     */
    get probes() {
        return this._engine.probes;
    }
    /**
     * Create a new probe and return it
     * @param {RTCPeerConnection} peerConnection The RTCPeerConnection instance to monitor
     * @param {Object} options  The option
     * @return {Probe} The probe created
     */
    createProbe(peerConnection, options) {
        return this._engine.addNewProbe(peerConnection, options);
    }
    /**
     * Start all probes
     */
    startAllProbes() {
        this._engine.start();
    }
    /**
     * Stop all probes
     */
    stopAllProbes() {
        this._engine.stop();
    }
    /**
     * Is running
     */
    get running() {
        return this._engine.isRunning;
    }
    /**
     * Is Idle
     */
    get idle() {
        return this._engine.isIdle;
    }
    /**
     * Experimental
     * Remote a probe
     * @param {Probe} probe
     */
    removeProbe(probe) {
        this._engine.removeExistingProbe(probe);
    }
    set onresult(callback) {
        if (callback) {
            this._engine.registerCallback("onresult", callback);
        }
        else {
            this._engine.unregisterCallback("onresult");
        }
    }
}
exports.default = WebRTCMetrics;
