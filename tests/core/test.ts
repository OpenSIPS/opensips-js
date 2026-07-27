import CallTestScenarios from './definition'
import QrynClient from "./services/QrynClient";

// Run the test
async function runTest () {
    const qrynClient = new QrynClient('TestRunner')

    await qrynClient.log('Starting test execution')
    try {
        const testRunner = new CallTestScenarios()

        // Wire an optional speech provider (TTS/STT) when configured.
        // Loaded dynamically so scenarios without speech don't require the provider deps.
        // Pass a FACTORY (not a single instance) so each scenario gets its own
        // provider (separate STT socket + transcript sink); a shared instance would
        // route transcripts to the wrong scenario and mix both audio streams.
        let speechProvider
        if (process.env.SONIOX_API_KEY) {
            const apiKey = process.env.SONIOX_API_KEY
            const { SonioxSpeechProvider } = await import('../providers/soniox/SonioxSpeechProvider')
            speechProvider = () => new SonioxSpeechProvider({ apiKey })
            await qrynClient.log('Speech provider enabled: Soniox')
        }

        await testRunner.run(speechProvider)
        await qrynClient.log('Test execution completed successfully')
    } catch (error) {
        // await logger.error('Test execution failed', {
        //     error: error instanceof Error ? error.message : String(error)
        // })
    }
}

// Start the test
runTest().catch(async err => {
    // const logger = new QrynLogger('TestRunner')
    // await logger.error('Unhandled error in test execution', {
    //     error: err instanceof Error ? err.message : String(err)
    // })
})
