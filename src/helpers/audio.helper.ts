import { ICall, StreamMediaType, MediaEvent } from '@/types/rtc'
import { Writeable } from '@/types/generic'
import { IMessage } from '@/types/msrp'

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
    'localMuted'
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
    '_remote_identity'
]


export type ICallSimplified = Writeable<Pick<ICall, typeof CALL_KEYS_TO_INCLUDE[number]>>
export type IMessageSimplified = Writeable<Pick<IMessage, typeof MESSAGE_KEYS_TO_INCLUDE[number]>>

export function simplifyCallObject (call: ICall): ICallSimplified {
    const simplified: Partial<ICallSimplified> = {}

    CALL_KEYS_TO_INCLUDE.forEach(key => {
        if (call[key] !== undefined) {
            simplified[key] = call[key]
        }
    })

    simplified.localHold = call._localHold

    return simplified as ICallSimplified
}

export function simplifyMessageObject (call: IMessage): IMessageSimplified {
    const simplified: Partial<IMessageSimplified> = {}

    MESSAGE_KEYS_TO_INCLUDE.forEach(key => {
        if (call[key] !== undefined) {
            simplified[key] = call[key]
        }
    })

    return simplified as IMessageSimplified
}

export function processAudioVolume (stream: MediaStream, volume: number) {
    const audioContext = new AudioContext()
    const audioSource = audioContext.createMediaStreamSource(stream)
    const audioDestination = audioContext.createMediaStreamDestination()
    const gainNode = audioContext.createGain()
    audioSource.connect(gainNode)
    gainNode.connect(audioDestination)
    gainNode.gain.value = volume

    return audioDestination.stream
}

export function syncStream (event: MediaEvent, call: ICall, outputDevice: string, volume: number) {
    const audio = document.createElement('audio') as StreamMediaType

    audio.id = call._id
    audio.className = 'audioTag'
    audio.srcObject = event.stream
    audio.setSinkId(outputDevice)
    audio.volume = volume
    audio.play()
    call.audioTag = audio
}
