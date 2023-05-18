import { UA } from 'jssip';
import { EndEvent, IncomingAckEvent, IncomingEvent, OutgoingAckEvent, OutgoingEvent } from 'jssip/lib/RTCSession';
import { UAConfiguration, UAEventMap } from 'jssip/lib/UA';
import { TempTimeData, ITimeData } from './helpers/time.helper';
import { WebrtcMetricsConfigType, MediaDeviceType } from '@/types/webrtcmetrics';
import { RTCConfiguration, RTCSessionExtended, ICall, IntervalType, RoomChangeEmitType } from '@/types/rtc';
export interface IOpenSIPSJSOptions {
    configuration: Omit<UAConfiguration, 'sockets'>;
    socketInterfaces: [string];
    sipDomain: string;
    sipOptions: {
        session_timers: boolean;
        extraHeaders: [string];
        pcConfig: RTCConfiguration;
    };
}
export type readyListener = (value: boolean) => void;
export type changeActiveCallsListener = (event: {
    [key: string]: ICall;
}) => void;
export type TestEventListener = (event: {
    test: string;
}) => void;
export type ActiveRoomListener = (event: number | undefined) => void;
export type CallAddingProgressListener = (callId: string | undefined) => void;
export type RoomDeletedListener = (roomId: number) => void;
export type changeActiveInputMediaDeviceListener = (event: string) => void;
export type changeActiveOutputMediaDeviceListener = (event: string) => void;
export type changeAvailableDeviceListListener = (event: Array<MediaDeviceInfo>) => void;
export type changeMuteWhenJoinListener = (value: boolean) => void;
export type changeIsDNDListener = (value: boolean) => void;
export type changeIsMutedListener = (value: boolean) => void;
export type changeOriginalStreamListener = (value: MediaStream) => void;
export type addRoomListener = (value: RoomChangeEmitType) => void;
export type updateRoomListener = (value: RoomChangeEmitType) => void;
export type removeRoomListener = (value: RoomChangeEmitType) => void;
export interface OpenSIPSEventMap extends UAEventMap {
    ready: readyListener;
    changeActiveCalls: changeActiveCallsListener;
    callConfirmed: TestEventListener;
    currentActiveRoomChanged: ActiveRoomListener;
    callAddingInProgressChanged: CallAddingProgressListener;
    roomDeleted: RoomDeletedListener;
    changeActiveInputMediaDevice: changeActiveInputMediaDeviceListener;
    changeActiveOutputMediaDevice: changeActiveOutputMediaDeviceListener;
    changeAvailableDeviceList: changeAvailableDeviceListListener;
    changeMuteWhenJoin: changeMuteWhenJoinListener;
    changeIsDND: changeIsDNDListener;
    changeIsMuted: changeIsMutedListener;
    changeOriginalStream: changeOriginalStreamListener;
    addRoom: addRoomListener;
    updateRoom: updateRoomListener;
    removeRoom: removeRoomListener;
}
export type ListenersKeyType = keyof OpenSIPSEventMap;
export type ListenersCallbackFnType = OpenSIPSEventMap[ListenersKeyType];
export type ListenerCallbackFnType<T extends ListenersKeyType> = OpenSIPSEventMap[T];
export interface IDoCallParam {
    target: string;
    addToCurrentRoom: boolean;
}
export interface IRoom {
    started: Date;
    incomingInProgress: boolean;
    roomId: number;
}
export interface ICallStatus {
    isMoving: boolean;
    isTransferring: boolean;
    isMerging: boolean;
}
export interface ICallStatusUpdate {
    callId: string;
    isMoving?: boolean;
    isTransferring?: boolean;
    isMerging?: boolean;
}
export type IRoomUpdate = Omit<IRoom, 'started'> & {
    started?: Date;
};
export type ListenerEventType = EndEvent | IncomingEvent | OutgoingEvent | IncomingAckEvent | OutgoingAckEvent;
export interface TriggerListenerOptions {
    listenerType: string;
    session: RTCSessionExtended;
    event?: ListenerEventType;
}
export declare const CALL_EVENT_LISTENER_TYPE: {
    NEW_CALL: string;
    CALL_CONFIRMED: string;
    CALL_FAILED: string;
    CALL_PROGRESS: string;
    CALL_ENDED: string;
};
export interface InnerState {
    isMuted: boolean;
    muteWhenJoin: boolean;
    isDND: boolean;
    activeCalls: {
        [key: string]: ICall;
    };
    activeRooms: {
        [key: number]: IRoom;
    };
    callTime: {
        [key: string]: TempTimeData;
    };
    callStatus: {
        [key: string]: ICallStatus;
    };
    timeIntervals: {
        [key: string]: IntervalType;
    };
    callMetrics: {
        [key: string]: any;
    };
    availableMediaDevices: Array<MediaDeviceInfo>;
    selectedMediaDevices: {
        [key in MediaDeviceType]: string;
    };
    microphoneInputLevel: number;
    speakerVolume: number;
    originalStream: MediaStream | null;
    listeners: {
        [key: string]: Array<(call: RTCSessionExtended, event: ListenerEventType | undefined) => void>;
    };
    metricConfig: WebrtcMetricsConfigType;
}
declare class OpenSIPSJS extends UA {
    private initialized;
    private readonly options;
    private readonly newRTCSessionEventName;
    private readonly activeCalls;
    private _currentActiveRoomId;
    private _callAddingInProgress;
    private state;
    constructor(options: IOpenSIPSJSOptions);
    on<T extends ListenersKeyType>(type: T, listener: ListenerCallbackFnType<T>): any;
    off<T extends ListenersKeyType>(type: T, listener: ListenerCallbackFnType<T>): any;
    emit(type: ListenersKeyType, args: any): any;
    get sipDomain(): string;
    get sipOptions(): {
        mediaConstraints: {
            audio: {
                deviceId: {
                    exact: string;
                };
            };
            video: boolean;
        };
        session_timers: boolean;
        extraHeaders: [string];
        pcConfig: RTCConfiguration;
    };
    get currentActiveRoomId(): number | undefined;
    private set currentActiveRoomId(value);
    get callAddingInProgress(): string | undefined;
    private set callAddingInProgress(value);
    get muteWhenJoin(): boolean;
    set muteWhenJoin(value: boolean);
    get isDND(): boolean;
    set isDND(value: boolean);
    get speakerVolume(): number;
    set speakerVolume(value: number);
    get microphoneInputLevel(): number;
    set microphoneInputLevel(value: number);
    get getActiveCalls(): {
        [key: string]: ICall;
    };
    get getActiveRooms(): {
        [key: number]: IRoom;
    };
    get isMuted(): boolean;
    set isMuted(value: boolean);
    get getInputDeviceList(): MediaDeviceInfo[];
    get getOutputDeviceList(): MediaDeviceInfo[];
    get getUserMediaConstraints(): {
        audio: {
            deviceId: {
                exact: string;
            };
        };
        video: boolean;
    };
    get getInputDefaultDevice(): MediaDeviceInfo | undefined;
    get getOutputDefaultDevice(): MediaDeviceInfo | undefined;
    get selectedInputDevice(): string;
    set selectedInputDevice(deviceId: string);
    get selectedOutputDevice(): string;
    set selectedOutputDevice(deviceId: string);
    get originalStream(): MediaStream | null;
    private setAvailableMediaDevices;
    updateDeviceList(): Promise<void>;
    setMediaDevices(setDefaults?: boolean): Promise<void>;
    setCallTime(value: ITimeData): void;
    removeCallTime(callId: string): void;
    private setTimeInterval;
    private removeTimeInterval;
    private _stopCallTimer;
    setMetricsConfig(config: WebrtcMetricsConfigType): void;
    sendDTMF(callId: string, value: string): void;
    doMute(value: boolean): void;
    doCallHold({ callId, toHold, automatic }: {
        callId: string;
        toHold: boolean;
        automatic?: boolean;
    }): void;
    private _cancelAllOutgoingUnanswered;
    callAnswer(callId: string): void;
    callMove(callId: string, roomId: number): Promise<void>;
    updateCall(value: ICall): void;
    updateRoom(value: IRoomUpdate): void;
    private _addCall;
    private _addCallStatus;
    private _updateCallStatus;
    private _removeCallStatus;
    private _addRoom;
    setMicrophone(dId: string): Promise<void>;
    private _setOriginalStream;
    setSpeaker(dId: string): Promise<void>;
    private removeRoom;
    private deleteRoomIfEmpty;
    private checkInitialized;
    private muteReconfigure;
    private roomReconfigure;
    private _doConference;
    _muteReconfigure(call: ICall): void;
    muteCaller(callId: string, value: boolean): void;
    callTerminate(callId: string): void;
    callTransfer(callId: string, target: string): void;
    callMerge(roomId: number): void;
    setDND(value: boolean): void;
    private _startCallTimer;
    setCurrentActiveRoomId(roomId: number | undefined): Promise<void>;
    private getNewRoomId;
    subscribe(type: string, listener: (c: RTCSessionExtended) => void): void;
    removeIListener(value: string): void;
    private addCall;
    private _triggerListener;
    private _removeCall;
    private _activeCallListRemove;
    private newRTCSessionCallback;
    private setInitialized;
    start(): this;
    setMuteWhenJoin(value: boolean): void;
    private _setCallMetrics;
    private _removeCallMetrics;
    private _getCallQuality;
    private _triggerAddStream;
    doCall({ target, addToCurrentRoom }: IDoCallParam): void;
    callChangeRoom({ callId, roomId }: {
        callId: string;
        roomId: number;
    }): Promise<void>;
}
export default OpenSIPSJS;
