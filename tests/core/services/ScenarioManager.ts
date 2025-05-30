import {
    TestContext,
    TestScenarios,
} from '../types/intex'

import TestExecutor from './TestExecutor'
import QrynClient from "./QrynClient";

/**
 * ScenarioManager - Manages the execution of multiple test scenarios
 */
export default class ScenarioManager {
    private scenarios: TestScenarios
    protected testContext: TestContext = {}
    private executors: TestExecutor[] = []
    // private logger = new QrynLogger('ScenarioManager')
    // private qrynClient = new QrynClient()

    constructor (scenarios: TestScenarios, testContext: TestContext) {
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
        // await this.logger.log('Running test scenarios', { scenarioCount: this.scenarios.length })

        // Create an executor for each scenario
        for (let i = 0; i < this.scenarios.length; i++) {
            const scenarioId = `scenario-${i + 1}`
            // await this.logger.log('Scenario created', {
            //     scenarioId,
            //     scenarioName: this.scenarios[i].name
            // })
            const executor = new TestExecutor(
                scenarioId,
                this.scenarios[i].name,
                this
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
            // await this.logger.error('Error during scenario execution', {
            //     error: error instanceof Error ? error.message : String(error)
            // })
            throw error
        } finally {
            // Ensure all scenarios are properly cleaned up
            for (const executor of this.executors) {
                try {
                    executor.completeScenario()
                } catch (e) {
                    // await this.logger.warn('Error cleaning up executor', {
                    //     error: e instanceof Error ? e.message : String(e)
                    // })
                }
            }
        }

        // await this.logger.log('All scenarios completed')
    }
}
