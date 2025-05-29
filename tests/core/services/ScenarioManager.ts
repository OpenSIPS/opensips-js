import {
    TestContext,
    TestScenarios,
} from '../types/intex'

import TestExecutor from './TestExecutor'

/**
 * ScenarioManager - Manages the execution of multiple test scenarios
 */
export default class ScenarioManager {
    private scenarios: TestScenarios
    protected testContext: TestContext = {}
    private executors: TestExecutor[] = []

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
        console.log(`[ScenarioManager] Running test scenarios (${this.scenarios.length} scenarios)`)

        // Create an executor for each scenario
        for (let i = 0; i < this.scenarios.length; i++) {
            const scenarioId = `scenario-${i + 1}`
            console.log(`[ScenarioManager] Scenario created: ${this.scenarios[i].name} (${scenarioId})`)
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
            console.error(`[ScenarioManager] Error during scenario execution: ${error instanceof Error ? error.message : String(error)}`)
            throw error
        } finally {
            // Ensure all scenarios are properly cleaned up
            for (const executor of this.executors) {
                try {
                    await executor.completeScenario()
                } catch (e) {
                    console.warn(`[ScenarioManager] Error cleaning up executor: ${e instanceof Error ? e.message : String(e)}`)
                }
            }
        }

        console.log('[ScenarioManager] All scenarios completed')
    }
}
