import {
    TestContext,
    TestScenarios,
} from '../types/intex'

import TestExecutor from './TestExecutor'
import QrynClient from './QrynClient'
import SharedEventCoordinator from './SharedEventCoordinator'
import { TelemetryService } from './TelemetryService'
import { SpeechProviderInput, resolveSpeechProvider } from './speech/BaseSpeechProvider'

/**
 * ScenarioManager - Manages the execution of multiple test scenarios
 */
export default class ScenarioManager {
    private scenarios: TestScenarios
    protected testContext: TestContext = {}
    private executors: TestExecutor[] = []
    private qrynClient = new QrynClient('ScenarioManager')

    constructor (
        scenarios: TestScenarios,
        testContext: TestContext,
        private readonly speechProvider?: SpeechProviderInput
    ) {
        this.scenarios = scenarios
        this.testContext = testContext
    }

    public getContext (): TestContext {
        return {
            ...this.testContext
        }
    }

    public updateContext (context: TestContext): void {
        this.testContext = {
            ...this.testContext,
            ...context
        }
    }

    public async runScenarios (): Promise<void> {
        await this.qrynClient.log('Running test scenarios...', { scenarioCount: this.scenarios.length })

        const sharedEvents = new SharedEventCoordinator()

        // Create an executor for each scenario
        for (let i = 0; i < this.scenarios.length; i++) {
            const scenarioId = `scenario-${i + 1}`
            await this.qrynClient.log('Scenario created', {
                scenarioId,
                scenarioName: this.scenarios[i].name
            })
            const executor = new TestExecutor(
                scenarioId,
                this.scenarios[i].name,
                this,
                sharedEvents,
                resolveSpeechProvider(this.speechProvider)
            )
            this.executors.push(executor)
        }

        // Execute all scenarios in parallel but don't wait for completion immediately
        const scenarioPromises = this.scenarios.map((scenario, index) =>
            this.executors[index].executeScenario(scenario)
        )

        try {
            // Wait for all scenarios to complete
            await Promise.all(scenarioPromises)
        } catch (error) {
            await this.qrynClient.error('Error during scenario execution', {
                error: error instanceof Error ? error.message : String(error)
            })
            throw error
        } finally {
            sharedEvents.clear()

            // Ensure all scenarios are properly cleaned up
            for (const executor of this.executors) {
                try {
                    executor.completeScenario()
                } catch (e) {
                    await this.qrynClient.warn('Error cleaning up executor', {
                        error: e instanceof Error ? e.message : String(e)
                    })
                }
            }

            // Stop the shared OTel SDK so its periodic exporters release the
            // event loop and the process can exit without Ctrl+C (T1.3).
            await TelemetryService.shutdownSdk()
        }

        // await this.qrynClient.log('All scenarios completed')
    }
}
