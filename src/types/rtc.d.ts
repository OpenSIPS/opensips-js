import {
    AnswerOptions,
    EndEvent,
    IncomingAckEvent,
    IncomingEvent,
    OutgoingAckEvent,
    OutgoingEvent,
    RTCSession,
    RTCSessionEventMap,
    MediaConstraints
} from 'jssip/lib/RTCSession'
import {
    IncomingRequest
} from 'jssip/lib/SIPMessage'
import { UAConfiguration } from 'jssip/lib/UA'

import { MODULES } from '@/enum/modules'

import { ExtraContactParams } from 'jssip/lib/Registrator'

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

type ExactConstraints = {
    audio?: {
        deviceId: {exact: string}
    }
    video?: boolean;
}

export interface AnswerOptionsExtended extends AnswerOptions {
    mediaConstraints?: MediaConstraints | ExactConstraints
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
    init_icncoming(request: IncomingRequest): void
}

export interface ICall extends RTCSessionExtended {
    roomId?: number
    localMuted?: boolean
    localHold?: boolean
    audioTag?: StreamMediaType
    autoAnswer?: boolean
}

export type RoomChangeEmitType = {
    room: IRoom
    roomList: { [key: number]: IRoom }
}

export interface MediaEvent extends Event {
    stream: MediaStream
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

export type AudioModuleName = typeof MODULES.AUDIO
export type VideoModuleName = typeof MODULES.VIDEO
export type MSRPModuleName = typeof MODULES.MSRP

export type Modules = AudioModuleName | VideoModuleName | MSRPModuleName

export type IOpenSIPSConfiguration = Omit<UAConfiguration, 'sockets'>

export interface IOpenSIPSJSOptions {
    configuration: IOpenSIPSConfiguration
    pnExtraHeaders: ExtraContactParams
    socketInterfaces: [ string ]
    sipDomain: string
    sipOptions: {
        session_timers: boolean
        extraHeaders: [ string ]
        pcConfig: RTCConfiguration
    },
    modules: Array<Modules>
}

export interface TriggerListenerOptions {
    listenerType: string
    session: RTCSessionExtended
    event?:  ListenerEventType
}
type CommonLogMethodType = (...args: unknown[]) => void

export interface CustomLoggerType {
    log: CommonLogMethodType
    warn: CommonLogMethodType
    error: CommonLogMethodType
    debug: CommonLogMethodType
}

/* UA */
export interface CallOptionsExtended extends AnswerOptionsExtended {
    eventHandlers?: Partial<RTCSessionEventMap>;
    anonymous?: boolean;
    fromUserName?: string;
    fromDisplayName?: string;
}
