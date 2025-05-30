import CallTestScenarios from './definition'

// Run the test
async function runTest () {
    // const logger = new QrynLogger('TestRunner')

    // await logger.log('Starting test execution')
    try {
        const testRunner = new CallTestScenarios()
        await testRunner.run()
        // await logger.log('Test execution completed successfully')
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
