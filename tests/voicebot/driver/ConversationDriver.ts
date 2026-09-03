import { APICallError, generateText, type ModelMessage, type TypedToolCall } from 'ai'
import type { createAnthropic } from '@ai-sdk/anthropic'
import type { Page } from 'playwright'

import { createVoicebotAnthropic, DEFAULT_VOICEBOT_MODEL } from '../llm/anthropicClient'
import { coreActions, coreActionTools } from '../../core/actions/coreActions'
import type { ActionContext } from '../../core/actions/ActionContext'
import { ConnectionImpairment } from '../../core/services/ConnectionImpairment'
import type { SpeechProvider, TtsStream } from '../../core/services/speech/BaseSpeechProvider'
import { hasAudioEffects, mergeAudioEffects } from '../../core/session/speakHelpers'
import type { ActiveCall, AudioEffects, ClipPlaybackStatus, PlayingClip, SpeakPayload, Unsubscribe } from '../../core/session/types'

import type {
    ConversationDriverOptions,
    DriverReport,
    DriverState,
    DriverStopReason,
    HistoryMessage,
} from './types'

const DEFAULT_SILENCE_MS = 4000
// With Soniox endpoint detection a FINAL transcript already means "the speaker
// stopped" — this is only a small debounce on top, not a second silence window.
const DEFAULT_UTTERANCE_END_MS = 500
const DEFAULT_BARGE_IN_CONFIRM_MS = 400
const SILENCE_EVENT = '[4s of silence]'
const INTERRUPTED_MARKER = '[interrupted]'

/** The slice of CallSession the driver actually uses (structural, fakeable in unit tests). */
export interface DriverSessionDeps {
    getPage (): Page
    getActionsExecutor (): { synthesizeToDataUrl (text: string): Promise<string> }
}

/** One LLM turn: history in, tool calls out. Injectable so the turn machine is unit-testable. */
export type GenerateTurn = (args: {
    system: string
    messages: ModelMessage[]
    abortSignal: AbortSignal
}) => Promise<TypedToolCall<typeof coreActionTools>[]>

export interface ConversationDriverConfig extends ConversationDriverOptions {
    call: ActiveCall
    session: DriverSessionDeps
    speech: SpeechProvider
    prompt: string
    hardStopSec: number
    /** Default outgoing audio effects for every caller utterance. */
    defaultSpeechEffects?: AudioEffects
    /** Unit-test seam; defaults to generateText over coreActionTools. */
    generateTurn?: GenerateTurn
}

export class ConversationDriver {
    private readonly call: ActiveCall
    private readonly session: DriverSessionDeps
    private readonly speech: SpeechProvider
    private readonly prompt: string
    private readonly hardStopMs: number
    private readonly silenceMs: number
    private readonly utteranceEndMs: number
    private readonly bargeInConfirmMs: number
    private readonly model: string
    private readonly defaultSpeechEffects?: AudioEffects

    private outgoingImpairment: ConnectionImpairment | null = null

    private readonly history: HistoryMessage[] = []
    private readonly llmMessages: ModelMessage[] = []
    private readonly logEntries: Record<string, unknown>[] = []

    private state: DriverState = 'listening'
    private terminated = false
    private hardStopTriggered = false
    private stopReason: DriverStopReason = 'remoteEnded'

    private botUtterance = ''
    private silenceTimer: ReturnType<typeof setTimeout> | null = null
    private hardStopTimer: ReturnType<typeof setTimeout> | null = null

    private abortController: AbortController | null = null
    private currentClip: PlayingClip | null = null

    /**
     * Turn ownership token: every turn captures the epoch at its start;
     * barge-in, hard stop and teardown increment it, so a stale (zombie) turn
     * dies at its next checkpoint instead of speaking over a newer turn.
     */
    private turnEpoch = 0

    /**
     * What each speak actually did on the wire, keyed by its turn epoch — a
     * zombie turn whose synthesis finishes late must read ITS OWN outcome,
     * never the outcome of a newer turn.
     */
    private readonly speakOutcomes = new Map<number, ClipPlaybackStatus | 'not-played'>()

