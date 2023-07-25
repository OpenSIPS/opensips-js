import { EventEmitter } from 'events'
import { AnswerOptionsExtended } from '@/types/rtc'

export interface MSRPSession extends EventEmitter {
    id: string
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
    answer(options?: AnswerOptionsExtended): void
}