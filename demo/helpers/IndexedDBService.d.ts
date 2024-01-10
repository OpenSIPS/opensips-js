export declare class IndexedDBService {
    isConnected: boolean
    private readonly dbName
    private db
    private readonly version
    constructor(db: any, version: any);
    connect(): any;
    saveData(data: any, uid: any): any;
    getData(uid: any): any;
    close(): void;
}
