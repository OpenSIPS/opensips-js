import TestScenariosBuilder from '../../services/TestScenariosBuilder'
import ScenarioManager from '../../services/ScenarioManager'
import type { SpeechProviderInput } from '../../services/speech/BaseSpeechProvider'
import type { TestScenarios } from '../../types/intex'
import type { GetActionDefinition, RegisterAction, RequestAction } from '../../types/actions'

/**
 * What the JSON version CANNOT do (and this file demonstrates):
 *   - `authAndRegister()` is a reusable helper that builds the shared
 *     login + get-settings + register sequence for both parties. In JSON this
 *     block has to be copy-pasted for every participant.
 *   - `customerPhrase` is a single source of truth: the same constant drives
 *     what the customer says AND what the post-run assertion checks. JSON forces
 *     you to hard-code (and keep in sync) magic strings in multiple places.
 *   - `run()` is overridden to perform REAL validation logic after the call:
 *     it normalises the transcript, checks the key phrase ("participant 1") is
 *     present, and computes a Levenshtein similarity score against what the
 *     customer actually said, failing the test below a threshold. JSON's
 *     `expect` can only do literal WebSocket/response matching — none of this.
 *   - HOLD TIMING: participant 1 puts the call on hold for ~3s and resumes.
 *     `run()` measures the real hold duration live, injects a human-readable
 *     `hold_duration_text` back into the shared context, and participant 2 then
 *     SPEAKS it ("The hold lasted 3 seconds and N milliseconds"). Measuring an
 *     elapsed interval and feeding the computed value back into the running
 *     scenario is impossible in a static JSON scenario.
 */
export default class TtsSttJsScenario extends TestScenariosBuilder {
    private static readonly LOGIN_URL = 'https://loginapi.voicenter.com/Auth/Login/Voicenter/Chrome'
    private static readonly SETTINGS_URL = 'https://loginapi.voicenter.com/Application/GetSettings'

    // Single source of truth for the phrase the customer speaks. Referenced both
    // in the scenario definition and in the post-run assertion (see `run()`).
    private readonly customerPhrase = 'Hello, I am participant 1'

    // Minimum acceptable Levenshtein similarity (0..1) between what the customer
    // said and what STT transcribed. Below this the run is considered a failure.
    private readonly minSimilarity = 0.7

    // How long participant 1 keeps the call on hold, and the tolerance within
    // which the independently measured hold duration is expected to land.
    private readonly holdMs = 3000
    private readonly holdToleranceMs = 2000

    getInitialContext () {
        return {}
    }

    private authAndRegister (opts: {
        emailKey: string
        passwordKey: string
        loginContextKey: string
        settingsContextKey: string
        registeredEvent: string
        waitForBeforeLogin?: string
    }): [
        GetActionDefinition<RequestAction>,
        GetActionDefinition<RequestAction>,
        GetActionDefinition<RegisterAction>
    ] {
        return [
            this.request({
                payload: {
                    url: TtsSttJsScenario.LOGIN_URL,
                    options: {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        data: {
                            email: `{{${opts.emailKey}}}`,
                            password: `{{${opts.passwordKey}}}`
                        }
                    }
                },
                responseToContext: {
                    setToContext: true,
                    contextKeyToSet: opts.loginContextKey
                },
                ...(opts.waitForBeforeLogin
                    ? { waitUntil: [ { event: opts.waitForBeforeLogin } ] }
                    : {})
            }),
            this.request({
                payload: {
                    url: TtsSttJsScenario.SETTINGS_URL,
                    options: {
                        method: 'GET',
                        headers: {
                            Authorization: `Bearer {{${opts.loginContextKey}.response.Data.AccessToken}}`
                        }
                    }
                },
                responseToContext: {
                    setToContext: true,
                    contextKeyToSet: opts.settingsContextKey
                }
            }),
            this.register({
                payload: {
                    sip_domain: `{{${opts.settingsContextKey}.response.WebRTCData.domain}}`,
                    username: `{{${opts.settingsContextKey}.response.WebRTCData.extension_user}}`,
                    password: `{{${opts.settingsContextKey}.response.WebRTCData.extension_pass}}`
                },
                customSharedEvent: opts.registeredEvent
            })
        ]
    }

