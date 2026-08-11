import { z } from 'zod'
import type { ModelMessage } from 'ai'

import {
    BaseSpeechProvider,
    RunnableAction,
    TextToSpeechResult
} from '../../../services/speech/BaseSpeechProvider'
import { ConnectionImpairment } from '../../../services/ConnectionImpairment'
import { SonioxSpeechProvider } from '../../../../providers/soniox/SonioxSpeechProvider'
import actionsSchema from './actions-schema.json'

declare global {
    interface Window {
        __stopCurrentClip?: (() => void) | null
    }
}

export interface BargeInOptions {
    // Allow the caller to interrupt the bot while it is speaking.
    enabled?: boolean
    // How long (ms) of sustained, non-echo caller speech confirms an interruption.
    confirmMs?: number
    // Window (ms) after the bot stops speaking during which we still treat matching
    // transcripts as our own echo (protects against speakerphone loopback).
    echoTailMs?: number
}

export interface ImpairmentProfile {
    // 0.0 = silence, 1.0 = original volume.
    volume?: number
    // 0.0 = no noise, 1.0 = very loud noise.
    noise?: number
    // 0.0 = no loss, 1.0 = constant dropouts.
    packetLoss?: number
    // TEMP: also degrade the outgoing TTS (what the caller hears) for testing. Remove later.
    impairBothDirections?: boolean
}

export interface AiVoiceBotProviderOptions {
    sonioxApiKey: string
    anthropicApiKey: string
    model?: string
    systemPrompt?: string
    language?: string
    ttsVoice?: string
    silenceMs?: number
    impairment?: ImpairmentProfile
    bargeIn?: BargeInOptions
}

const DEFAULT_MODEL = 'claude-haiku-4-5'
const DEFAULT_SILENCE_MS = 2000
const DEFAULT_BARGE_IN_CONFIRM_MS = 400
const DEFAULT_ECHO_TAIL_MS = 600

// Precise validation for the action the LLM returns
const agentActionSchema = z.discriminatedUnion('actionType', [
    z.object({ actionType: z.literal('hangup') }),
    z.object({ actionType: z.literal('hold') }),
    z.object({ actionType: z.literal('unhold') }),
    z.object({ actionType: z.literal('dnd') }),
    z.object({ actionType: z.literal('wait'), time: z.number().int().positive() }),
    z.object({ actionType: z.literal('sendDTMF'), dtmf: z.string().min(1) }),
    z.object({ actionType: z.literal('transfer'), target: z.string().min(1) })
])

// The envelope the LLM always returns
const responseEnvelopeSchema = z.object({
    type: z.enum([ 'text', 'action' ]),
    content: z.union([
        z.string(),
        z.object({ actionType: z.string() }).catchall(z.any())
    ]).describe('Spoken text when type="text"; an { actionType, ...params } object when type="action"'),
    preActionSpeech: z.string().optional().describe('Optional sentence to speak BEFORE the action runs'),
    postActionSpeech: z.string().optional().describe('Optional sentence to speak AFTER the action runs')
})

type ResponseEnvelope = z.infer<typeof responseEnvelopeSchema>
type AgentAction = z.infer<typeof agentActionSchema>

function buildProtocolPrompt (): string {
    return [
        'You are operating a live phone call.',
        'You MUST always reply as a single JSON object with this shape:',
        '{ "type": "text" | "action", "content": <string | action object>,' +
        ' "preActionSpeech"?: string, "postActionSpeech"?: string }',
        '',
        'Use type "text" for ordinary conversation and put the spoken words in "content".',
        'Use type "action" only when a call-control operation is clearly warranted; then "content"' +
        ' is an action object like { "actionType": <name>, ...params }.',
        'Available actions and their parameters:',
        JSON.stringify(actionsSchema, null, 2),
        '',
        'Use "preActionSpeech" to say something right BEFORE the action (e.g. a goodbye before hangup).',
        'Use "postActionSpeech" for something to say AFTER the action (only for actions that keep the call alive).',
        'Most turns are plain conversation, so "text" is the default. When the caller clearly says goodbye or' +
        ' wants to finish, respond with a hangup action and a short goodbye in preActionSpeech.',
        'Example: { "type": "action", "content": { "actionType": "hangup" },' +
        ' "preActionSpeech": "Alright, talk to you later. Bye!" }'
    ].join('\n')
}

