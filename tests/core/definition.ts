import fs from 'node:fs'

import TestScenariosBuilder from './services/TestScenariosBuilder'
import type { TestScenarios } from './types/intex'
import env from './env'
import { validateTestScenarios } from './schema/scenarios.schema'
import path from 'path'

export default class CallTestScenarios extends TestScenariosBuilder {
    // private logger = new QrynLogger('CallTestScenarios')

    getInitialContext () {
        return {}
    }

    async init (): Promise<TestScenarios> {
        // Get the sample path from environment
        const samplePath = path.resolve(env.SAMPLETOEXECUTE)

        // Check if the file exists
        if (!fs.existsSync(samplePath)) {
            throw new Error(`Sample file not found: ${samplePath}`)
        }

        // Read the file content
        const fileContent = fs.readFileSync(samplePath, 'utf-8')

        try {
            // Validate the JSON content against our schema
            // This will return properly typed TestScenarios that match the interface
            const scenarios: TestScenarios = validateTestScenarios(fileContent)
            // await this.logger.log('Successfully loaded and validated test scenarios', { samplePath })

            // Return the validated scenarios
            return scenarios
        } catch (error) {
            // await this.logger.error('Test scenario validation failed', {
            //     error: error instanceof Error ? error.message : String(error)
            // })
            throw new Error('Invalid test scenario format. See error details above.')
        }
    }
}