    async init (): Promise<TestScenarios> {
        return [
            this.createScenario('customer', [
                this.on('ready', [
                    ...this.authAndRegister({
                        emailKey: 'CALLER.API.EMAIL',
                        passwordKey: 'CALLER.API.PASSWORD',
                        loginContextKey: 'caller_login_api_response',
                        settingsContextKey: 'caller_get_settings_api_response',
                        registeredEvent: 'caller_registered',
                        // Do not dial until the representative is registered.
                        waitForBeforeLogin: 'callee_registered'
                    }),
                    this.dial({
                        payload: { target: '36' },
                        customSharedEvent: 'call_initiated'
                    })
                ]),
                this.on('callee_listening', [
                    this.textToSpeech({
                        payload: { text: this.customerPhrase },
                        customSharedEvent: 'customer_spoke'
                    }),
                    // Wait until the representative has quoted us back, then put
                    // the call on hold for `holdMs`, then resume. `responseToContext`
                    // stamps a marker into the shared context at the exact moment
                    // hold/unhold complete — `run()` reads those markers to measure
                    // the real hold duration.
                    this.wait({
                        payload: { time: 500 },
                        waitUntil: [ { event: 'representative_replied', timeout: 20000 } ]
                    }),
                    this.hold({
                        customSharedEvent: 'hold_started',
                        responseToContext: { setToContext: true, contextKeyToSet: 'hold_start_marker' }
                    }),
                    this.wait({ payload: { time: this.holdMs } }),
                    this.unhold({
                        customSharedEvent: 'hold_ended',
                        responseToContext: { setToContext: true, contextKeyToSet: 'hold_end_marker' }
                    }),
                    this.wait({
                        payload: { time: 1000 },
                        waitUntil: [ { event: 'callEnded', timeout: 30000 } ]
                    }),
                    this.unregister({})
                ] as never)
            ]),

            this.createScenario('representative', [
                this.on('ready', this.authAndRegister({
                    emailKey: 'CALLEE.API.EMAIL',
                    passwordKey: 'CALLEE.API.PASSWORD',
                    loginContextKey: 'callee_login_api_response',
                    settingsContextKey: 'callee_get_settings_api_response',
                    registeredEvent: 'callee_registered'
                })),

                this.on('incoming', [
                    this.answer({}),
                    this.startTranscription({ customSharedEvent: 'callee_listening' }),
                    this.wait({
                        payload: { time: 3000 },
                        waitUntil: [
                            { event: 'textChunk', timeout: 20000 },
                            { event: 'customer_spoke', timeout: 20000 }
                        ]
                    }),
                    this.stopTranscription({}),
                    this.textToSpeech({
                        payload: { text: "Participant one said: '{{transcript}}'" },
                        customSharedEvent: 'representative_replied'
                    }),
                    // Wait until participant 1 has finished the hold cycle. `run()`
                    // measures the hold and writes `hold_duration_text` to context;
                    // the small buffer wait guarantees it is present before we quote it.
                    this.wait({
                        payload: { time: 1000 },
                        waitUntil: [ { event: 'hold_ended', timeout: 20000 } ]
                    }),
                    this.textToSpeech({
                        payload: { text: 'The hold lasted {{hold_duration_text}}' },
                        customSharedEvent: 'hold_announced'
                    }),
                    this.hangup({}),
                    this.unregister({})
                ] as never)
            ])
        ]
    }

    /**
     * Overrides the base runner to add JS-only orchestration and validation.
     *
     * NOTE on timing: `runScenarios()` resolves as soon as the scenarios are set
     * up — the actual call then proceeds asynchronously via the event bus. So we
     * run a monitor loop that, WHILE the call is live, (1) measures the hold
     * duration from the markers participant 1 stamps into the context and injects
     * a human-readable `hold_duration_text` back into the context (which the
     * representative then speaks), and (2) tracks the transcript until it settles.
     * Neither the live measurement/injection nor the assertions below can be
     * expressed in a static JSON scenario.
     */
    async run (speechProvider?: SpeechProviderInput): Promise<void> {
        const scenarios = await this.init()

        const manager = new ScenarioManager(
            scenarios,
            {
                ...this.getEnvContext(),
                ...this.getInitialContext()
            },
            speechProvider ?? this.speechProvider
        )

        await manager.runScenarios()

        const { transcript, holdMs } = await this.monitorCall(manager, {
            timeoutMs: 90000,
            transcriptStableMs: 2500,
            pollMs: 25
        })

        this.assertTranscript(transcript)
        this.assertHold(holdMs)
    }

    /**
     * Runs alongside the live call. Measures the hold duration by timing the
     * appearance of the `hold_start_marker` / `hold_end_marker` context markers
     * (stamped by participant 1's hold/unhold), writes `hold_duration_text` back
     * into the context so the representative can speak it, and tracks the
     * transcript until it stops changing. Resolves once both the transcript has
     * settled and the hold has been measured, or on timeout.
     */
    private async monitorCall (
        manager: ScenarioManager,
        options: { timeoutMs: number, transcriptStableMs: number, pollMs: number }
    ): Promise<{ transcript: string, holdMs: number | null }> {
        const start = Date.now()

        let transcript = ''
        let transcriptChangedAt = Date.now()
        let transcriptStable = false

        let holdStartAt: number | null = null
        let holdEndAt: number | null = null
        let holdInjected = false

        while (Date.now() - start < options.timeoutMs) {
            const context = manager.getContext()

            // --- Hold measurement (record wall-clock when each marker appears) ---
            if (holdStartAt === null && context.hold_start_marker) {
                holdStartAt = Date.now()
            }
            if (holdStartAt !== null && holdEndAt === null && context.hold_end_marker) {
                holdEndAt = Date.now()
            }
            if (holdStartAt !== null && holdEndAt !== null && !holdInjected) {
                const measured = holdEndAt - holdStartAt
                manager.updateContext({
                    hold_duration_ms: measured,
                    hold_duration_text: this.formatDuration(measured)
                })
                holdInjected = true
            }

            // --- Transcript stability tracking ---
            const current = (context.transcript as string | undefined) ?? ''
            if (current !== transcript) {
                transcript = current
                transcriptChangedAt = Date.now()
            }
            if (current && Date.now() - transcriptChangedAt >= options.transcriptStableMs) {
                transcriptStable = true
            }

            if (transcriptStable && holdInjected) {
                break
            }

            await new Promise(resolve => setTimeout(resolve, options.pollMs))
        }

        return {
            transcript,
            holdMs: holdStartAt !== null && holdEndAt !== null ? holdEndAt - holdStartAt : null
        }
    }

