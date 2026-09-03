import type { WebRTCMetricsReport } from '../../core/session/types'
import type { DriverReport } from '../driver/types'

export type VerdictState = 'green' | 'red' | 'unchecked'

/**
 * Error ≠ Fail (RUNNER-TASKS §6.2): "error" means the harness could not obtain
 * evidence (SIP failure, dead TTS, judge API failure) — it never collapses
 * into "the bot is bad".
 */
export type RunOutcome = 'green' | 'red' | 'error'

export interface VerdictResult {
    verdictId: number
    name: string
    state: VerdictState
    /** Present on optional verdicts: a red optional verdict warns, never fails the run. */
    warning?: boolean
    /** Present on isFinal verdicts: whether this verdict stopped the call early. */
    isFinalStop?: boolean
    /** One short explanation per evaluated parameter (judge reasoning, check notes). */
    notes: string[]
}

export interface EvaluationInput {
    report: DriverReport
    metrics: WebRTCMetricsReport
}

export interface EvaluationResult {
    outcome: RunOutcome
    verdictResults: VerdictResult[]
    /** Present when outcome is "error" — why the harness could not produce evidence. */
    harnessError?: string
}
