import QrynClient from '../../../services/QrynClient'
import AiVoiceBotScenario from './ai-voice-bot.scenario'
import { AiVoiceBotProvider } from './AiVoiceBotProvider'

async function run (): Promise<void> {
    const qrynClient = new QrynClient('AdvancedTestRunner')
    await qrynClient.log('Starting advanced AI voice-bot test')

    const sonioxApiKey = process.env.SONIOX_API_KEY
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY

    if (!sonioxApiKey) {
        throw new Error('SONIOX_API_KEY is required')
    }
    if (!anthropicApiKey) {
        throw new Error('ANTHROPIC_API_KEY is required')
    }

    const scenario = new AiVoiceBotScenario()

    const speechProvider = () => new AiVoiceBotProvider({
        sonioxApiKey,
        anthropicApiKey,
        // Degrade the audio (what the bot hears)
        impairment: {
            volume: 0.9,      // (0 = silence, 1 = original)
            noise: 0.02,      // background noise (0 = none, 1 = very loud)
            packetLoss: 0.15,  // ~15% of ~40ms blocks dropped (0 = none, 1 = constant)
            impairBothDirections: false // impair both directions of the call
        }
    })

    await scenario.run(speechProvider)

    await qrynClient.log('Call is live; conversation runs until the remote party hangs up')
}

run().catch((error) => {
    console.error(
        '[advanced] fatal error:',
        error instanceof Error ? error.message : error
    )
})
