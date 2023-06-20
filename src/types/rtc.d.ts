import { MediaStreamConstraints } from 'lib.dom.d.ts'
import { Partial } from 'lib.es5.d.ts'
import {
    AnswerOptions,
    EndEvent,
    IncomingAckEvent,
    IncomingEvent,
    OutgoingAckEvent,
    OutgoingEvent,
    RTCSession, RTCSessionEventMap,
} from 'jssip/lib/RTCSession'
import { UAConfiguration } from 'jssip/lib/UA'

export type IntervalType = ReturnType<typeof setInterval>

export type ListenerEventType = EndEvent | IncomingEvent | OutgoingEvent | IncomingAckEvent | OutgoingAckEvent

export type RTCUAEventType =
    'connecting' |
    'connected' |
    'disconnected' |
    'registered' |
    'unregistered' |
    'registrationFailed' |
    'registrationExpiring' |
    'newRTCSession' |
    'newMessage' |
    'newOptions' |
    'sipEvent'

export type RTCBundlePolicy = 'balanced' | 'max-bundle' | 'max-compat'
export type RTCIceTransportPolicy = 'all' | 'relay'
export type RTCRtcpMuxPolicy = 'require'
export type RTCMuteOptionsKeys = 'audio' | 'video'
export type RTCTerminateOptions = {
    extraHeaders?: Array<string>
    status_code?: number
    reason_phrase?: string
    body?: string
}

export type RTCReferOptions = {
    extraHeaders?: Array<string>
    eventHandlers?: any
    replaces?: RTCSessionExtended
}
export interface RTCIceServer {
    credential?: string;
    urls: string | string[];
    username?: string;
}

export interface RTCConfiguration {
    bundlePolicy?: RTCBundlePolicy;
    certificates?: RTCCertificate[];
    iceCandidatePoolSize?: number;
    iceServers?: RTCIceServer[];
    iceTransportPolicy?: RTCIceTransportPolicy;
    rtcpMuxPolicy?: RTCRtcpMuxPolicy;
}

export interface StreamMediaType extends HTMLAudioElement {
    class: string
    setSinkId (id: string): Promise<void>
}

/*interface ConstrainDOMStringParameters {
    exact?: string | string[];
    ideal?: string | string[];
}

type ConstrainDOMString = string | string[] | ConstrainDOMStringParameters;

interface MediaTrackConstraintSet {
    aspectRatio?: number;
    autoGainControl?: boolean;
    channelCount?: number;
    deviceId?: ConstrainDOMString;
    echoCancellation?: boolean;
    facingMode?: ConstrainDOMString;
    frameRate?: number;
    groupId?: ConstrainDOMString;
    height?: number;
    latency?: number;
    noiseSuppression?: boolean;
    sampleRate?: number;
    sampleSize?: number;
    suppressLocalAudioPlayback?: boolean;
    width?: number;
}
interface MediaTrackConstraints extends MediaTrackConstraintSet {
    advanced?: MediaTrackConstraintSet[];
}
interface MediaStreamConstraints {
    audio?: boolean | MediaTrackConstraints;
    peerIdentity?: string;
    preferCurrentTab?: boolean;
    video?: boolean | MediaTrackConstraints;
}*/
export interface AnswerOptionsExtended extends AnswerOptions {
    mediaConstraints?: MediaStreamConstraints
}

export interface RTCSessionExtended extends RTCSession {
    id: string
    _automaticHold: boolean
    _id: string
    _localHold: boolean

    //connection: any
    _audioMuted: boolean
    _cancel_reason: string
    _contact: string
    //direction: SessionDirection
    _end_time: Date
    _eventsCount: number
    _from_tag: string
    _is_canceled: boolean
    _is_confirmed: boolean
    _late_sdp: string
    _videoMuted: boolean
    //status: number
    _status: number
    //start_time: Date
    _remote_identity: string
    answer(options?: AnswerOptionsExtended): void
    /*isOnHold: () => OnHoldResult
    sendDTMF: (value: number | string, options?: { [key: string]: unknown }) => void
    hold: (options?: { [key: string]: unknown }, done?: () => void) => boolean
    unhold: (options?: { [key: string]: unknown }, done?: () => void) => boolean
    answer: (options?: { [key: string]: unknown }) => void
    mute: (options?: { [key: RTCMuteOptionsKeys]: boolean }) => void
    unmute: (options?: { [key: RTCMuteOptionsKeys]: boolean }) => void
    terminate: (options?: RTCTerminateOptions) => void
    refer: (target: string, options?: RTCReferOptions) => void
    on(eventName: string, handler: (event: ListenerEventType) => void)*/
}

export interface ICall extends RTCSessionExtended {
    roomId?: number
    localMuted?: boolean
    localHold?: boolean
    audioTag?: StreamMediaType
    /*remote_identity: {
        uri: any
    }*/
}

export type RoomChangeEmitType = {
    room: IRoom
    roomList: { [key: number]: IRoom }
}

export interface MediaEvent extends Event {
    stream: MediaStream
}

export interface IDoCallParam {
    target: string
    addToCurrentRoom: boolean
}

export interface IRoom {
    started: Date
    incomingInProgress: boolean
    roomId: number
}

export interface ICallStatus {
    isMoving: boolean
    isTransferring: boolean
    isMerging: boolean
}

export interface ICallStatusUpdate {
    callId: string
    isMoving?: boolean
    isTransferring?: boolean
    isMerging?: boolean
}

export type IRoomUpdate = Omit<IRoom, 'started'> & {
    started?: Date
}

export interface IOpenSIPSJSOptions {
    configuration: Omit<UAConfiguration, 'sockets'>,
    socketInterfaces: [ string ]
    sipDomain: string
    sipOptions: {
        session_timers: boolean
        extraHeaders: [ string ]
        pcConfig: RTCConfiguration
    }
}

export interface TriggerListenerOptions {
    listenerType: string
    session: RTCSessionExtended
    event?:  ListenerEventType
}


/* Listeners types */


/* UA */
export interface CallOptionsExtended extends AnswerOptionsExtended {
    eventHandlers?: Partial<RTCSessionEventMap>;
    anonymous?: boolean;
    fromUserName?: string;
    fromDisplayName?: string;
}