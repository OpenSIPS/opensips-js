import { writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve } from 'path'

import { createCallSession } from '../core/session/CallSession'
import QrynClient from '../core/services/QrynClient'
import { SonioxSpeechProvider } from '../providers/soniox/SonioxSpeechProvider'

import { ConversationDriver } from './driver/ConversationDriver'
import { evaluate } from './evaluation/evaluate'
import { renderTranscript } from './evaluation/llmJudge'
import { loginAndFetchSip } from './helpers/loginAndFetchSip'
import { buildSystemPrompt } from './prompt/buildSystemPrompt'
import { loadManifest } from './schema/manifest.schema'

function requireEnv (name: string): string {
    const value = process.env[name]

    if (!value) {
        throw new Error(`Missing required env var ${name}`)
    }

    return value
}

/**
 * Accepts either a path to a manifest file or a bare manifest name
 * (looked up in tests/voicebot/manifests), per RUNNER-TASKS §1.
 */
function resolveManifestPath (manifestArg: string): string {
    const candidates = [
        resolve(process.cwd(), manifestArg),
        resolve(process.cwd(), 'tests/voicebot/manifests', manifestArg),
    ]

    const found = candidates.find((candidate) => existsSync(candidate))

    if (!found) {
        throw new Error(`Manifest not found. Tried:\n${candidates.join('\n')}`)
    }

    return found
}

async function main (): Promise<void> {
    const manifestPath = process.argv[2]

    if (!manifestPath) {
        throw new Error('Usage: yarn test:voicebot -- <path-to-manifest.json>')
    }

    const sonioxApiKey = requireEnv('SONIOX_API_KEY')
    requireEnv('ANTHROPIC_API_KEY')

    const manifest = await loadManifest(resolveManifestPath(manifestPath))
    const dialTarget = process.env.VOICEBOT_DIAL_TARGET ?? manifest.target.dial

    console.log(`[voicebot] testRunId=${manifest.testRunId} dial=${dialTarget}`)

    const soniox = new SonioxSpeechProvider({
        apiKey: sonioxApiKey,
        ttsLanguage: manifest.language.code,
        ttsVoice: manifest.language.ttsVoice ?? undefined,
    })

    const scenarioId = `voicebot-${manifest.testRunId}`

    const session = await createCallSession({
        scenarioName: 'voicebot-runner',
        scenarioId,
        speechProvider: soniox,
        // VOICEBOT_MONITOR=1 routes the outgoing voice to the local speakers too.
        monitorOutgoingAudio: process.env.VOICEBOT_MONITOR === '1',
    })

    try {
        console.log('[voicebot] registering SIP...')
        await session.register(await loginAndFetchSip())

        console.log('[voicebot] dialing', dialTarget)
        const call = await session.dial(dialTarget)

        const driver = new ConversationDriver({
            call,
            session,
            speech: soniox,
            prompt: buildSystemPrompt(manifest),
            hardStopSec: manifest.antiLoop.maxDurationSec,
            defaultSpeechEffects: manifest.outgoingAudioEffects,
        })

        const report = await driver.run()
        const metrics = session.metrics()

        console.log(`[voicebot] call finished — stopReason=${report.stopReason}, evaluating verdicts...`)

        // Artifacts (§6.2): transcript and driver events go to qryn under the
        // run's scenario_id; the result file carries references, not the data.
        const qryn = new QrynClient('VoicebotRunner', 'voicebot-runner', scenarioId)
        await qryn.log('voicebot transcript', {
            transcript: renderTranscript(report.history),
            history: report.history,
        })
        await qryn.log('voicebot driver events', {
            stopReason: report.stopReason,
            hardStopTriggered: report.hardStopTriggered,
            durationMs: report.durationMs,
            logEntries: report.logEntries,
        })

        const evaluation = await evaluate(manifest.verdicts, {
            report,
            metrics,
        })

        const result = {
            testRunId: manifest.testRunId,
            outcome: evaluation.outcome,
            completedAt: new Date().toISOString(),
            verdictResults: evaluation.verdictResults,
            ...(evaluation.harnessError ? { harnessError: evaluation.harnessError } : {}),
            artifacts: {
                transcriptRef: `qryn:scenario_id=${scenarioId}`,
                eventsRef: `qryn:scenario_id=${scenarioId}`,
            },
            // Local debugging convenience — the canonical artifacts live in qryn.
            debug: {
                stopReason: report.stopReason,
                hardStopTriggered: report.hardStopTriggered,
                startedAt: report.startedAt,
                endedAt: report.endedAt,
                durationMs: report.durationMs,
                history: report.history,
                logEntries: report.logEntries,
                metrics,
            },
        }

        const outPath = resolve(process.cwd(), `voicebot-result-${manifest.testRunId}.json`)
        await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')

        console.log(`[voicebot] outcome=${evaluation.outcome}`)
        for (const verdict of evaluation.verdictResults) {
            const warning = verdict.warning ? ' (warning)' : ''
            console.log(`[voicebot]   verdict ${verdict.verdictId} "${verdict.name}": ${verdict.state}${warning}`)
        }
        console.log(`[voicebot] result written to ${outPath}`)
    } finally {
        await session.dispose()
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('[voicebot] FAILED:', error instanceof Error ? error.message : error)
        process.exit(1)
    })
