/* eslint-disable @typescript-eslint/no-explicit-any */
import { promises as fs } from 'fs'
import { join } from 'path'

type TParams = {
    filename?: string
}

export default defineEventHandler(async (event) => {
    try {
        const config = useRuntimeConfig()
        const { filename } = event.context.params as TParams

        if (!filename?.endsWith('.json')) throw new Error('Invalid file type')

        const filePath = join(config.folderPath, filename)
        const content = await fs.readFile(filePath, 'utf-8')
        return JSON.parse(content)
    } catch (error: any) {
        console.error('File read error:', error)
        return sendError(event, createError({
            statusCode: 500,
            statusMessage: error.message
        }))
    }
})
