import {
    AnswerOptions,
    EndEvent,
    IncomingAckEvent,
    IncomingEvent,
    OutgoingAckEvent,
    OutgoingEvent,
    MSRPSession, MSRPSessionEventMap
} from '@/lib/msrp/session'

import { StreamMediaType } from '@/types/rtc'

export type ListenerEventType = EndEvent | IncomingEvent | OutgoingEvent | IncomingAckEvent | OutgoingAckEvent

export interface IMessage extends MSRPSessionExtended {
    roomId?: number
    localMuted?: boolean
    localHold?: boolean
    audioTag?: StreamMediaType
}


export interface MSRPSessionExtended extends MSRPSession {
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
    _remote_identity: string
    answer(options?: any): void
    _init_incomeing()
}

export interface TriggerMSRPListenerOptions {
    listenerType: string
    session: MSRPSessionExtended
    event?:  ListenerEventType
}