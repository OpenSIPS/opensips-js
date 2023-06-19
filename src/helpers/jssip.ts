// @ts-nocheck
import JsSIP, { UA } from 'jssip'
import {
    IncomingAckEvent,
    IncomingEvent,
    OutgoingAckEvent,
    OutgoingEvent
} from 'jssip/lib/RTCSession'
import { RTCSessionEvent, UAConfiguration, UAEventMap } from 'jssip/lib/UA'

export default JsSIP
export {
    UA,
    IncomingAckEvent,
    IncomingEvent,
    OutgoingAckEvent,
    OutgoingEvent,
    RTCSessionEvent,
    UAConfiguration,
    UAEventMap
}