    /** Formats a millisecond duration as e.g. "3 seconds and 42 milliseconds". */
    private formatDuration (ms: number): string {
        const seconds = Math.floor(ms / 1000)
        const milliseconds = ms % 1000
        return `${seconds} seconds and ${milliseconds} milliseconds`
    }

    /**
     * Validates that the independently measured hold duration is close to the
     * requested `holdMs` (i.e. hold/unhold actually happened and lasted ~3s).
     */
    private assertHold (measuredMs: number | null): void {
        console.log('──────── Hold assertions (JS-only) ────────')
        if (measuredMs === null) {
            console.log('Measured hold : (none — markers never appeared)')
            console.log('Result        : ❌ FAILED — hold/unhold was not observed')
            console.log('─────────────────────────────────────────────────\n')
            process.exitCode = 1
            throw new Error('Hold assertion failed: hold/unhold was not observed')
        }

        const lower = this.holdMs - this.holdToleranceMs
        const upper = this.holdMs + this.holdToleranceMs
        const withinRange = measuredMs >= lower && measuredMs <= upper

        console.log(`Requested hold : ${this.formatDuration(this.holdMs)}`)
        console.log(`Measured hold : ${this.formatDuration(measuredMs)} (${measuredMs}ms)`)
        console.log(`Within ${lower}-${upper}ms : ${withinRange ? '✅' : '❌'}`)

        if (!withinRange) {
            console.log('Result        : ❌ FAILED — measured hold is outside the accepted range')
            console.log('─────────────────────────────────────────────────\n')
            process.exitCode = 1
            throw new Error(`Hold assertion failed: measured ${measuredMs}ms is outside ${lower}-${upper}ms`)
        }

        console.log('Result        : ✅ PASSED')
        console.log('─────────────────────────────────────────────────\n')
    }

    /**
     * Validates what STT captured against what the customer actually said.
     * Throws on failure so the run can be treated as failed by a CI wrapper.
     */
    private assertTranscript (transcript: string): void {
        const spoken = this.normalize(this.customerPhrase)
        const heard = this.normalize(transcript)

        const hasKeyPhrase = heard.includes('participant 1')
        const similarity = this.similarity(spoken, heard)

        console.log('\n──────── Transcript assertions (JS-only) ────────')
        console.log(`Customer said : "${this.customerPhrase}"`)
        console.log(`STT heard     : "${transcript}"`)
        console.log(`Key phrase "participant 1" present : ${hasKeyPhrase ? '✅' : '❌'}`)
        console.log(`Similarity : ${(similarity * 100).toFixed(1)}% (threshold ${(this.minSimilarity * 100).toFixed(0)}%) ${similarity >= this.minSimilarity ? '✅' : '❌'}`)

        const failures: string[] = []
        if (!heard) {
            failures.push('transcript is empty (STT produced nothing)')
        }
        if (!hasKeyPhrase) {
            failures.push('expected key phrase "participant 1" was not found')
        }
        if (similarity < this.minSimilarity) {
            failures.push(`similarity ${(similarity * 100).toFixed(1)}% is below the ${(this.minSimilarity * 100).toFixed(0)}% threshold`)
        }

        if (failures.length) {
            console.log(`Result        : ❌ FAILED — ${failures.join('; ')}`)
            console.log('─────────────────────────────────────────────────\n')
            // Surface the failure to CI even though test.ts swallows exceptions.
            process.exitCode = 1
            throw new Error(`Transcript assertion failed: ${failures.join('; ')}`)
        }

        console.log('Result        : ✅ PASSED')
        console.log('─────────────────────────────────────────────────\n')
    }

    /** Lowercase, strip punctuation, collapse whitespace for robust comparison. */
    private normalize (text: string): string {
        return text
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim()
    }

    /** Levenshtein-based similarity ratio in the 0..1 range. */
    private similarity (a: string, b: string): number {
        if (!a && !b) {
            return 1
        }
        const distance = this.levenshtein(a, b)
        return 1 - distance / Math.max(a.length, b.length)
    }

    /** Classic Levenshtein edit distance between two strings. */
    private levenshtein (a: string, b: string): number {
        const rows = a.length + 1
        const cols = b.length + 1
        const matrix: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0))

        for (let i = 0; i < rows; i++) {
            matrix[i][0] = i
        }
        for (let j = 0; j < cols; j++) {
            matrix[0][j] = j
        }

        for (let i = 1; i < rows; i++) {
            for (let j = 1; j < cols; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                )
            }
        }

        return matrix[rows - 1][cols - 1]
    }
}
