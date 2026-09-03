export interface TextToSpeechResult {
    audio: Buffer | string
    mimeType?: string
}

export type TranscriptListener = (text: string, isFinal?: boolean) => void
export type TranscriptUnsubscribe = () => void

/**
 * Streaming TTS: raw PCM (s16le mono) audio chunks arriving while the text is
 * still being synthesized. Breaking out of the async iteration (for-await
 * `break`) cancels the stream and releases the underlying connection.
 */
export interface TtsStream {
    sampleRate: number
    chunks: AsyncGenerator<Buffer, void, void>
}

/**
 * Pure STT/TTS contract (RUNNER-TASKS T2.1).
 * No Playwright page access, no framework action runner — composition only.
 */
export interface SpeechProvider {
    textToSpeech (text: string): Promise<TextToSpeechResult>
    /** Optional low-latency path: providers that can stream synthesis expose it here. */
    textToSpeechStream? (text: string): TtsStream
    startRecording (): Promise<void>
    writeAudioChunk (chunk: Buffer): Promise<void>
    stopRecording (): Promise<void>
    onTranscript (listener: TranscriptListener): TranscriptUnsubscribe
}

/**
 * Base class for provider implementations. Subclasses call {@link notifyTranscript}
 * when STT yields text.
 */
export abstract class BaseSpeechProvider implements SpeechProvider {
    private readonly transcriptListeners = new Set<TranscriptListener>()

    public onTranscript (listener: TranscriptListener): TranscriptUnsubscribe {
        this.transcriptListeners.add(listener)
        return () => {
            this.transcriptListeners.delete(listener)
        }
    }

    protected notifyTranscript (text: string, isFinal?: boolean): void {
        for (const listener of this.transcriptListeners) {
            listener(text, isFinal)
        }
    }

    public abstract textToSpeech (text: string): Promise<TextToSpeechResult>

    public abstract startRecording (): Promise<void>

    public abstract writeAudioChunk (chunk: Buffer): Promise<void>

    public abstract stopRecording (): Promise<void>
}

/** A ready instance, or a factory that yields a fresh instance per scenario. */
export type SpeechProviderInput = SpeechProvider | (() => SpeechProvider)

export function resolveSpeechProvider (
    input?: SpeechProviderInput
): SpeechProvider | undefined {
    if (!input) {
        return undefined
    }
    return typeof input === 'function' ? input() : input
}
