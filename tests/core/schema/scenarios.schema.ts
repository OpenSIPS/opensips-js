import { z } from 'zod'

import type { TestScenarios } from '../types/intex'
import type { ActionByActionType, ActionType, GetActionPayload } from '../types/actions'
import {
    changeRoomPayloadSchema,
    dialPayloadSchema,
    playSoundPayloadSchema,
    registerPayloadSchema,
    requestPayloadSchema,
    sendDtmfPayloadSchema,
    textToSpeechPayloadSchema,
    transferPayloadSchema,
    waitPayloadSchema,
} from './actionPayloads.schema'

// Action wait until schema
const waitUntilSchema = z.object({
    event: z.string(),
    timeout: z.number().optional(),
})

const responseToContextSchema = z.union([
    z.object({
        setToContext: z.literal(true),
        contextKeyToSet: z.string(),
    }),
    z.object({
        setToContext: z.literal(false),
    }),
]).optional()

// Expectation schemas — the two kinds the executor actually understands.
// Loose objects: extra expectation-specific properties are allowed through.
const websocketExpectationSchema = z.looseObject({
    type: z.literal('websocket'),
    method: z.string(),
    status_code: z.number().optional(),
    timeout: z.number().optional(),
    checkSentEvent: z.boolean().optional(),
    description: z.string().optional(),
})

const responseExpectationSchema = z.looseObject({
    type: z.literal('response'),
    properties: z.record(z.string(), z.unknown()).optional(),
    description: z.string().optional(),
})

// Expectations array (OR groups of AND conditions)
const expectationsSchema = z.array(
    z.array(z.discriminatedUnion('type', [ websocketExpectationSchema, responseExpectationSchema ]))
).optional()

const actionDataBaseShape = {
    waitUntil: z.array(waitUntilSchema).optional(),
    customSharedEvent: z.string().optional(),
    responseToContext: responseToContextSchema,
    expect: expectationsSchema,
}

function actionWithPayload<T extends ActionType> (
    type: T,
    payload: z.ZodType<NonNullable<GetActionPayload<ActionByActionType<T>>>>
) {
    return z.object({
        type: z.literal(type),
        data: z.object({
            ...actionDataBaseShape,
            payload: payload.optional(),
        }).optional(),
    })
}

function actionWithoutPayload<T extends ActionType> (type: T) {
    return z.object({
        type: z.literal(type),
        data: z.object(actionDataBaseShape).optional(),
    })
}

// One schema branch per action type — the discriminated union both rejects
// unknown action types at load time and types each payload precisely, so the
// parse output is assignable to TestScenarios without casts.
const actionDefinitionSchema = z.discriminatedUnion('type', [
    actionWithPayload('register', registerPayloadSchema),
    actionWithPayload('dial', dialPayloadSchema),
    actionWithPayload('wait', waitPayloadSchema),
    actionWithPayload('playSound', playSoundPayloadSchema),
    actionWithPayload('sendDTMF', sendDtmfPayloadSchema),
    actionWithPayload('transfer', transferPayloadSchema),
    actionWithPayload('changeRoom', changeRoomPayloadSchema),
    actionWithPayload('request', requestPayloadSchema),
    actionWithPayload('textToSpeech', textToSpeechPayloadSchema),
    actionWithoutPayload('answer'),
    actionWithoutPayload('hold'),
    actionWithoutPayload('unhold'),
    actionWithoutPayload('hangup'),
    actionWithoutPayload('DND'),
    actionWithoutPayload('unregister'),
    actionWithoutPayload('startTranscription'),
    actionWithoutPayload('stopTranscription'),
])

// Event handler schema
const eventHandlerSchema = z.object({
    event: z.string(),
    actions: z.array(actionDefinitionSchema),
})

// Single scenario schema
const testScenarioSchema = z.object({
    name: z.string(),
    actions: z.array(eventHandlerSchema),
})

// The complete test scenarios schema (array of scenarios)
export const testScenariosSchema = z.array(testScenarioSchema)

/**
 * Validates a JSON string or parsed object against the test scenarios schema
 * @param jsonData - JSON string or parsed object containing test scenarios
 * @returns Validated and typed test scenarios as TestScenarios interface
 * @throws Zod validation error if validation fails
 */
export function validateTestScenarios (jsonData: string | unknown): TestScenarios {
    const data: unknown = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData

    return testScenariosSchema.parse(data)
}

/**
 * Safe version that returns result with success/error information instead of throwing
 * @param jsonData - JSON string or parsed object containing test scenarios
 * @returns Object with success flag and either parsed data or error
 */
export function validateTestScenariosSafe (jsonData: string | unknown):
    { success: true, data: TestScenarios } | { success: false, error: unknown } {
    try {
        return {
            success: true,
            data: validateTestScenarios(jsonData),
        }
    } catch (error) {
        return {
            success: false,
            error,
        }
    }
}
