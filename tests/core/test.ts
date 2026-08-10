import CallTestScenarios from './definition'
import QrynClient from "./services/QrynClient";

// Run the test
async function runTest () {
    const qrynClient = new QrynClient('TestRunner')

    await qrynClient.log('Starting test execution')
    try {

        // Uncomment to run the JSON sample
        /* const testRunner: CallTestScenarios = new CallTestScenarios()
        await qrynClient.log('Scenario source: JSON sample') */

        // Uncomment to run the JS sample
        const { default: TtsSttJsScenario } = await import('./samples/js/tts-stt.scenario')
        const testRunner: InstanceType<typeof TtsSttJsScenario> = new TtsSttJsScenario()
        await qrynClient.log('Scenario source: JS builder (tts-stt.scenario.ts)')

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
