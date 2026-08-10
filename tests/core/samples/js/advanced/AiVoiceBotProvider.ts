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

export interface ImpairmentProfile {
    // 0.0 = silence, 1.0 = original volume.
    volume?: number
    // 0.0 = no noise, 1.0 = very loud noise.
    noise?: number
    // 0.0 = no loss, 1.0 = constant dropouts.
    packetLoss?: number
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
}

const DEFAULT_MODEL = 'claude-haiku-4-5'
const DEFAULT_SILENCE_MS = 2000
const LISTEN_TAIL_MS = 800

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
    private muted = false
    private terminated = false

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

            if (this.impairmentProfile.volume !== undefined) {
                await this.impairment.setVolume(this.impairmentProfile.volume)
            }
            if (this.impairmentProfile.noise !== undefined) {
                await this.impairment.addNoise(this.impairmentProfile.noise)
            }
            if (this.impairmentProfile.packetLoss !== undefined) {
                await this.impairment.setPacketLoss(this.impairmentProfile.packetLoss)
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
        if (this.impairment) {
            await this.impairment.clear()
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
        if (this.muted || this.isThinking || this.terminated) {
            return
        }
        if (isFinal) {
            this.finalMessage += text
        }
        this.runSilenceTimer()
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

        if (this.isThinking || this.terminated) {
            return
        }

        const callerText = this.finalMessage.trim()
        if (!callerText) {
            return
        }

        this.finalMessage = ''
        this.muted = true
        this.isThinking = true

        try {
            this.history.push({ role: 'user', content: callerText })
            console.log('[AiVoiceBotProvider] Caller said:', callerText)

            await this.ensureAi()

            const { object } = await this.generateObjectFn!({
                model: this.modelFactory!(this.model),
                system: this.systemPrompt,
                schema: responseEnvelopeSchema,
                messages: this.history
            })

            await this.applyEnvelope(object as ResponseEnvelope)
        } catch (error) {
            console.error(
                '[AiVoiceBotProvider] turn failed:',
                error instanceof Error ? error.message : error
            )
        } finally {
            this.isThinking = false
            // Keep muted for a short tail so we don't transcribe the end of our own reply.
            await this.delay(LISTEN_TAIL_MS)
            this.finalMessage = ''
            this.muted = false
        }
    }

    private async applyEnvelope (envelope: ResponseEnvelope): Promise<void> {
        if (envelope.type === 'text' || typeof envelope.content === 'string') {
            const raw = typeof envelope.content === 'string' ? envelope.content : ''
            const spoken = this.sanitizeSpeech(raw)
            if (spoken) {
                this.history.push({ role: 'assistant', content: spoken })
                console.log('[AiVoiceBotProvider] AI reply:', spoken)
                await this.speak(spoken)
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
        const summary = pre || post || `(performed ${parsed.data.actionType})`
        this.history.push({ role: 'assistant', content: summary })
        console.log('[AiVoiceBotProvider] AI action:', parsed.data, { pre, post })

        if (pre) {
            await this.speak(pre)
        }

        await this.executeAgentAction(parsed.data)

        if (post && !this.terminated) {
            await this.speak(post)
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
        if (!text) {
            return
        }

        await this.runAction({ type: 'textToSpeech', data: { payload: { text } } })
    }

    private sanitizeSpeech (text: string): string {
        return text
            .replace(/\*[^*]*\*/g, ' ')
            .replace(/\([^)]*\)/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/"/g, "'")
            .trim()
    }

    private delay (ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }
}
