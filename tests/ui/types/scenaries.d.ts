/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ObjectAnyType } from '~/types/index'

export type TestScenarioEvent = {
    event: TScenarioActionName,
    actions: Array<TestScenarioEventAction>
}

export type TestScenarioEventAction = {
    type: TestScenarioEventActionType | undefined,
    data?: TestScenarioEventActionTypeData
}

export type TestScenarioEventActionType =
    'register'
    | 'dial'
    | 'answer'
    | 'hold'
    | 'unhold'
    | 'hangup'
    | 'playSound'
    | 'sendDTMF'
    | 'transfer'
    | 'unregister'
    | 'ready'
    | 'incoming'
    | 'wait'
    | 'request'

export type TestScenarioEventActionTypeData = {
    payload?: TestScenarioEventActionTypeDataPayload
    customSharedEvent?: string
    responseToContext?: TResponseToContext
    waitUntil?: Array<TWaitUntil>
}

export type TestScenarioEventActionTypeDataPayload = {
    sound?: string
    time?: number
    url?: string
    options?: ObjectAnyType
    sip_domain?: string
    username?: string
    password?: string
    target?: string
}

export type TResponseToContext = {
    setToContext: boolean
    contextKeyToSet?: string
}

export type TWaitUntil = {
    event: string
    timeout?: number
}

export type TScenarioActionName = TestScenarioEventActionType | string

export interface TestScenario {
    name: string
    actions: Array<TestScenarioEvent>
    uId?: string
}

export type TestScenarios = TestScenario[]

export interface TestContext {
    [key: string]: any
}

export type TScenarioActionsMap = Record<string, TScenarioActionsMapValue>

export type TScenarioActionsMapValue = {
    key: TestScenarioEventActionType,
    label: string,
    actions: Array<{ label: string, value: TestScenarioEventActionType }>
}

export type TJsonSetupForm = {
    fileName: string
    scenarios: TestScenario[]
}
