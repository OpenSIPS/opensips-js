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
    _remote_party_display_name: string | null
    _remote_party_uri_user: string | null
    answer(options?: AnswerOptionsExtended): void
    init_icncoming(request: IncomingRequest): void
}

export interface ICall extends RTCSessionExtended {
    roomId?: number
    localMuted?: boolean
    localHold?: boolean
    audioTag?: StreamMediaType
    autoAnswer?: boolean
    putOnHoldTimestamp?: number
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
    isTransferred: boolean
}

export interface ICallStatusUpdate {
    callId: string
    isMoving?: boolean
    isTransferring?: boolean
    isMerging?: boolean
    isTransferred?: boolean
}

export type IRoomUpdate = Omit<IRoom, 'started'> & {
    started?: Date
}

export type AudioModuleName = typeof MODULES.AUDIO
export type VideoModuleName = typeof MODULES.VIDEO
export type MSRPModuleName = typeof MODULES.MSRP

export type Modules = AudioModuleName | VideoModuleName | MSRPModuleName

export type OnTransportCallback = (parsed: object, message: string) => void

export interface VADOptions {
    model: 'v5' | 'legacy'
    positiveSpeechThreshold: number
    negativeSpeechThreshold: number
    minSpeechFrames: number
    preSpeechPadFrames: number
}

export interface VADSessionState {
    isSpeaking: boolean
    currentMode: 'clean' | 'noisy'
}

export type NoiseReductionMode = 'disabled' | 'enabled' | 'dynamic'

export interface NoiseReductionOptions {
    mode: NoiseReductionMode,
    vadModule?: VADModule
    vadConfig?: Partial<VADOptions>
    noiseThreshold?: number
    checkEveryMs?: number
    noiseCheckInterval?: number
    /**
     * Base path for VAD web assets (silero model, worklet processor, etc.)
     * Default: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.28/dist/'
     * For Chrome MV3 extensions, bundle assets locally and provide local path (e.g., 'chrome-extension://<id>/vad/')
     */
    baseAssetPath?: string
    /**
     * Base path for ONNX runtime WASM files
     * Default: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/'
     * For Chrome MV3 extensions, bundle ONNX WASM files locally and provide local path
     */
    onnxWASMBasePath?: string
}

export type NoiseReductionOptionsWithoutVadModule = Omit<NoiseReductionOptions, 'vadModule'>

export interface VADModule {
    MicVAD: any
}

type UAConfigurationExtended = UAConfiguration & {
    reconnectionAttemptsLimit?: number
    overrideUserAgent?: (userAgent: string) => string
    noiseReductionOptions?: NoiseReductionOptions
    onTransportCallback?: OnTransportCallback
}

export type IOpenSIPSConfiguration = Omit<UAConfigurationExtended, 'sockets'>

export interface IOpenSIPSJSOptions {
    configuration: IOpenSIPSConfiguration
    socketInterfaces: [ string ]
    sipDomain: string
    sipOptions: {
        session_timers: boolean
        extraHeaders: [ string ]
        pcConfig: RTCConfiguration
    },
    modules: Array<Modules>
    pnExtraHeaders?: ExtraContactParams
    msrpDomain?: string
    msrpWs?: boolean
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
