export function getConfig(peerConnection: any, cfg: {} | undefined, globalConfig: any): any;
export function getGlobalConfig(cfg?: {}): {
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
