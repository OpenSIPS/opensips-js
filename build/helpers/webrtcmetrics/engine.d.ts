export default class ProbesEngine {
    constructor(cfg: any);
    _config: any
    _probes: any[]
    _startedTime: number | null
    _callbacks: {
        onresult: null;
    }
    get probes(): any[];
    get isRunning(): boolean;
    get isIdle(): boolean;
    addNewProbe(peerConnection: any, options: any): Probe;
    removeExistingProbe(probe: any): void;
    start(): Promise<void>;
    stop(forced: any): void;
    registerCallback(name: any, callback: any, context: any): void;
    unregisterCallback(name: any): void;
    fireOnReports(report: any): void;
}
import Probe from './probe'
