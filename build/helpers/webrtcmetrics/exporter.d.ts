export default class Exporter {
    constructor(cfg: any);
    _start: string | null
    _end: string | null
    _cfg: any
    _referenceReport: any
    _reports: any[]
    _events: any[]
    start(): Date;
    stop(): Date;
    saveReferenceReport(report: any): void;
    getReferenceReport(): any;
    addReport(report: any): void;
    addCustomEvent(event: any): void;
    reset(): void;
    get ticket(): {
        version: string;
        configuration: {
            frequency: any;
        };
        started: string | null;
        ended: string | null;
        ua: {
            agent: string;
            pname: any;
            user_id: any;
        };
        call: {
            call_id: any;
            events: any[];
        };
        details: {
            count: number;
            reports: any[];
            reference: any;
        };
        ssrc: {};
        data: {
            rtt: {
                avg: number | null;
                min: number | null;
                max: number | null;
                volatility: number | null;
                _unit: {
                    avg: string;
                    min: string;
                    max: string;
                    volatility: string;
                };
            };
            packetsLost: {
                audio: {
                    in: {
                        avg: number;
                    };
                };
                video: {
                    in: {
                        avg: number;
                    };
                };
                unit: {
                    avg: string;
                };
            };
            bitrate: {
                in: {
                    avg: number | null;
                    min: number | null;
                    max: number | null;
                    volatility: number | null;
                };
                out: {
                    avg: number | null;
                    min: number | null;
                    max: number | null;
                    volatility: number | null;
                };
                unit: {
                    avg: string;
                    min: string;
                    max: string;
                    volatility: string;
                };
            };
            traffic: {
                in: {
                    avg: number | null;
                    min: number | null;
                    max: number | null;
                    volatility: number | null;
                };
                out: {
                    avg: number | null;
                    min: number | null;
                    max: number | null;
                    volatility: number | null;
                };
                unit: {
                    avg: string;
                    min: string;
                    max: string;
                    volatility: string;
                };
            };
            network: {
                localConnection: string;
                remoteConnection: string;
            };
        };
    };
    updateConfig(config: any): void;
    getLastReport(): any;
    getBeforeLastReport(): any;
    getReportsNumber(): number;
}
