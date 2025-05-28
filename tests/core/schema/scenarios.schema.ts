import { z } from 'zod'
import type { TestScenarios } from '../types/intex'

// Basic primitive schemas
const eventNameSchema = z.string()

// Action wait until schema
const waitUntilSchema = z.object({
    event: z.string(),
    timeout: z.number().optional()
}).optional()

// Generic filter function schema
const responseToContextEnabledSchema = z.object({
    setToContext: z.literal(true),
    contextKeyToSet: z.string()
}).optional()

const responseToContextDisabledSchema = z.object({
    setToContext: z.literal(false),
    contextKeyToSet: z.string().optional()
}).optional()

const responseToContextSchema = z.union([
    responseToContextEnabledSchema,
    responseToContextDisabledSchema
]).optional()

// Simplified action data schema that accepts any type of action
const actionDataSchema = z.object({
    type: z.string(),
    data: z.object({
        payload: z.record(z.any()).optional(),
        waitUntil: waitUntilSchema,
        customSharedEvent: z.string().optional(),
        responseToContext: responseToContextSchema
    }).optional()
})

// Event handler schema
const eventHandlerSchema = z.object({
    event: eventNameSchema,
    actions: z.array(actionDataSchema)
})

// Single scenario schema
const testScenarioSchema = z.object({
    name: z.string(),
    actions: z.array(eventHandlerSchema)
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
    // Parse JSON string if needed
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData

    // Validate against schema
    const validated = testScenariosSchema.parse(data)

    // Return as TestScenarios type (matches the interface exactly)
    return validated as TestScenarios
}

/**
 * Safe version that returns result with success/error information instead of throwing
 * @param jsonData - JSON string or parsed object containing test scenarios
 * @returns Object with success flag and either parsed data or error
 */
export function validateTestScenariosSafe (jsonData: string | unknown):
    { success: true, data: TestScenarios } | { success: false, error: unknown } {
    try {
        const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData
        return {
            success: true,
            data: testScenariosSchema.parse(data) as TestScenarios
        }
    } catch (error) {
        return {
            success: false,
            error
        }
    }
}
