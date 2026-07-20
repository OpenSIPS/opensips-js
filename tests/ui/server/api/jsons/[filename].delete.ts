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

        // Security check: Only allow .json files
        if (!filename?.endsWith('.json')) {
            throw new Error('Invalid file type — only .json files can be deleted.')
        }

        const filePath = join(config.folderPath, filename)

        // Optional: Check if file exists before deleting
        await fs.access(filePath)
        await fs.unlink(filePath)

        return {
            status: 'deleted',
            file: filename
        }
    } catch (error: any) {
        console.error('Delete file error:', error)
        return sendError(event, createError({
            statusCode: 500,
            statusMessage: error.message
        }))
    }
})