    private bargeTimer: ReturnType<typeof setTimeout> | null = null
    private bargeStartTs = 0
    private bargeTokenCount = 0
    private bargeText = ''

    private stopCapture: Unsubscribe | null = null
    private stopTranscript: Unsubscribe | null = null

    private startedAtMs = Date.now()
    private endedAtMs: number | null = null

    private anthropicClient: ReturnType<typeof createAnthropic> | null = null

    private readonly actionCall: ActiveCall
    private readonly generateTurn: GenerateTurn

    private readonly defaultGenerateTurn: GenerateTurn = async ({ system, messages, abortSignal }) => {
        const result = await generateText({
            model: this.getAnthropicClient()(this.model),
            system,
            tools: coreActionTools,
            // toolChoice 'required' forbids zero tool calls;
            // disableParallelToolUse forbids more than one — together they
            // enforce exactly one action per turn at the API level.
            toolChoice: 'required',
            providerOptions: {
                anthropic: {
                    disableParallelToolUse: true,
                },
            },
            messages,
            abortSignal,
        })

        return result.toolCalls
    }

    constructor (config: ConversationDriverConfig) {
        this.call = config.call
        this.session = config.session
        this.speech = config.speech
        this.prompt = config.prompt
        this.hardStopMs = config.hardStopSec * 1000
        this.silenceMs = config.silenceMs ?? DEFAULT_SILENCE_MS
        this.utteranceEndMs = config.utteranceEndMs ?? DEFAULT_UTTERANCE_END_MS
        this.bargeInConfirmMs = config.bargeInConfirmMs ?? DEFAULT_BARGE_IN_CONFIRM_MS
        this.model = config.model ?? DEFAULT_VOICEBOT_MODEL
        this.defaultSpeechEffects = config.defaultSpeechEffects
        this.generateTurn = config.generateTurn ?? this.defaultGenerateTurn

        this.actionCall = this.createActionCallFacade()
    }

    public report (): DriverReport {
        const endedAt = this.endedAtMs ?? Date.now()

        return {
            history: [ ...this.history ],
            stopReason: this.stopReason,
            hardStopTriggered: this.hardStopTriggered,
            logEntries: [ ...this.logEntries ],
            startedAt: new Date(this.startedAtMs).toISOString(),
            endedAt: new Date(endedAt).toISOString(),
            durationMs: endedAt - this.startedAtMs,
        }
    }

    /**
     * Runs until the call ends (hangup, hard stop, or remote BYE).
     */
    public async run (): Promise<DriverReport> {
        this.startedAtMs = Date.now()
        await this.start()

        try {
            await this.call.ended
        } finally {
            this.endedAtMs = Date.now()
            await this.stop()
        }

        return this.report()
    }

    private async start (): Promise<void> {
        this.hardStopTimer = setTimeout(() => {
            void this.triggerHardStop()
        }, this.hardStopMs)

        if (hasAudioEffects(this.defaultSpeechEffects)) {
            this.outgoingImpairment = new ConnectionImpairment(this.session.getPage())
            await this.outgoingImpairment.installOutgoing()
            await this.applyOutgoingEffects(this.defaultSpeechEffects)
        }

        await this.speech.startRecording()

        this.stopCapture = this.call.audio.captureRemote((chunk) => {
            void this.speech.writeAudioChunk(chunk).catch((error) => {
                console.error('[ConversationDriver] writeAudioChunk failed:', error)
            })
        })

        this.stopTranscript = this.speech.onTranscript((text, isFinal) => {
            this.onBotSpeech(text, Boolean(isFinal))
        })

        this.scheduleTurn(this.silenceMs)
    }

