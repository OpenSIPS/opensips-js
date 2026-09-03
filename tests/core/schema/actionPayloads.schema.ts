import { z } from 'zod'

import type {
    ActionByActionType,
    ActionType,
    GetActionPayload,
} from '../types/actions'
import { speakPayloadSchema } from '../actions/schemas/runnerPayloads.schema'

type RequestOptions = NonNullable<GetActionPayload<ActionByActionType<'request'>>>['options']

export const registerPayloadSchema = z.object({
    sip_domain: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
})

export const dialPayloadSchema = z.object({
    target: z.string().min(1),
})

export const waitPayloadSchema = z.object({
    time: z.number(),
})

export const playSoundPayloadSchema = z.object({
    sound: z.string().min(1),
})

export const sendDtmfPayloadSchema = z.object({
    dtmf: z.string().min(1),
})

export const transferPayloadSchema = z.object({
    target: z.string().min(1),
})

export const changeRoomPayloadSchema = z.object({
    fromRoom: z.number(),
    toRoom: z.number(),
})

export const requestPayloadSchema = z.object({
    url: z.string().min(1),
    options: z.custom<RequestOptions>(
        (value) => value === undefined || (typeof value === 'object' && value !== null),
        'request options must be an object'
    ),
})

export const textToSpeechPayloadSchema = z.object({
    text: z.string().min(1),
})

/**
 * Payload schema per declarative action type (SSOT with the payload interfaces
 * in types/actions.ts: the mapped type below fails to compile on any drift).
 * Actions without payload have no entry here — and must never be parsed.
 */
export const declarativePayloadSchemas: {
    [K in ActionType]?: z.ZodType<NonNullable<GetActionPayload<ActionByActionType<K>>>>
} = {
    register: registerPayloadSchema,
    dial: dialPayloadSchema,
    wait: waitPayloadSchema,
    playSound: playSoundPayloadSchema,
    sendDTMF: sendDtmfPayloadSchema,
    transfer: transferPayloadSchema,
    changeRoom: changeRoomPayloadSchema,
    request: requestPayloadSchema,
    textToSpeech: textToSpeechPayloadSchema,
}

export function parseDeclarativePayload<T extends ActionType> (
    actionType: T,
    payload: unknown
): NonNullable<GetActionPayload<ActionByActionType<T>>> {
    const schema = declarativePayloadSchemas[actionType]

    if (!schema) {
        throw new Error(`No payload schema registered for action "${actionType}"`)
    }

    return schema.parse(payload)
}

export { speakPayloadSchema }
