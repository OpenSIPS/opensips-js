import { z } from 'zod'

import { audioEffectsSchema } from './audioEffects.schema'

export const speakPayloadSchema = z.object({
    text: z.string().min(1)
        .describe('Exactly what to say, plain spoken words. No markdown.'),
    effects: audioEffectsSchema.optional()
        .describe('How this utterance sounds to the listener. Omit for a clean line.'),
})

export const hangupPayloadSchema = z.object({
    reason: z.string().min(1)
        .describe('Why you are hanging up — goes to the test report, never spoken.'),
})

export const waitPayloadSchema = z.object({
    durationMs: z.number().int()
        .positive()
        .describe('How long to stay silent and listen, in milliseconds.'),
})

export const sendDtmfPayloadSchema = z.object({
    digits: z.string().min(1)
        .describe('DTMF digits to send (0-9, *, #) for IVR navigation.'),
})

export type SpeakPayload = z.infer<typeof speakPayloadSchema>
export type HangupPayload = z.infer<typeof hangupPayloadSchema>
export type WaitPayload = z.infer<typeof waitPayloadSchema>
export type SendDtmfPayload = z.infer<typeof sendDtmfPayloadSchema>
