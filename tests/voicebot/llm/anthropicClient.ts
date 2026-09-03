import { createAnthropic } from '@ai-sdk/anthropic'

/** Fast model for both the conversation driver and the post-call judge. */
export const DEFAULT_VOICEBOT_MODEL = 'claude-haiku-4-5'

/**
 * The AI SDK expects ANTHROPIC_BASE_URL to already include /v1 (it only
 * appends /messages), while other tools (e.g. Claude Code) set the same
 * variable without /v1. Normalize so both conventions work.
 */
export function resolveAnthropicBaseUrl (): string | undefined {
    const raw = process.env.ANTHROPIC_BASE_URL

    if (!raw) {
        return undefined
    }

    const trimmed = raw.replace(/\/+$/, '')

    if (trimmed.endsWith('/v1')) {
        return trimmed
    }

    console.warn(`[anthropicClient] ANTHROPIC_BASE_URL has no /v1 suffix, using ${trimmed}/v1`)
    return `${trimmed}/v1`
}

export function createVoicebotAnthropic (): ReturnType<typeof createAnthropic> {
    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is required')
    }

    return createAnthropic({
        apiKey,
        baseURL: resolveAnthropicBaseUrl(),
    })
}
