import { readFile } from 'fs/promises'
import { resolve } from 'path'

import { z } from 'zod'

import { audioEffectsSchema } from '../../core/actions/schemas/audioEffects.schema'

const verdictParameterSchema = z.object({
    type: z.enum([ 'llm', 'deterministic', 'rabbit_event' ]),
    timing: z.enum([ 'end', 'during' ]),
    config: z.record(z.string(), z.unknown()),
})

export const verdictSchema = z.object({
    verdictId: z.number().int(),
    name: z.string().min(1),
    isFinal: z.boolean(),
    isOptional: z.boolean(),
    parameters: z.array(verdictParameterSchema).min(1),
})

export const manifestSchema = z.object({
    testRunId: z.number().int(),
    target: z.object({
        botId: z.number().nullable(),
        botVersionId: z.number().nullable(),
        dial: z.string().min(1),
    }),
    driverContext: z.object({
        personaInstruction: z.string().min(1),
        goalText: z.string().min(1),
    }),
    language: z.object({
        code: z.string().min(1),
        ttsVoice: z.string().nullable(),
    }),
    antiLoop: z.object({
        maxDurationSec: z.number().int().positive(),
        maxIntentRepetitions: z.number().int().nonnegative(),
    }),
    /** Outgoing caller audio effects applied to every speak unless overridden per utterance. */
    outgoingAudioEffects: audioEffectsSchema,
    verdicts: z.array(verdictSchema),
})

export type Manifest = z.infer<typeof manifestSchema>
export type Verdict = z.infer<typeof verdictSchema>

export async function loadManifest (filePath: string): Promise<Manifest> {
    const absolutePath = resolve(filePath)
    const raw = await readFile(absolutePath, 'utf8')
    const json: unknown = JSON.parse(raw)

    return manifestSchema.parse(json)
}
