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

export type RTCBundlePolicy = 'balanced' | 'max-bundle' | 'max-compat'
export type RTCIceTransportPolicy = 'all' | 'relay'
export type RTCRtcpMuxPolicy = 'require'

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
    className: string
    setSinkId (id: string): Promise<void>
}

export interface AnswerOptionsExtended extends AnswerOptions {
    mediaConstraints?: MediaStreamConstraints
}

export interface RemoteIdentityCallType {
    _display_name: string
    _uri: {
        _user: string
    }
}

export interface RTCSessionExtended extends RTCSession {
    id: string
    _automaticHold: boolean
    _id: string
    _localHold: boolean
    _audioMuted: boolean
    _cancel_reason: string
    _contact: string
    _end_time: Date
    _eventsCount: number
    _from_tag: string
    _is_canceled: boolean
    _is_confirmed: boolean
    _late_sdp: string
    _videoMuted: boolean
    _status: number
    _remote_identity: RemoteIdentityCallType
    answer(options?: AnswerOptionsExtended): void
}

export interface ICall extends RTCSessionExtended {
    roomId?: number
    localMuted?: boolean
    localHold?: boolean
    audioTag?: StreamMediaType
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

/* UA */
export interface CallOptionsExtended extends AnswerOptionsExtended {
    eventHandlers?: Partial<RTCSessionEventMap>;
    anonymous?: boolean;
    fromUserName?: string;
    fromDisplayName?: string;
}