    private async stop (): Promise<void> {
        // Invalidate any in-flight turn so it cannot reschedule after teardown.
        this.turnEpoch++

        if (this.hardStopTimer) {
            clearTimeout(this.hardStopTimer)
            this.hardStopTimer = null
        }

        this.clearSilenceTimer()
        this.resetBargeState()
        this.abortController?.abort()
        this.currentClip?.stop()

        this.stopCapture?.()
        this.stopCapture = null
        this.stopTranscript?.()
        this.stopTranscript = null

        try {
            await this.speech.stopRecording()
        } catch (error) {
            console.error('[ConversationDriver] stopRecording failed:', error)
        }

        if (this.outgoingImpairment) {
            await this.outgoingImpairment.clearOutgoing()
            this.outgoingImpairment = null
        }
    }

    private async applyOutgoingEffects (effects: AudioEffects): Promise<void> {
        if (!this.outgoingImpairment) {
            return
        }

        if (effects.volume !== undefined) {
            await this.outgoingImpairment.setVolume(effects.volume)
        }
        if (effects.noise !== undefined) {
            await this.outgoingImpairment.addNoise(effects.noise)
        }
        if (effects.packetLoss !== undefined) {
            await this.outgoingImpairment.setPacketLoss(effects.packetLoss)
        }
    }

    private createActionCallFacade (): ActiveCall {
        return {
            hangup: () => this.call.hangup(),
            sendDTMF: (digits) => this.call.sendDTMF(digits),
            hold: () => this.call.hold(),
            unhold: () => this.call.unhold(),
            transfer: (target) => this.call.transfer(target),
            speak: (payload) => this.performSpeak(payload),
            audio: this.call.audio,
            ended: this.call.ended,
        }
    }

    private onBotSpeech (text: string, isFinal: boolean): void {
        if (this.terminated || text.trim().length === 0) {
            return
        }

        if (this.state === 'thinking' || this.state === 'speaking') {
            this.registerBargeInSpeech(text, isFinal)
            return
        }

        if (isFinal) {
            this.botUtterance += text
            this.scheduleTurn(this.utteranceEndMs)
            return
        }

        // Interim transcript — the bot is still mid-sentence; keep the long window.
        this.scheduleTurn(this.silenceMs)
    }

    private registerBargeInSpeech (text: string, isFinal: boolean, now = Date.now()): void {
        if (text.trim().length === 0) {
            return
        }

        if (this.bargeStartTs === 0) {
            this.bargeStartTs = now
            this.bargeTimer = setTimeout(() => {
                void this.triggerBargeIn()
            }, this.bargeInConfirmMs)
        }

        this.bargeTokenCount += 1
        if (isFinal) {
            this.bargeText += text
        }
    }

    private async triggerBargeIn (): Promise<void> {
        this.bargeTimer = null

        if (this.state !== 'thinking' && this.state !== 'speaking') {
            this.resetBargeState()
            return
        }

        if (this.bargeTokenCount < 2) {
            this.resetBargeState()
            return
        }

        console.log('[ConversationDriver] Barge-in — aborting current turn')
        this.turnEpoch++
        this.abortController?.abort()
        this.currentClip?.stop()

        const carried = this.bargeText.trim()
        this.resetBargeState()
        this.state = 'listening'
        this.botUtterance = carried

        // Re-arm unconditionally: even when only interim transcripts confirmed
        // the barge (carried is empty), silence afterwards must still produce a
        // turn. Carried text is a completed utterance — take the fast path.
        this.scheduleTurn(carried ? this.utteranceEndMs : this.silenceMs)
    }

    private resetBargeState (): void {
        if (this.bargeTimer) {
            clearTimeout(this.bargeTimer)
            this.bargeTimer = null
        }
        this.bargeStartTs = 0
        this.bargeTokenCount = 0
        this.bargeText = ''
    }

    private scheduleTurn (delayMs: number): void {
        if (this.terminated || this.state !== 'listening') {
            return
        }

        this.clearSilenceTimer()
        this.silenceTimer = setTimeout(() => {
            void this.finalizeTurn()
        }, delayMs)
    }

