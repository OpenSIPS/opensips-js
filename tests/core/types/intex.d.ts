import { EventHandler, EventType } from './events'

export interface TestScenario {
    name: string
    actions: Array<EventHandler<EventType>>
}

export type TestScenarios = TestScenario[]

export interface TestContext {
    [key: string]: any
}
