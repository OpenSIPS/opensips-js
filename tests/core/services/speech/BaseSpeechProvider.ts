/**
 * Contract that TTS/STT providers implement. The framework owns the WebRTC
 * plumbing; a provider only bridges audio to/from a speech library of its choice.
 * Developers extend this class and pass an instance (or factory) to `run()`.
 */

export interface TextToSpeechResult {
    audio: Buffer | string
    mimeType?: string
}

type TranscriptSink = (text: string, isFinal?: boolean) => void

export abstract class BaseSpeechProvider {
    private _sink?: TranscriptSink

    /** @internal Bound by the framework to receive transcript text. */
    public _bindTranscriptSink (sink: TranscriptSink): void {
        this._sink = sink
    }

    /**
     * Call this with the recognized text whenever the STT library yields it.
     * Emit every chunk (both interim and final); pass `isFinal` when the library
     * distinguishes them so consumers can decide what to do. Deciding to keep only
     * final chunks is a consumer concern, not the provider's.
     */
    protected emitTranscript (text: string, isFinal?: boolean): void {
        if (this._sink) {
            this._sink(text, isFinal)
        }
    }

    public abstract textToSpeech (text: string): Promise<TextToSpeechResult>

    public abstract startRecording (): Promise<void>

    public abstract writeAudioChunk (chunk: Buffer): Promise<void>

    public abstract stopRecording (): Promise<void>
}

/** A ready instance, or a factory that yields a fresh instance per scenario. */
export type SpeechProviderInput = BaseSpeechProvider | (() => BaseSpeechProvider)

export function resolveSpeechProvider (
    input?: SpeechProviderInput
): BaseSpeechProvider | undefined {
    if (!input) {
        return undefined
    }
    return typeof input === 'function' ? input() : input
}