    private clearSilenceTimer (): void {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer)
            this.silenceTimer = null
        }
    }

    private async finalizeTurn (): Promise<void> {
        this.clearSilenceTimer()

        if (this.terminated || this.state !== 'listening') {
            return
        }

        const epoch = ++this.turnEpoch
        const abortController = new AbortController()
        this.abortController = abortController

        const botText = this.botUtterance.trim()
        const userContent = botText || SILENCE_EVENT

        this.botUtterance = ''
        this.state = 'thinking'

        this.pushHistory('assistant', userContent)
        console.log('[ConversationDriver] Turn input:', userContent)

        try {
            const toolCalls = await this.generateTurn({
                system: this.prompt,
                messages: this.llmMessages,
                abortSignal: abortController.signal,
            })

            if (epoch !== this.turnEpoch) {
                return // barged in or torn down while thinking — this turn is stale
            }

            const [ toolCall, ...extraToolCalls ] = toolCalls

            if (!toolCall) {
                throw new Error('LLM did not return a tool call')
            }

            if (extraToolCalls.length > 0) {
                // One action per turn (RUNNER-TASKS §5.2) — execute the first, report the rest.
                console.warn(
                    '[ConversationDriver] LLM returned multiple tool calls, executing only the first:',
                    toolCalls.map((call) => call.toolName)
                )
                this.logEntries.push({
                    type: 'multipleToolCalls',
                    toolNames: toolCalls.map((call) => call.toolName),
                })
            }

            console.log('[ConversationDriver] LLM action:', toolCall.toolName, toolCall.input)

            await this.executeToolCall(toolCall)
        } catch (error) {
            if (epoch !== this.turnEpoch || this.isAbortError(error)) {
                return
            }

            if (APICallError.isInstance(error)) {
                console.error(
                    `[ConversationDriver] turn failed: ${error.statusCode} ${error.message} (${error.url})`
                )
            } else {
                console.error(
                    '[ConversationDriver] turn failed:',
                    error instanceof Error ? error.message : error
                )
            }
            this.stopReason = 'error'
        } finally {
            // Only the turn that still owns the epoch may return the machine to
            // listening — a zombie turn must not reschedule after barge-in/teardown.
            if (epoch === this.turnEpoch && !this.terminated) {
                this.state = 'listening'
                this.scheduleTurn(this.silenceMs)
            }
            if (this.abortController === abortController) {
                this.abortController = null
            }
        }
    }

    /**
     * Dispatches one tool call to its catalog action. The input is already
     * validated by the AI SDK against the action's zod schema, and toolName
     * narrows the input type — no re-parsing, no casts.
     */
    private async executeToolCall (toolCall: TypedToolCall<typeof coreActionTools>): Promise<void> {
        if (toolCall.dynamic) {
            throw new Error(`Unexpected dynamic tool call: ${toolCall.toolName}`)
        }

        const ctx: ActionContext = {
            call: this.actionCall,
            log: (entry) => {
                this.logEntries.push(entry)
            },
        }

        switch (toolCall.toolName) {
            case 'speak': {
                const epoch = this.turnEpoch
                this.state = 'speaking'
                const spoken = toolCall.input.text
                await coreActions.speak.execute(toolCall.input, ctx)
                const outcome = this.speakOutcomes.get(epoch) ?? 'not-played'
                this.speakOutcomes.delete(epoch)
                if (outcome === 'completed') {
                    this.pushHistory('user', spoken)
                } else if (outcome === 'interrupted') {
                    this.pushHistory('user', `${spoken} ${INTERRUPTED_MARKER}`.trim())
                }
                // 'not-played': barge-in landed before the clip started — nothing
                // sounded, so nothing goes to history (history never lies).
                break
            }
            case 'hangup':
                this.terminated = true
                this.stopReason = 'hangup'
                await coreActions.hangup.execute(toolCall.input, ctx)
                break
            case 'wait':
                await coreActions.wait.execute(toolCall.input)
                this.pushHistory('user', '(waited)')
                break
            case 'sendDtmf':
                await coreActions.sendDtmf.execute(toolCall.input, ctx)
                this.pushHistory('user', `(sent DTMF: ${toolCall.input.digits})`)
                break
        }
    }

    private async performSpeak (payload: SpeakPayload): Promise<void> {
        const epoch = this.turnEpoch
        this.speakOutcomes.set(epoch, 'not-played')

        const effects = mergeAudioEffects(this.defaultSpeechEffects, payload.effects)

        try {
            if (effects) {
                await this.applyOutgoingEffects(effects)
            }

            if (this.speech.textToSpeechStream) {
                // Streaming path: audio starts sounding on the first TTS chunk.
                await this.speakViaStream(this.speech.textToSpeechStream(payload.text), epoch)
                return
            }

            const dataUrl = await this.session.getActionsExecutor().synthesizeToDataUrl(payload.text)

            if (epoch !== this.turnEpoch) {
                return // barged in or torn down while synthesizing — never start the clip
            }

            const clip = this.call.audio.playClip(dataUrl)
            this.currentClip = clip

            try {
                const result = await clip.done
                this.speakOutcomes.set(epoch, result.status)
            } finally {
                if (this.currentClip === clip) {
                    this.currentClip = null
                }
            }
        } finally {
            if (effects && this.defaultSpeechEffects) {
                await this.applyOutgoingEffects(this.defaultSpeechEffects)
            }
        }
    }

    private async speakViaStream (stream: TtsStream, epoch: number): Promise<void> {
        const startedAt = Date.now()
        const clip = this.call.audio.openPcmStream(stream.sampleRate)
        this.currentClip = clip

        let appendedAny = false

        try {
            try {
                // Breaking out of the loop cancels the provider stream
                // (the generator's cleanup closes the TTS socket).
                for await (const chunk of stream.chunks) {
                    if (epoch !== this.turnEpoch) {
                        break // barged in or torn down — stop pumping audio
                    }

                    await clip.append(chunk)

                    if (!appendedAny) {
                        appendedAny = true
                        console.log(`[ConversationDriver] first TTS chunk playing after ${Date.now() - startedAt}ms`)
                    }
                }

                if (epoch === this.turnEpoch) {
                    await clip.end()
                } else {
                    clip.stop()
                }
            } catch (error) {
                clip.stop()
                throw error
            }

            const result = await clip.done

            if (appendedAny) {
                this.speakOutcomes.set(epoch, result.status)
            }
            // Nothing was appended → keep 'not-played': no audio ever sounded.
        } finally {
            if (this.currentClip === clip) {
                this.currentClip = null
            }
        }
    }

    private async triggerHardStop (): Promise<void> {
        if (this.terminated) {
            return
        }

        console.log('[ConversationDriver] Hard stop — max call duration reached')
        this.hardStopTriggered = true
        this.terminated = true
        this.stopReason = 'hardStop'
        this.logEntries.push({ type: 'hardStop' })

        this.turnEpoch++
        this.abortController?.abort()
        this.currentClip?.stop()

        try {
            await this.call.hangup()
        } catch (error) {
            console.error('[ConversationDriver] hangup on hard stop failed:', error)
        }
    }

    private pushHistory (role: HistoryMessage['role'], content: string): void {
        this.history.push({
            role,
            content,
        })
        // The LLM plays the caller: bot speech is external "user" input to the model.
        const llmRole: HistoryMessage['role'] = role === 'user' ? 'assistant' : 'user'
        this.llmMessages.push({
            role: llmRole,
            content,
        })
    }

    private getAnthropicClient (): ReturnType<typeof createAnthropic> {
        if (!this.anthropicClient) {
            this.anthropicClient = createVoicebotAnthropic()
        }

        return this.anthropicClient
    }

    private isAbortError (error: unknown): boolean {
        if (!(error instanceof Error)) {
            return false
        }

        return error.name === 'AbortError' || error.message.includes('aborted')
    }
}
