/* eslint-disable @typescript-eslint/no-explicit-any */
import { promises as fs } from 'fs'
import { join } from 'path'
import { H3Event } from 'h3'

type Params = { filename?: string }

export default defineEventHandler(async (event: H3Event) => {
    try {
        const config = useRuntimeConfig()
        const { filename } = event.context.params as Params
        const body = await readBody(event)

        if (!filename?.endsWith('.json')) {
            throw createError({
                statusCode: 400,
                statusMessage: 'Invalid filename'
            })
        }

        const filePath = join(config.folderPath, filename)

        let exists = true
        try {
            await fs.access(filePath)
        } catch {
            exists = false
        }

        await fs.writeFile(filePath, JSON.stringify(body, null, 2))

        return {
            status: exists ? 'updated' : 'created',
            file: filename
        }

    } catch (error: any) {
        console.error('Upsert error:', error)
        throw createError({
            statusCode: error.statusCode || 500,
            statusMessage: error.statusMessage || 'Failed to save file'
        })
    }
})
