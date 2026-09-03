import { z } from 'zod'
import type { Page } from 'playwright'

import type { ActionsExecutorImplements } from '../types/actions'
import type { SpeechProvider } from '../services/speech/BaseSpeechProvider'
import type { TelemetryService } from '../services/TelemetryService'
import type { AudioMetrics, CallMetric } from '../services/WebRTCMetricsCollector'

export type Unsubscribe = () => void

export type SessionEvent =
    | 'ready'
    | 'incoming'
    | 'callConfirmed'
    | 'callCancelled'
    | 'callEnded'
    | 'callUpdated'
    | 'messageReceived'
    | 'optionsReceived'
    | 'callReferred'
    | 'infoReceived'
    | 'notificationReceived'

export interface SipCredentials {
    sip_domain: string
    username: string
    password: string
}

// Single source of truth for these payloads are the zod schemas (RUNNER-TASKS §5.0);
// re-exported here so the session layer keeps one stable import path.
import type { AudioEffects } from '../actions/schemas/audioEffects.schema'
import type { SpeakPayload } from '../actions/schemas/runnerPayloads.schema'

export type { AudioEffects, SpeakPayload }

export const callEndInfoSchema = z.object({
    reason: z.string().optional(),
})

export type CallEndInfo = z.infer<typeof callEndInfoSchema>

export type ClipPlaybackStatus = 'completed' | 'interrupted'

export interface ClipPlaybackResult {
    status: ClipPlaybackStatus
}

export interface PlayingClip {
    done: Promise<ClipPlaybackResult>
    /** Idempotent — safe to call more than once; interrupts the current clip. */
    stop (): void
}

/**
 * Streaming PCM playback: raw s16le mono chunks are scheduled gaplessly as
 * they arrive, so audio starts sounding on the first chunk. Structurally a
 * superset of PlayingClip.
 */
export interface PcmStreamClip extends PlayingClip {
    append (chunk: Buffer): Promise<void>
    /** No more chunks — `done` resolves 'completed' once scheduled audio finishes. */
    end (): Promise<void>
}

export interface WebRTCMetricsReport {
    setupTime: number | null
    totalDuration: number
    connectionSuccessful: boolean
    audioMetrics: AudioMetrics | null
    allStats: CallMetric[]
    scenarioName?: string
    scenarioId?: string
}

export interface SessionConfig {
    scenarioName?: string
    scenarioId?: string
    headless?: boolean
    speechProvider?: SpeechProvider
    /** Reuse an existing telemetry instance (declarative TestExecutor path). */
    telemetryService?: TelemetryService
    /** When true, setup() does not emit `ready` — caller emits after wiring handlers. */
    skipReadyEmit?: boolean
    /**
     * Also route the OUTGOING audio (what the remote party hears) to the local
     * speakers, so an operator can monitor the synthesized voice. Safe: the real
     * microphone is never captured, so no echo reaches the call or the STT.
     */
    monitorOutgoingAudio?: boolean
    /** Called when the Playwright page closes (e.g. after unregister). */
    onPageClose?: () => void
}

export interface ActiveCall {
    hangup (): Promise<void>
    sendDTMF (digits: string): Promise<void>
    hold (): Promise<void>
    unhold (): Promise<void>
    transfer (target: string): Promise<void>
    speak (payload: SpeakPayload): Promise<void>
    audio: {
        captureRemote (onChunk: (chunk: Buffer) => void): Unsubscribe
        playClip (dataUrl: string): PlayingClip
        openPcmStream (sampleRate: number): PcmStreamClip
    }
    ended: Promise<CallEndInfo>
}

export interface CallSession {
    register (creds: SipCredentials): Promise<void>
    dial (target: string): Promise<ActiveCall>
    /** Answers an incoming call — the inbound counterpart of dial(). */
    answer (): Promise<ActiveCall>
    on (event: string, cb: (...a: unknown[]) => void): Unsubscribe
    emit (event: string, data?: unknown): void
    emitReady (): void
    waitFor (event: string, timeout?: number): Promise<unknown>
    getPage (): Page
    getActionsExecutor (): ActionsExecutorImplements
    metrics (): WebRTCMetricsReport
    dispose (): Promise<void>
}
