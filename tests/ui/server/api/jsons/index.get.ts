/* eslint-disable @typescript-eslint/no-explicit-any */
import { promises as fs } from 'fs'

export default defineEventHandler(async () => {
    try {
        const config = useRuntimeConfig()
        const folderPath = config.folderPath

        if (!folderPath) {
            throw createError({
                statusCode: 500,
                statusMessage: 'FOLDER_PATH is not defined in runtime config'
            })
        }

        const files = await fs.readdir(folderPath)
        const jsonFiles = files.filter(f => f.endsWith('.json'))

        return { files: jsonFiles }
    } catch (error: any) {
        console.error('API error:', error)
        throw createError({
            statusCode: error.statusCode || 500,
            statusMessage: error.statusMessage || error.message || 'Unknown error'
        })
    }
})
