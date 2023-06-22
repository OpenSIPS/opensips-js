import { UA } from 'jssip'
import { CallOptionsExtended } from '@/types/rtc'
import { RTCSession } from 'jssip/lib/RTCSession'

export default class UAExtended extends UA {
    call (target: string, options?: CallOptionsExtended): RTCSession {
        return super.call(target, options)
    }
}