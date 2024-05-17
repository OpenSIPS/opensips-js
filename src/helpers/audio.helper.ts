import { ICall, StreamMediaType, MediaEvent, CustomLoggerType } from '@/types/rtc'
import { Writeable } from '@/types/generic'
import { IMessage } from '@/types/msrp'
import audioContext from '@/helpers/audioContext'

type ICallKey = keyof ICall
const CALL_KEYS_TO_INCLUDE: Array<ICallKey> = [
    'roomId',
    '_audioMuted',
    '_cancel_reason',
    '_contact',
    'direction',
    '_end_time',
    '_eventsCount',
    '_from_tag',
    '_id',
    '_is_canceled',
    '_is_confirmed',
    '_late_sdp',
    '_localHold',
    '_videoMuted',
    'status',
    'start_time',
    '_remote_identity',
    'audioTag',
    //'audioQuality',
    'isOnHold',
    //'originalStream',
    'localMuted',
    'autoAnswer'
]
type IMessageKey = keyof IMessage
const MESSAGE_KEYS_TO_INCLUDE: Array<IMessageKey> = [
    //'roomId',
    '_cancel_reason',
    '_contact',
    'direction',
    '_end_time',
    '_eventsCount',
    '_from_tag',
    '_id',
    '_is_canceled',
    '_is_confirmed',
    '_late_sdp',
    'status',
    'start_time',
    '_remote_identity',
    'target_addr'
]


export type ICallSimplified = Writeable<Pick<ICall, typeof CALL_KEYS_TO_INCLUDE[number]>>
export type IMessageSimplified = Writeable<Pick<IMessage, typeof MESSAGE_KEYS_TO_INCLUDE[number]>>

export function simplifyCallObject (call: ICall): ICallSimplified {
    const simplified: Partial<{ [key in keyof ICallSimplified]: ICallSimplified[keyof ICallSimplified] }> = {}

    CALL_KEYS_TO_INCLUDE.forEach(key => {
        if (call[key] !== undefined) {
            simplified[key] = call[key]
        }
    })

    simplified.localHold = call._localHold

    return simplified as ICallSimplified
}

export function simplifyMessageObject (call: IMessage): IMessageSimplified {
    const simplified: Partial<{ [key in keyof IMessageSimplified]: IMessageSimplified[keyof IMessageSimplified] }> = {}

    MESSAGE_KEYS_TO_INCLUDE.forEach(key => {
        if (call[key] !== undefined) {
            simplified[key] = call[key]
        }
    })

    return simplified as IMessageSimplified
}

export function processAudioVolume (stream: MediaStream, volume: number) {
    // volume should be in range from 0 to 2
    const audioSource = audioContext.createMediaStreamSource(stream)
    const audioDestination = audioContext.createMediaStreamDestination()
    const gainNode = audioContext.createGain()
    audioSource.connect(gainNode)
    gainNode.connect(audioDestination)
    gainNode.gain.value = volume

    return audioDestination.stream
}

export function syncStream (stream: MediaStream, call: ICall, outputDevice: string, volume: number) {
    const audio = document.createElement('audio') as StreamMediaType

    audio.id = call._id
    audio.className = 'audioTag'
    audio.srcObject = stream
    audio.setSinkId(outputDevice)
    audio.volume = volume
    audio.play()
    call.audioTag = audio
}

export function isLoggerCompatible (logger: CustomLoggerType) {
    if (logger
      && typeof logger.log === 'function'
      && typeof logger.warn === 'function'
      && typeof logger.error === 'function'
    ) {
        return true
    }
}
