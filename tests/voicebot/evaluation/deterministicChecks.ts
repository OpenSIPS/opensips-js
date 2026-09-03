import { z } from 'zod'

import type { EvaluationInput } from './types'

export interface DeterministicCheckResult {
    state: 'green' | 'red'
    note: string
}

export type DeterministicCheck = (
    config: Record<string, unknown>,
    input: EvaluationInput
) => DeterministicCheckResult

const maxCallSecondsConfigSchema = z.object({
    check: z.literal('max_call_seconds'),
    threshold: z.number().positive(),
})

const maxCallSeconds: DeterministicCheck = (config, input) => {
    const { threshold } = maxCallSecondsConfigSchema.parse(config)
    const durationSec = input.report.durationMs / 1000
    const passed = durationSec <= threshold

    return {
        state: passed ? 'green' : 'red',
        note: `call lasted ${durationSec.toFixed(1)}s, threshold ${threshold}s`,
    }
}

/**
 * Registry of deterministic checks (T5.1) — a new check is one entry here plus
 * its implementation, nothing else.
 */
const deterministicChecks: Record<string, DeterministicCheck> = {
    max_call_seconds: maxCallSeconds,
}

const checkNameSchema = z.object({ check: z.string().min(1) })

export function runDeterministicCheck (
    config: Record<string, unknown>,
    input: EvaluationInput
): DeterministicCheckResult {
    const { check } = checkNameSchema.parse(config)
    const implementation = deterministicChecks[check]

    if (!implementation) {
        throw new Error(`Unknown deterministic check "${check}"`)
    }

    return implementation(config, input)
}