export class AiVoiceBotProvider extends BaseSpeechProvider {
    private readonly soniox: SonioxSpeechProvider
    private readonly anthropicApiKey: string
    private readonly model: string
    private readonly systemPrompt: string
    private readonly silenceMs: number

    private generateObjectFn: typeof import('ai')['generateObject'] | null = null
    private modelFactory: ReturnType<typeof import('@ai-sdk/anthropic')['createAnthropic']> | null = null

    private readonly history: ModelMessage[] = []

    private finalMessage = ''
    private silenceTimer: ReturnType<typeof setTimeout> | null = null
    private isThinking = false
    private isSpeaking = false
    private terminated = false

    // Barge-in state
    private readonly bargeInEnabled: boolean
    private readonly bargeInConfirmMs: number
    private readonly echoTailMs: number
    private currentUtterance = ''
    private speakingEndedAt = 0
    private abortController: AbortController | null = null
    private interrupted = false
    private bargeStartTs = 0
    private bargeTokenCount = 0
    private bargeText = ''
    private bargeTimer: ReturnType<typeof setTimeout> | null = null

    private readonly impairmentProfile?: ImpairmentProfile
    private impairment: ConnectionImpairment | null = null

    constructor (options: AiVoiceBotProviderOptions) {
        super()

        if (!options.sonioxApiKey) {
            throw new Error('AiVoiceBotProvider requires a sonioxApiKey')
        }
        if (!options.anthropicApiKey) {
            throw new Error('AiVoiceBotProvider requires an anthropicApiKey')
        }

        this.model = options.model ?? DEFAULT_MODEL
        this.silenceMs = options.silenceMs ?? DEFAULT_SILENCE_MS
        this.anthropicApiKey = options.anthropicApiKey
        this.impairmentProfile = options.impairment

        this.bargeInEnabled = options.bargeIn?.enabled ?? true
        this.bargeInConfirmMs = options.bargeIn?.confirmMs ?? DEFAULT_BARGE_IN_CONFIRM_MS
        this.echoTailMs = options.bargeIn?.echoTailMs ?? DEFAULT_ECHO_TAIL_MS

        this.systemPrompt = options.systemPrompt ?? buildProtocolPrompt()

        this.soniox = new SonioxSpeechProvider({
            apiKey: options.sonioxApiKey,
            ttsLanguage: options.language ?? 'en',
            ttsVoice: options.ttsVoice
        })

        this.soniox._bindTranscriptSink((text, isFinal) => {
            this.onCallerSpeech(text, Boolean(isFinal))
        })
    }

    public async textToSpeech (text: string): Promise<TextToSpeechResult> {
        return this.soniox.textToSpeech(text)
    }

    public async startRecording (): Promise<void> {
        if (this.impairmentProfile && this.page) {
            this.impairment = new ConnectionImpairment(this.page)
            await this.impairment.install()

            // TEMP: also degrade outgoing TTS so degradation is audible on the phone.
            if (this.impairmentProfile.impairBothDirections) {
                const baseGain = await this.impairment.installOutgoing()
                console.log('[AiVoiceBotProvider] outgoing impairment installed, baseGain =', baseGain)
            }

            if (this.impairmentProfile.volume !== undefined) {
                await this.impairment.setVolume(this.impairmentProfile.volume)
            }
            if (this.impairmentProfile.noise !== undefined) {
                await this.impairment.addNoise(this.impairmentProfile.noise)
            }
            if (this.impairmentProfile.packetLoss !== undefined) {
                await this.impairment.setPacketLoss(this.impairmentProfile.packetLoss)
            }

            if (this.impairmentProfile.impairBothDirections) {
                const state = await this.impairment.readOutgoingState()
                console.log('[AiVoiceBotProvider] outgoing impairment state after profile:', state)
            }
        }

        await this.soniox.startRecording()
    }

    public async writeAudioChunk (chunk: Buffer): Promise<void> {
        await this.soniox.writeAudioChunk(chunk)
    }

