import { createCallSession } from '../../session/CallSession'

/**
 * T2.3 smoke: call.speak() with optional outgoing audio effects.
 * Sequence: clean phrase → packetLoss → clean again (effects reset in finally).
 *
 * Preconditions:
 *   - Test UI dev server on env.PORT (`yarn dev`).
 *   - SMOKE_SIP_* / SMOKE_DIAL_TARGET env vars (same as session-smoke).
 *   - SONIOX_API_KEY for TTS synthesis.
 */
function requireEnv (name: string): string {
    const value = process.env[name]

    if (!value) {
        throw new Error(`Missing required env var ${name} for speak-effects smoke test`)
    }

    return value
}

async function loadSpeechProvider () {
    const apiKey = requireEnv('SONIOX_API_KEY')
    const { SonioxSpeechProvider } = await import('../../../providers/soniox/SonioxSpeechProvider')

    return new SonioxSpeechProvider({ apiKey })
}

async function main (): Promise<void> {
    const creds = {
        sip_domain: requireEnv('SMOKE_SIP_DOMAIN'),
        username: requireEnv('SMOKE_SIP_USERNAME'),
        password: requireEnv('SMOKE_SIP_PASSWORD'),
    }
    const dialTarget = requireEnv('SMOKE_DIAL_TARGET')
    const speechProvider = await loadSpeechProvider()

    console.log('[smoke:speak-effects] creating call session...')
    const session = await createCallSession({
        scenarioName: 'speak-effects-smoke',
        speechProvider,
    })

    try {
        await session.register(creds)
        const call = await session.dial(dialTarget)

        console.log('[smoke:speak-effects] 1/3 — clean line')
        await call.speak({ text: 'This line should sound clean.' })
        await new Promise((resolve) => setTimeout(resolve, 500))

        console.log('[smoke:speak-effects] 2/3 — packet loss 0.3')
        await call.speak({
            text: 'This line should sound choppy.',
            effects: { packetLoss: 0.3 },
        })
        await new Promise((resolve) => setTimeout(resolve, 500))

        console.log('[smoke:speak-effects] 3/3 — clean again after reset')
        await call.speak({ text: 'This line should be clean again.' })

        await call.hangup()
        console.log('[smoke:speak-effects] OK — listen back recording to confirm audio quality')
    } finally {
        await session.dispose()
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('[smoke:speak-effects] FAILED:', error instanceof Error ? error.message : error)
        process.exit(1)
    })
