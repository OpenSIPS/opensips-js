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
    _userTerminated?: boolean
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

/* ---------- MSRP conversation shape types (backend v3 - June 2026) ----------
 * These are the public data structures produced by MSRPModule at runtime and
 * consumed by external subscribers (Vue wrappers, tests, etc.). Kept in this
 * shipped `src/types/` file so they resolve cleanly for consumers without
 * needing internal module paths.
 */

export type MSRPMemberRole = 'in_charge' | 'manager' | 'assigned'
export type MSRPMembership = 'join' | 'leave' | 'invite' | 'ban'
export type MSRPMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface MSRPConversationState {
    /**
     * Public, stable numeric conversation identifier assigned by the backend.
     * This is the only identifier exposed to application code — conversations
     * are addressed exclusively by `conversation_id`.
     */
    conversation_id?: number
    creator: string | null
    members: Set<string>
    memberRoles: Map<string, MSRPMemberRole>
    currentUserRole: MSRPMemberRole
    currentUserStatus: MSRPMembership | null
    /**
     * Per-user read pointer (backend `last_read_message_id` in the current
     * user's member state). `null` means the whole conversation is unread;
     * an event_id means everything after that event is unread. Consumers
     * derive the unread count from this pointer + the local timeline.
     */
    currentUserLastReadMessageId?: string | null
    state_events: { [key: string]: { [stateKey: string]: any } }
    created_at: number
    updated_at: number
    status?: string
}

export interface MSRPUploadResult {
    upload_url: string
    expires_in?: number
    mime_type: string
    request_id: string
    filename?: string
    preview_url?: string
    icon_url?: string
    transcription?: string
    media_type?: string
}
