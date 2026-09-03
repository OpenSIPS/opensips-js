export type DriverState = 'listening' | 'thinking' | 'speaking'

export type HistoryRole = 'user' | 'assistant'

export interface HistoryMessage {
    role: HistoryRole
    content: string
}

export type DriverStopReason =
    | 'hangup'
    | 'hardStop'
    | 'remoteEnded'
    | 'error'

export interface DriverReport {
    history: HistoryMessage[]
    stopReason: DriverStopReason
    hardStopTriggered: boolean
    logEntries: Record<string, unknown>[]
    /** ISO timestamps and wall-clock duration of the driver run (call timings). */
    startedAt: string
    endedAt: string
    durationMs: number
}

export interface ConversationDriverOptions {
    /** Pure silence (no transcripts at all) before triggering a turn, ms. */
    silenceMs?: number
    /** Pause after a FINAL transcript before triggering a turn, ms — the fast path. */
    utteranceEndMs?: number
    /** Sustained remote speech during thinking/speaking before barge-in, ms. */
    bargeInConfirmMs?: number
    /** Anthropic model id. */
    model?: string
}
