import { createCallSession } from '../../session/CallSession'

/**
 * T1.1 smoke: createCallSession -> register -> dial (own extension) -> hangup
 * -> dispose. Verifies the CallSession facade reproduces the same qryn
 * expectation chain (INVITE 200, BYE 200) that TestExecutor produced.
 *
 * Preconditions:
 *   - The test UI dev server must be running on env.PORT (e.g. `yarn dev`).
 *   - SIP credentials and dial target are read from environment variables so
 *     no secrets are hard-coded.
 */
function requireEnv (name: string): string {
    const value = process.env[name]

    if (!value) {
        throw new Error(`Missing required env var ${name} for session smoke test`)
    }

    return value
}

async function main (): Promise<void> {
    const creds = {
        sip_domain: requireEnv('SMOKE_SIP_DOMAIN'),
        username: requireEnv('SMOKE_SIP_USERNAME'),
        password: requireEnv('SMOKE_SIP_PASSWORD'),
    }
    const dialTarget = requireEnv('SMOKE_DIAL_TARGET')

    console.log('[smoke] creating call session...')
    const session = await createCallSession({ scenarioName: 'session-smoke' })

    try {
        console.log('[smoke] registering...')
        await session.register(creds)

        console.log('[smoke] dialing own extension:', dialTarget)
        const call = await session.dial(dialTarget)

        console.log('[smoke] connected — waiting briefly before hangup')
        await new Promise((resolve) => setTimeout(resolve, 3000))

        console.log('[smoke] hanging up...')
        await call.hangup()

        console.log('[smoke] OK: register -> dial (INVITE 200) -> hangup (BYE 200) passed')
    } finally {
        console.log('[smoke] disposing session...')
        await session.dispose()
    }
}

main()
    .then(() => {
        console.log('[smoke] done')
        process.exit(0)
    })
    .catch((error) => {
        console.error('[smoke] FAILED:', error instanceof Error ? error.message : error)
        process.exit(1)
    })
