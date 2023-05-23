export default class Probe {
    constructor(cfg: any);
    _id: any
    _moduleName: any
    _config: any
    _collector: Collector
    /**
     * Register a callback to 'onreport'
     * Unregister when callback is null
     * Fired when a report is received
     */
    set onreport(arg: any);
    /**
     * Register a callback to 'onticket'
     * Unregister when callback is null
     * Fired when a ticket is received
     */
    set onticket(arg: any);
    /**
     * Get the id of the Probe
     */
    get id(): any;
    /**
     * Get the name of the PeerConnection
     */
    get pname(): any;
    /**
     * Get the call identifier
     */
    get cid(): any;
    /**
     * Get the user identifier
     */
    get uid(): any;
    set state(arg: string);
    /**
     * Get the state of the analyzer
     * Value can be 'running' or 'idle'
     */
    get state(): string;
    /**
     * Add a custom event for that probe
     * @param {String} name The name of the event
     * @param {String} category The category of the event. Could be any strings
     * @param {String} description A description. Could be empty
     * @param {Date} at Optional. The date of the event
     */
    addCustomEvent(name: string, category: string, description: string, at?: Date): void;
    /**
     * Return true if the probe is running
     */
    get isRunning(): boolean;
    /**
     * Return true if the probe is idle
     */
    get isIdle(): boolean;
    /**
     * Set the user identifier
     */
    updateUserId(value: any): void;
    /**
     * Update the call identifier
     */
    updateCallId(value: any): void;
    /**
     * Set a probe to running state
     */
    start(): void;
    /**
     * Set a probe to idle state
     */
    stop(forced?: boolean): void;
    takeReferenceStats(): Promise<any>;
    collectStats(): Promise<any>;
}
import Collector from './collector'
