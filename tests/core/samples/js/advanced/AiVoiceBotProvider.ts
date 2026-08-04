import type { ModelMessage } from 'ai'

import {
    BaseSpeechProvider,
    TextToSpeechResult
} from '../../../services/speech/BaseSpeechProvider'
import { SonioxSpeechProvider } from '../../../../providers/soniox/SonioxSpeechProvider'

export interface AiVoiceBotProviderOptions {
    sonioxApiKey: string
    anthropicApiKey: string
    model?: string
    systemPrompt?: string
    language?: string
    ttsVoice?: string
    silenceMs?: number
}

const DEFAULT_MODEL = 'claude-haiku-4-5'
const DEFAULT_SILENCE_MS = 2000
const DEFAULT_SYSTEM_PROMPT = [
    'Act like you are a chihuahua dog Simba. Please answer like if you are dog. Not "39 dial number agent", ' +
    'you are chihuahua Simba! You are 3 years old. You were born in Ukraine' +
    ' in June 2023. You like playing. ' +
    ' You like playing with orange toy and with a bone. Also you like killing and breaking '+
    ' you animals-toys. Always answer in English. When someone ask you something, ' +
    ' you should answer only for this question, now telling absolutely everything I told you. Maximum 2 sentences.' +
    ' Reply with plain spoken words only. Never include stage directions, actions, emotes, sound effects,' +
    ' asterisks or narration such as *wags tail* or *barks*. Output only what should be spoken aloud.'
].join(' ')

export class AiVoiceBotProvider extends BaseSpeechProvider {
    private readonly soniox: SonioxSpeechProvider
    private readonly anthropicApiKey: string
    private readonly model: string
    private readonly systemPrompt: string
    private readonly silenceMs: number

    private generate: typeof import('ai')['generateText'] | null = null
    private modelFactory: ReturnType<typeof import('@ai-sdk/anthropic')['createAnthropic']> | null = null

    private readonly history: ModelMessage[] = []

    private finalMessage = ''
    private silenceTimer: ReturnType<typeof setTimeout> | null = null
    private isThinking = false

    private muted = false
    private muteTimer: ReturnType<typeof setTimeout> | null = null

    constructor (options: AiVoiceBotProviderOptions) {
        super()

        if (!options.sonioxApiKey) {
            throw new Error('AiVoiceBotProvider requires a sonioxApiKey')
        }
        if (!options.anthropicApiKey) {
            throw new Error('AiVoiceBotProvider requires an anthropicApiKey')
        }

        this.model = options.model ?? DEFAULT_MODEL
        this.systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
        this.silenceMs = options.silenceMs ?? DEFAULT_SILENCE_MS
        this.anthropicApiKey = options.anthropicApiKey

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
        await this.soniox.startRecording()
    }

    public async writeAudioChunk (chunk: Buffer): Promise<void> {
        await this.soniox.writeAudioChunk(chunk)
    }

    public async stopRecording (): Promise<void> {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer)
            this.silenceTimer = null
        }
        if (this.muteTimer) {
            clearTimeout(this.muteTimer)
            this.muteTimer = null
        }
        await this.soniox.stopRecording()
    }

    private async ensureAi (): Promise<void> {
        if (this.generate && this.modelFactory) {
            return
        }
        const [ aiModule, anthropicModule ] = await Promise.all([
            import('ai'),
            import('@ai-sdk/anthropic')
        ])
        this.generate = aiModule.generateText
        this.modelFactory = anthropicModule.createAnthropic({ apiKey: this.anthropicApiKey })
    }

    private onCallerSpeech (text: string, isFinal: boolean): void {
        if (this.muted || this.isThinking) {
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

        if (this.isThinking) {
            this.runSilenceTimer()
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

            const { text: reply } = await this.generate!({
                model: this.modelFactory!(this.model),
                system: this.systemPrompt,
                messages: this.history
            })

            const replyText = reply
                .replace(/\*[^*]*\*/g, ' ')
                .replace(/\([^)]*\)/g, ' ')
                .replace(/\s+/g, ' ')
                .replace(/"/g, "'")
                .trim()
            console.log('[AiVoiceBotProvider] AI operator reply:', replyText)

            if (replyText) {
                this.history.push({ role: 'assistant', content: replyText })
                this.emitTranscript(replyText, true)
                this.keepMutedWhileSpeaking(replyText)
            } else {
                this.unmute()
            }
        } catch (error) {
            console.error(
                '[AiVoiceBotProvider] generateText failed:',
                error instanceof Error ? error.message : error
            )
            this.unmute()
        } finally {
            this.isThinking = false
        }
    }

    private keepMutedWhileSpeaking (text: string): void {
        const words = text.split(/\s+/).filter(Boolean).length
        const estimatedMs = Math.max(2500, words * 450 + 1500)

        if (this.muteTimer) {
            clearTimeout(this.muteTimer)
        }
        this.muteTimer = setTimeout(() => this.unmute(), estimatedMs)
    }

    private unmute (): void {
        if (this.muteTimer) {
            clearTimeout(this.muteTimer)
            this.muteTimer = null
        }
        this.finalMessage = ''
        this.muted = false
    }
}
