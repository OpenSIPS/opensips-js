export default class Collector {
    constructor(cfg: any, refProbeId: any);
    _callbacks: {
        onreport: null;
        onticket: null;
    };
    _id: string;
    _moduleName: string;
    _probeId: any;
    _config: any;
    _exporter: Exporter;
    _state: string;
    analyze(stats: any, previousReport: any, beforeLastReport: any, referenceReport: any): any;
    takeReferenceStats(): Promise<any>;
    collectStats(): Promise<any>;
    start(): Promise<void>;
    set state(arg: string);
    get state(): string;
    _startedTime: Date | undefined;
    mute(): Promise<void>;
    unmute(): Promise<void>;
    stop(forced: any): Promise<void>;
    _stoppedTime: Date | undefined;
    registerCallback(name: any, callback: any, context: any): void;
    unregisterCallback(name: any): void;
    fireOnReport(report: any): void;
    fireOnTicket(ticket: any): void;
    updateConfig(config: any): void;
    addCustomEvent(at: any, category: any, name: any, description: any): void;
    registerToPCEvents(): Promise<void>;
}
import Exporter from "./exporter";
