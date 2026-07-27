import WebSocket from 'ws'

import {
    BaseSpeechProvider,
    TextToSpeechResult
} from '../../core/services/speech/BaseSpeechProvider'

/**
 * Example BaseSpeechProvider implementation using Soniox
 * (https://soniox.com/docs/sdk/web-SDK).
 *
 * The framework captures the remote track as `audio/webm;codecs=opus`; set
 * `sttAudioFormat` to match your model. Verify endpoint URLs and request fields
 * against the current Soniox docs for your account/region.
 */

export interface SonioxProviderOptions {
    apiKey: string
    sttModel?: string
    ttsModel?: string
    ttsVoice?: string
    ttsLanguage?: string
    sttAudioFormat?: string
    realtimeUrl?: string
    ttsUrl?: string
    ttsAudioFormat?: string
}

interface SonioxToken {
    text: string
    is_final?: boolean
    confidence?: number
}

interface SonioxRealtimeMessage {
    tokens?: SonioxToken[]
    finished?: boolean
    error_code?: number
    error_message?: string
}

const DEFAULT_STT_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket'
const DEFAULT_TTS_URL = 'https://tts-rt.soniox.com/tts'

export class SonioxSpeechProvider extends BaseSpeechProvider {
    private readonly options: Required<SonioxProviderOptions>

    private socket: WebSocket | null = null
    private isConfigured = false
    private pendingAudio: Buffer[] = []

    constructor (options: SonioxProviderOptions) {
        super()

        if (!options.apiKey) {
            throw new Error('SonioxSpeechProvider requires an apiKey')
        }

        this.options = {
            apiKey: options.apiKey,
            sttModel: options.sttModel ?? 'stt-rt-v5',
            ttsModel: options.ttsModel ?? 'tts-rt-v1',
            ttsVoice: options.ttsVoice ?? 'Adrian',
            ttsLanguage: options.ttsLanguage ?? 'en',
            sttAudioFormat: options.sttAudioFormat ?? 'auto',
            realtimeUrl: options.realtimeUrl ?? DEFAULT_STT_WS_URL,
            ttsUrl: options.ttsUrl ?? DEFAULT_TTS_URL,
            ttsAudioFormat: options.ttsAudioFormat ?? 'mp3'
        }
    }

    public async textToSpeech (text: string): Promise<TextToSpeechResult> {
        const response = await fetch(this.options.ttsUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.options.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.options.ttsModel,
                language: this.options.ttsLanguage,
                voice: this.options.ttsVoice,
                text,
                audio_format: this.options.ttsAudioFormat
            })
        })

        if (!response.ok) {
            const detail = await response.text().catch(() => '')
            throw new Error(`Soniox TTS request failed (${response.status}): ${detail}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const mimeType = this.options.ttsAudioFormat === 'wav' ? 'audio/wav' : 'audio/mpeg'

        return {
            audio: Buffer.from(arrayBuffer),
            mimeType
        }
    }

    public async startRecording (): Promise<void> {
        if (this.socket) {
            return
        }

        await new Promise<void>((resolve, reject) => {
            const socket = new WebSocket(this.options.realtimeUrl)
            this.socket = socket

            socket.on('open', () => {
                socket.send(JSON.stringify({
                    api_key: this.options.apiKey,
                    model: this.options.sttModel,
                    audio_format: this.options.sttAudioFormat
                }))

                this.isConfigured = true
                console.log('[SonioxSpeechProvider] STT socket open, config sent', {
                    model: this.options.sttModel,
                    audioFormat: this.options.sttAudioFormat,
                    pendingChunks: this.pendingAudio.length
                })

                for (const chunk of this.pendingAudio) {
                    socket.send(chunk)
                }
                this.pendingAudio = []

                resolve()
            })

            socket.on('message', (raw: WebSocket.RawData) => {
                this.handleMessage(raw)
            })

            socket.on('error', (err: Error) => {
                if (!this.isConfigured) {
                    reject(err)
                }
            })

            socket.on('close', () => {
                this.socket = null
                this.isConfigured = false
            })
        })
    }

    public async writeAudioChunk (chunk: Buffer): Promise<void> {
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.isConfigured) {
            this.socket.send(chunk)
        } else {
            this.pendingAudio.push(chunk)
        }
    }

    public async stopRecording (): Promise<void> {
        const socket = this.socket
        if (!socket) {
            return
        }

        if (socket.readyState === WebSocket.OPEN) {
            socket.send('')
        }

        await new Promise<void>((resolve) => {
            let settled = false
            const finish = (): void => {
                if (settled) {
                    return
                }
                settled = true
                socket.off('message', onFinished)
                resolve()
            }
            const onFinished = (raw: WebSocket.RawData): void => {
                try {
                    const message: SonioxRealtimeMessage = JSON.parse(raw.toString())
                    if (message.finished) {
                        finish()
                    }
                } catch {
                    // ignore non-JSON frames
                }
            }
            socket.on('message', onFinished)
            socket.once('close', finish)
            setTimeout(finish, 5000)
        })

        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.close()
        }
        this.socket = null
        this.isConfigured = false
        this.pendingAudio = []
    }

    private handleMessage (raw: WebSocket.RawData): void {
        let message: SonioxRealtimeMessage

        try {
            message = JSON.parse(raw.toString())
        } catch {
            return
        }

        if (message.error_message) {
            console.error('[SonioxSpeechProvider] Real-time error:', message.error_code, message.error_message)
            return
        }

        if (!message.tokens || message.tokens.length === 0) {
            return
        }

        // Emit every chunk the STT stream yields. Soniox marks committed tokens
        // with `is_final`; we forward finalized and interim text separately with the
        // `isFinal` flag so consumers can decide how to use them. Filtering to only
        // final results is intentionally NOT done here — this is a generic provider.
        const finalText = message.tokens
            .filter(token => token.is_final)
            .map(token => token.text)
            .join('')
        const interimText = message.tokens
            .filter(token => !token.is_final)
            .map(token => token.text)
            .join('')

        if (finalText) {
            console.log('[SonioxSpeechProvider] Transcript chunk (final)', { text: finalText })
            this.emitTranscript(finalText, true)
        }
        if (interimText) {
            this.emitTranscript(interimText, false)
        }
    }
}
