import {
    MSRPSession,
    MSRPSessionEventMap
} from '@/lib/msrp/session'
import { EndEvent,
    IncomingAckEvent,
    IncomingEvent,
    OutgoingAckEvent,
    OutgoingEvent,
    SessionDirection } from 'jssip/lib/RTCSession'

import { StreamMediaType } from '@/types/rtc'
import MSRPMessage from '@/lib/msrp/message'

export { MSRPMessage }

export type ListenerEventType = EndEvent | IncomingEvent | OutgoingEvent | IncomingAckEvent | OutgoingAckEvent

export interface IMessage extends MSRPSessionExtended {
    roomId?: number
    localMuted?: boolean
    localHold?: boolean
    audioTag?: StreamMediaType
    terminate(): void
}


export interface MSRPSessionExtended extends MSRPSession {
    id: string
    status: string
    start_time: Date
    direction: SessionDirection
    _id: string
    _cancel_reason: string
    _contact: string
    _end_time: Date
    _eventsCount: number
    _from_tag: string
    _is_canceled: boolean
    _is_confirmed: boolean
    _late_sdp: string
    _status: number
    _remote_identity: string
    target_addr: Array<string>
    answer(options?: any): void
    _init_incomeing(): void
    sendMSRP(body: string): void
    on<T extends keyof MSRPSessionEventMap>(type: T, listener: MSRPSessionEventMap[T]): this;
}

export interface TriggerMSRPListenerOptions {
    listenerType: string
    session: MSRPSessionExtended
    event?:  ListenerEventType
}
