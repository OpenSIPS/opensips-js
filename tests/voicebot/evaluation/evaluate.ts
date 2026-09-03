import { z } from 'zod'

import type { Verdict } from '../schema/manifest.schema'
import { runDeterministicCheck } from './deterministicChecks'
import { judgeTranscript, type JudgeAnswer, type JudgeQuestion } from './llmJudge'
import type { EvaluationInput, EvaluationResult, VerdictResult, VerdictState } from './types'

const llmConfigSchema = z.object({
    question: z.string().min(1),
    answerType: z.literal('boolean'),
    expected: z.boolean(),
})

interface ParameterResult {
    state: VerdictState
    note: string
}

interface PendingLlmParameter {
    questionId: number
    expected: boolean
}

/**
 * Post-call evaluation (T5.1–T5.4):
 * - deterministic → check registry (timing is irrelevant post-call);
 * - llm (timing=end) → one judge call over the history;
 * - rabbit_event → honest "unchecked" stub (T5.3);
 * - roll-up per §6.2: any red non-optional ⇒ red; red optional ⇒ warning;
 *   harness failure ⇒ outcome "error", never red.
 */
export async function evaluate (
    verdicts: Verdict[],
    input: EvaluationInput,
    options: { model?: string } = {}
): Promise<EvaluationResult> {
    if (input.report.stopReason === 'error') {
        return {
            outcome: 'error',
            harnessError: 'the driver reported an error during the call — evidence is unreliable',
            verdictResults: verdicts.map((verdict) => ({
                verdictId: verdict.verdictId,
                name: verdict.name,
                state: 'unchecked',
                notes: [ 'not evaluated: harness error during the call' ],
            })),
        }
    }

    // Collect all judge questions first so the judge runs exactly once (T5.2).
    const judgeQuestions: JudgeQuestion[] = []
    const pendingLlm = new Map<string, PendingLlmParameter>()
    const configErrors = new Map<string, string>()

    verdicts.forEach((verdict, verdictIndex) => {
        verdict.parameters.forEach((parameter, parameterIndex) => {
            if (parameter.type !== 'llm' || parameter.timing !== 'end') {
                return
            }

            const key = `${verdictIndex}:${parameterIndex}`
            const parsed = llmConfigSchema.safeParse(parameter.config)

            if (!parsed.success) {
                configErrors.set(key, `invalid llm config: ${parsed.error.issues[0]?.message ?? 'parse failed'}`)
                return
            }

            const questionId = judgeQuestions.length + 1
            judgeQuestions.push({
                id: questionId,
                question: parsed.data.question,
            })
            pendingLlm.set(key, {
                questionId,
                expected: parsed.data.expected,
            })
        })
    })

    let judgeAnswers: Map<number, JudgeAnswer> = new Map()
    let harnessError: string | undefined

    try {
        judgeAnswers = await judgeTranscript(judgeQuestions, input.report.history, options.model)
    } catch (error) {
        harnessError = `LLM judge failed: ${error instanceof Error ? error.message : String(error)}`
    }

    const verdictResults: VerdictResult[] = verdicts.map((verdict, verdictIndex) => {
        const parameterResults = verdict.parameters.map((parameter, parameterIndex) =>
            evaluateParameter(parameter, `${verdictIndex}:${parameterIndex}`)
        )

        const state = aggregateStates(parameterResults.map((result) => result.state))

        const result: VerdictResult = {
            verdictId: verdict.verdictId,
            name: verdict.name,
            state,
            notes: parameterResults.map((parameterResult) => parameterResult.note),
        }

        if (verdict.isOptional) {
            result.warning = state === 'red'
        }

        if (verdict.isFinal) {
            // during-checks are not implemented, so a verdict can never stop the call early yet
            result.isFinalStop = false
        }

        return result
    })

    return {
        outcome: resolveOutcome(verdicts, verdictResults, harnessError),
        verdictResults,
        ...(harnessError ? { harnessError } : {}),
    }

    function evaluateParameter (parameter: Verdict['parameters'][number], key: string): ParameterResult {
        if (parameter.type === 'rabbit_event') {
            // T5.3: implementation is blocked on Rabbit/OpenSIPS event documentation.
            return {
                state: 'unchecked',
                note: 'rabbit_event checks are not implemented yet',
            }
        }

        if (parameter.type === 'deterministic') {
            try {
                const checkResult = runDeterministicCheck(parameter.config, input)

                return {
                    state: checkResult.state,
                    note: checkResult.note,
                }
            } catch (error) {
                return {
                    state: 'unchecked',
                    note: `deterministic check failed: ${error instanceof Error ? error.message : String(error)}`,
                }
            }
        }

        // llm
        if (parameter.timing !== 'end') {
            return {
                state: 'unchecked',
                note: 'llm checks with timing "during" are not implemented yet',
            }
        }

        const configError = configErrors.get(key)

        if (configError) {
            return {
                state: 'unchecked',
                note: configError,
            }
        }

        const pending = pendingLlm.get(key)
        const answer = pending ? judgeAnswers.get(pending.questionId) : undefined

        if (!pending || !answer) {
            return {
                state: 'unchecked',
                note: harnessError ?? 'judge produced no answer for this question',
            }
        }

        return {
            state: answer.answer === pending.expected ? 'green' : 'red',
            note: answer.reasoning,
        }
    }
}

function aggregateStates (states: VerdictState[]): VerdictState {
    if (states.includes('red')) {
        return 'red'
    }

    if (states.includes('unchecked')) {
        return 'unchecked'
    }

    return 'green'
}

function resolveOutcome (
    verdicts: Verdict[],
    verdictResults: VerdictResult[],
    harnessError: string | undefined
): EvaluationResult['outcome'] {
    if (harnessError) {
        return 'error'
    }

    const hasBlockingRed = verdictResults.some((result, index) =>
        result.state === 'red' && !verdicts[index].isOptional
    )

    return hasBlockingRed ? 'red' : 'green'
}
