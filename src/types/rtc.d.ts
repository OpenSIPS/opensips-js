import { OnHoldResult, RTCSession, SessionDirection } from 'jssip/lib/RTCSession'
import { IRoom } from '~/src'

export type IntervalType = ReturnType<typeof setInterval>

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
    class: string
    setSinkId (id: string): Promise<void>
}

export interface RTCSessionExtended extends RTCSession {
    _automaticHold: boolean
    _id: string
    _localHold: boolean

    _audioMuted: boolean
    _cancel_reason: string
    _contact: string
    direction: SessionDirection
    _end_time: Date
    _eventsCount: number
    _from_tag: string
    _is_canceled: boolean
    _is_confirmed: boolean
    _late_sdp: string
    _videoMuted: boolean
    status: number
    _status: number
    start_time: Date
    _remote_identity: string
    isOnHold: () => OnHoldResult
}

export interface ICall extends RTCSessionExtended {
    id: string
    roomId?: number
    localMuted?: boolean
    localHold?: boolean
    audioTag?: StreamMediaType
}

export type RoomChangeEmitType = {
    room: IRoom
    roomList: { [key: number]: IRoom }
}