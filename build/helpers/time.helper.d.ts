export interface ITimeData {
    callId: string;
    hours: number;
    minutes: number;
    seconds: number;
    formatted: string;
}
export type TempTimeData = Omit<ITimeData, 'callId'> & {
    callId: string | undefined;
};
export declare function setupTime(time: TempTimeData): {
    seconds: number;
    minutes: number;
    hours: number;
    formatted: string;
};
