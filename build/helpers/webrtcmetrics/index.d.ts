export default class WebRTCMetrics {
    constructor(cfg: any);
    _config: {
        refreshEvery: number;
        startAfter: number;
        stopAfter: number;
        verbose: boolean;
        pname: string;
        cid: string;
        uid: string;
        record: boolean;
        ticket: boolean;
    };
    _engine: ProbesEngine;
    /**
     * Change log level manually
     * @param {string} level - The level of logs. Can be one of 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'SILENT'
     */
    setupLogLevel(level: string): void;
    /**
     * Get the version
     */
    get version(): any;
    /**
     * Get the library name
     */
    get name(): any;
    /**
     * Get the probes
     */
    get probes(): any[];
    /**
     * Create a new probe and return it
     * @param {RTCPeerConnection} peerConnection The RTCPeerConnection instance to monitor
     * @param {Object} options  The option
     * @return {Probe} The probe created
     */
    createProbe(peerConnection: RTCPeerConnection, options: Object): Probe;
    /**
     * Start all probes
     */
    startAllProbes(): void;
    /**
     * Stop all probes
     */
    stopAllProbes(): void;
    /**
     * Is running
     */
    get running(): boolean;
    /**
     * Is Idle
     */
    get idle(): boolean;
    /**
     * Experimental
     * Remote a probe
     * @param {Probe} probe
     */
    removeProbe(probe: Probe): void;
    set onresult(arg: any);
}
import ProbesEngine from "./engine";