    public async stopRecording (): Promise<void> {
        this.terminated = true
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer)
            this.silenceTimer = null
        }
        this.resetBargeState()
        this.abortController?.abort()
        if (this.impairment) {
            await this.impairment.clear()
            if (this.impairmentProfile?.impairBothDirections) {
                await this.impairment.clearOutgoing()
            }
            this.impairment = null
        }
        await this.soniox.stopRecording()
    }

    private async ensureAi (): Promise<void> {
        if (this.generateObjectFn && this.modelFactory) {
            return
        }
        const [ aiModule, anthropicModule ] = await Promise.all([
            import('ai'),
            import('@ai-sdk/anthropic')
        ])
        this.generateObjectFn = aiModule.generateObject
        this.modelFactory = anthropicModule.createAnthropic({ apiKey: this.anthropicApiKey })
    }

    private onCallerSpeech (text: string, isFinal: boolean): void {
        if (this.terminated) {
            return
        }

        const now = Date.now()
        const inEchoWindow = this.isSpeaking || (now - this.speakingEndedAt) < this.echoTailMs

        // Drop the bot's own voice looping back through the caller's device.
        if (inEchoWindow && this.isLikelyEcho(text)) {
            console.log('[AiVoiceBotProvider] Ignored as self-echo:', text)
            return
        }

        const isBotBusy = this.isSpeaking || this.isThinking

        if (isBotBusy) {
            if (!this.bargeInEnabled) {
                return
            }
            this.registerBargeInSpeech(text, isFinal, now)
            return
        }

        // Idle: normal turn accumulation.
        if (isFinal) {
            this.finalMessage += text
        }
        this.runSilenceTimer()
    }

    private registerBargeInSpeech (text: string, isFinal: boolean, now: number): void {
        if (this.normalizeText(text).length === 0) {
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

        // Require sustained speech (not a single echo blip) before interrupting.
        if (!this.isSpeaking && !this.isThinking) {
            this.resetBargeState()
            return
        }
        if (this.bargeTokenCount < 2) {
            this.resetBargeState()
            return
        }

        console.log('[AiVoiceBotProvider] Barge-in detected; interrupting the bot')
        this.interrupted = true

        // 1. Cancel the in-flight LLM generation (if any).
        this.abortController?.abort()

        // 2. Stop the current TTS playback immediately.
        await this.stopSpeaking()

        // 3. Carry the caller's interrupting words into the next turn.
        const carried = this.bargeText.trim()
        this.resetBargeState()
        this.finalMessage = carried
        if (carried) {
            this.runSilenceTimer()
        }
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

    private async stopSpeaking (): Promise<void> {
        if (!this.page) {
            return
        }
        try {
            await this.page.evaluate(() => window.__stopCurrentClip?.())
        } catch (error) {
            console.error(
                '[AiVoiceBotProvider] failed to stop TTS:',
                error instanceof Error ? error.message : error
            )
        }
    }

    private runSilenceTimer (): void {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer)
        }
        this.silenceTimer = setTimeout(() => {
            void this.finalizeTurn()
        }, this.silenceMs)
    }

    private async finalizeTurn (): Promise<void> {
        this.silenceTimer = null

        if (this.isThinking || this.isSpeaking || this.terminated) {
            return
        }

        const callerText = this.finalMessage.trim()
        if (!callerText) {
            return
        }

        this.finalMessage = ''
        this.currentUtterance = ''
        this.interrupted = false
        this.isThinking = true
        this.abortController = new AbortController()

        try {
            this.history.push({ role: 'user', content: callerText })
            console.log('[AiVoiceBotProvider] Caller said:', callerText)

            await this.ensureAi()

            const { object } = await this.generateObjectFn!({
                model: this.modelFactory!(this.model),
                system: this.systemPrompt,
                schema: responseEnvelopeSchema,
                messages: this.history,
                abortSignal: this.abortController.signal
            })

            this.isThinking = false
            await this.applyEnvelope(object as ResponseEnvelope)
        } catch (error) {
            if (!this.interrupted) {
                console.error(
                    '[AiVoiceBotProvider] turn failed:',
                    error instanceof Error ? error.message : error
                )
            }
        } finally {
            this.isThinking = false
            this.isSpeaking = false
            this.speakingEndedAt = Date.now()
            this.abortController = null
        }
    }

    private isLikelyEcho (text: string): boolean {
        const words = this.normalizeText(text).split(' ').filter(Boolean)
        if (words.length === 0) {
            return true
        }
        if (!this.currentUtterance) {
            return false
        }

        // Real echo reproduces the bot's words in order, so require a shared
        // 3-word sequence rather than a loose bag-of-words overlap (which falsely
        // flags common short phrases like "can you hear me now" as our own voice).
        const haystack = ` ${this.currentUtterance} `
        if (words.length < 3) {
            return haystack.includes(` ${words.join(' ')} `)
        }
        for (let i = 0; i <= words.length - 3; i++) {
            const shingle = `${words[i]} ${words[i + 1]} ${words[i + 2]}`
            if (haystack.includes(` ${shingle} `)) {
                return true
            }
        }
        return false
    }

    private normalizeText (text: string): string {
        return text
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim()
    }

    private async applyEnvelope (envelope: ResponseEnvelope): Promise<void> {
        if (envelope.type === 'text' || typeof envelope.content === 'string') {
            const raw = typeof envelope.content === 'string' ? envelope.content : ''
            const spoken = this.sanitizeSpeech(raw)
            if (spoken) {
                console.log('[AiVoiceBotProvider] AI reply:', spoken)
                await this.speak(spoken)
                this.recordAssistant(spoken)
            }
            return
        }

        const parsed = agentActionSchema.safeParse(envelope.content)
        if (!parsed.success) {
            console.warn(
                '[AiVoiceBotProvider] Ignoring malformed action from LLM:',
                JSON.stringify(envelope.content),
                parsed.error.issues
            )
            return
        }

        const pre = this.sanitizeSpeech(envelope.preActionSpeech ?? '')
        const post = this.sanitizeSpeech(envelope.postActionSpeech ?? '')
        console.log('[AiVoiceBotProvider] AI action:', parsed.data, { pre, post })

        if (pre) {
            await this.speak(pre)
        }

        // If the caller interrupted during the pre-action speech, abandon the action.
        if (this.interrupted) {
            this.recordAssistant(pre || `(about to ${parsed.data.actionType})`)
            return
        }

        await this.executeAgentAction(parsed.data)

        if (post && !this.terminated && !this.interrupted) {
            await this.speak(post)
        }

        this.recordAssistant(pre || post || `(performed ${parsed.data.actionType})`)
    }

    private recordAssistant (content: string): void {
        const note = this.interrupted ? ' (interrupted by caller)' : ''
        const text = (content + note).trim()
        if (text) {
            this.history.push({ role: 'assistant', content: text })
        }
    }

    private async executeAgentAction (action: AgentAction): Promise<void> {
        const runnable = this.toRunnableAction(action)
        if (!runnable) {
            console.warn('[AiVoiceBotProvider] Ignoring unsupported action:', action)
            return
        }

        if (runnable.type === 'hangup') {
            this.terminated = true
        }

        try {
            await this.runAction(runnable)
        } catch (error) {
            console.error(
                '[AiVoiceBotProvider] action failed:',
                runnable.type,
                error instanceof Error ? error.message : error
            )
        }
    }

    private toRunnableAction (action: AgentAction): RunnableAction | null {
        switch (action.actionType) {
            case 'hangup':
                return { type: 'hangup' }
            case 'hold':
                return { type: 'hold' }
            case 'unhold':
                return { type: 'unhold' }
            case 'dnd':
                return { type: 'DND' }
            case 'wait':
                return { type: 'wait', data: { payload: { time: action.time } } }
            case 'sendDTMF':
                return { type: 'sendDTMF', data: { payload: { dtmf: action.dtmf } } }
            case 'transfer':
                return { type: 'transfer', data: { payload: { target: action.target } } }
            default:
                return null
        }
    }

    private async speak (text: string): Promise<void> {
        if (!text || this.interrupted || this.terminated) {
            return
        }

        this.isSpeaking = true
        const normalized = this.normalizeText(text)
        const combined = `${this.currentUtterance} ${normalized}`.trim().split(' ')
        // Keep only a recent window so a long reply doesn't accumulate every common
        // word and start swallowing genuine interruptions as "echo".
        this.currentUtterance = combined.slice(-40).join(' ')

        try {
            await this.runAction({ type: 'textToSpeech', data: { payload: { text } } })
        } finally {
            this.isSpeaking = false
            this.speakingEndedAt = Date.now()
        }
    }

    private sanitizeSpeech (text: string): string {
        return text
            .replace(/\*[^*]*\*/g, ' ')
            .replace(/\([^)]*\)/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/"/g, "'")
            .trim()
    }
}
