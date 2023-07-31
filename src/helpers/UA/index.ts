import { UA } from 'jssip'
import { CallOptionsExtended } from '@/types/rtc'
import { RTCSession } from 'jssip/lib/RTCSession'
import { MSRPSession } from '@/lib/msrp/session'

export default class UAExtended extends UA {
    call (target: string, options?: CallOptionsExtended): RTCSession {
        return super.call(target, options)
    }
    sendMSRPMessage (target: string, options: string): MSRPSession {
        const session = new MSRPSession(this)

        session.send(target, options)

        return session
    }
}