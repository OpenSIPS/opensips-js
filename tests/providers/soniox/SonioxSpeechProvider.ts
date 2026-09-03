import WebSocket from 'ws'

import {
    BaseSpeechProvider,
    TextToSpeechResult,
    TtsStream
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
    ttsWsUrl?: string
    ttsAudioFormat?: string
    ttsStreamSampleRate?: number
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

interface SonioxTtsStreamMessage {
    audio?: string
    audio_end?: boolean
    terminated?: boolean
    error_code?: number
    error_message?: string
}

const DEFAULT_STT_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket'
const DEFAULT_TTS_URL = 'https://tts-rt.soniox.com/tts'
const DEFAULT_TTS_WS_URL = 'wss://tts-rt.soniox.com/tts-websocket'
const DEFAULT_TTS_STREAM_SAMPLE_RATE = 16000

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
            ttsWsUrl: options.ttsWsUrl ?? DEFAULT_TTS_WS_URL,
            ttsAudioFormat: options.ttsAudioFormat ?? 'mp3',
            ttsStreamSampleRate: options.ttsStreamSampleRate ?? DEFAULT_TTS_STREAM_SAMPLE_RATE
        }
    }

    public async textToSpeech (text: string): Promise<TextToSpeechResult> {
        const response = await fetch(this.options.ttsUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.options.apiKey}`,
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

    /**
     * Streaming TTS over the Soniox real-time WebSocket: raw pcm_s16le chunks
     * start arriving within a few hundred milliseconds, long before the whole
     * utterance is synthesized. Breaking out of the iteration closes the socket.
     */
    public textToSpeechStream (text: string): TtsStream {
        return {
            sampleRate: this.options.ttsStreamSampleRate,
            chunks: this.streamTtsChunks(text),
        }
    }

    private async * streamTtsChunks (text: string): AsyncGenerator<Buffer, void, void> {
        const socket = new WebSocket(this.options.ttsWsUrl)

        const pendingMessages: SonioxTtsStreamMessage[] = []
        let socketError: Error | null = null
        let socketClosed = false
        let wakeUp: (() => void) | null = null

        const notify = (): void => {
            const resume = wakeUp
            wakeUp = null
            resume?.()
        }

        socket.on('message', (raw: WebSocket.RawData) => {
            try {
                const message: SonioxTtsStreamMessage = JSON.parse(raw.toString())
                pendingMessages.push(message)
            } catch {
                // ignore non-JSON frames
            }
            notify()
        })
        socket.on('error', (error: Error) => {
            socketError = error
            notify()
        })
        socket.on('close', () => {
            socketClosed = true
            notify()
        })

        try {
            await new Promise<void>((resolve, reject) => {
                socket.once('open', resolve)
                socket.once('error', reject)
            })

            const streamId = '1'

            socket.send(JSON.stringify({
                api_key: this.options.apiKey,
                stream_id: streamId,
                model: this.options.ttsModel,
                language: this.options.ttsLanguage,
                voice: this.options.ttsVoice,
                audio_format: 'pcm_s16le',
                sample_rate: this.options.ttsStreamSampleRate,
            }))
            socket.send(JSON.stringify({
                stream_id: streamId,
                text,
            }))
            socket.send(JSON.stringify({
                stream_id: streamId,
                text_end: true,
            }))

            for (;;) {
                const message = pendingMessages.shift()

                if (!message) {
                    if (socketError) {
                        throw socketError
                    }
                    if (socketClosed) {
                        throw new Error('Soniox TTS stream closed before audio_end')
                    }
                    await new Promise<void>((resolve) => {
                        wakeUp = resolve
                    })
                    continue
                }

                if (message.error_message) {
                    throw new Error(`Soniox TTS stream error (${message.error_code}): ${message.error_message}`)
                }

                if (message.audio) {
                    yield Buffer.from(message.audio, 'base64')
                }

                if (message.audio_end || message.terminated) {
                    return
                }
            }
        } finally {
            if (
                socket.readyState === WebSocket.OPEN ||
                socket.readyState === WebSocket.CONNECTING
            ) {
                socket.close()
            }
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
                    audio_format: this.options.sttAudioFormat,
                    // Finalize tokens the moment the speaker stops instead of
                    // waiting for trailing audio context — final transcripts
                    // arrive ~0.5s after the utterance ends, not 3-5s.
                    enable_endpoint_detection: true
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

        // Endpoint detection emits special marker tokens ("<end>", "<fin>") —
        // they signal segment boundaries and must never reach the transcript.
        message.tokens = message.tokens.filter(
            (token) => token.text !== '<end>' && token.text !== '<fin>'
        )

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
            this.notifyTranscript(finalText, true)
        }
        if (interimText) {
            this.notifyTranscript(interimText, false)
        }
    }
}
