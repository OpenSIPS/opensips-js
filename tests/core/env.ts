import { z } from 'zod'
import { unflatten } from 'flat'
import { config } from 'dotenv'

config()

/**
 * Configuration schema for individual Gigapipe service endpoints
 */
const gigapipeServiceConfig = z.object({
    url: z.string().url({
        message: 'Service URL must be a valid URL'
    }),
    username: z.string({
        required_error: 'username is required',
        invalid_type_error: 'username must be a string'
    }),
    password: z.string({
        required_error: 'password is required',
        invalid_type_error: 'password must be a string'
    }),
    headers: z.string().transform((str) => {
        try {
            return JSON.parse(str)
        } catch (error) {
            if (error instanceof z.ZodError) {
                console.error('Environment headers validation failed:')
                error.errors.forEach(err => {
                    console.error(`- ${err.path.join('.')}: ${err.message}`)
                })
            }
            throw error
        }
    }),
    scope: z.string({
        required_error: 'Service scope is required',
        invalid_type_error: 'Service scope must be a string'
    }),
    OrgID: z.string( {
        required_error: 'OrgID is required',
        invalid_type_error: 'OrgID must be an number'
    }),
})

/**
 * Complete Gigapipe configuration schema with validation for all combinations
 */
const gigapipeSchema = z.object({
    DEFAULT: gigapipeServiceConfig.optional(),
    TRACING: gigapipeServiceConfig.optional(),
    METRICS: gigapipeServiceConfig.optional(),
    LOGS: gigapipeServiceConfig.optional()
}).refine(data => {
    // If there's no DEFAULT, then all specific services must be provided
    if (!data.DEFAULT) {
        return Boolean(data.TRACING && data.METRICS && data.LOGS)
    }
    // Otherwise, DEFAULT exists, which is valid on its own or with any combination of overrides
    return true
}, {
    message: 'Either DEFAULT configuration or all specific services (TRACING, METRICS, LOGS) must be provided'
})

/**
 * Complete environment configuration schema
 */
const envSchema = z.object({
    // Application configuration
    SAMPLETOEXECUTE: z.string({
        required_error: 'Sample execution path is required',
        invalid_type_error: 'Sample execution path must be a string'
    }),
    PORT: z.coerce.number({
        required_error: 'Application port is required',
        invalid_type_error: 'Application port must be a number'
    }).int({
        message: 'Application port must be an integer'
    }).positive({
        message: 'Application port must be a positive number'
    }).default(5173),

    // Gigapipe configuration
    GIGAPIPE: gigapipeSchema.optional(),

    // SIP parameters configuration
    PARAMETERS: z.any()
})

/**
 * Type for the validated environment configuration
 */
export type EnvConfig = z.infer<typeof envSchema>
export type GigapipeConfigType = z.infer<typeof gigapipeServiceConfig>
export type GIGAPIPE_TYPES = keyof z.infer<typeof gigapipeSchema>

/**
 * Parses and validates the environment variables
 * @param env - The environment variables object (typically process.env)
 * @returns Validated environment configuration
 */
export function parseEnv (env: Record<string, string | undefined>): EnvConfig {
    try {
        // First unflatten the environment using dot notation
        const unflattened = unflatten(env, { delimiter: '.' })

        // Then validate with our schema
        return envSchema.parse(unflattened)
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('Environment validation failed:')
            error.errors.forEach(err => {
                console.error(`- ${err.path.join('.')}: ${err.message}`)
            })
        }
        throw error
    }
}

export default parseEnv(process.env)
