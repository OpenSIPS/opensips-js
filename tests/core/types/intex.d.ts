import { EventHandler } from './events'

export interface TestScenario {
    name: string
    actions: Array<EventHandler>
}

export type TestScenarios = TestScenario[]

export interface TestContext {
    [key: string]: any
}
