import type { Page } from 'playwright'

export interface TextToSpeechResult {
    audio: Buffer | string
    mimeType?: string
}

type TranscriptSink = (text: string, isFinal?: boolean) => void

export interface RunnableAction {
    type: string
    data?: {
        payload?: Record<string, unknown>
    }
}

type ActionRunner = (action: RunnableAction) => Promise<void>

export abstract class BaseSpeechProvider {
    private _sink?: TranscriptSink
    private _actionRunner?: ActionRunner

    /**
     * @internal Bound by the framework: the Playwright page of this scenario.
     * Lets a provider drive browser-side helpers (e.g. ConnectionImpairment) that
     * manipulate the in-page WebRTC/Web Audio graph.
     */
    protected page?: Page

    /** @internal Bound by the framework to receive transcript text. */
    public _bindTranscriptSink (sink: TranscriptSink): void {
        this._sink = sink
    }

    /** @internal Bound by the framework so a provider can access its page. */
    public _bindPage (page: Page): void {
        this.page = page
    }

    public _bindActionRunner (runner: ActionRunner): void {
        this._actionRunner = runner
    }

    protected async runAction (action: RunnableAction): Promise<void> {
        if (this._actionRunner) {
            await this._actionRunner(action)
        }
    }

    /**
     * Call this with the recognized text.
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
