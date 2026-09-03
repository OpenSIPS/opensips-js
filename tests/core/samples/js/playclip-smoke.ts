/**
 * T2.4 smoke: playClip returns { done, stop() }; stop() is idempotent and
 * done resolves with { status: 'interrupted' | 'completed' }.
 *
 * No SIP or dev server required — uses about:blank + WindowMethodsWorker only.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import { chromium } from 'playwright'

import WindowMethodsWorker from '../../services/WindowMethodsWorker'

const DEFAULT_AUDIO = path.resolve('tests/core/sounds/audio.wav')
const PLAY_MS = 1000
const STOP_SETTLE_MS = 200

function sleep (ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function loadDataUrl (filePath: string): string {
    const bytes = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const mimeType = ext === '.mp3' ? 'audio/mpeg' : 'audio/wav'
    return `data:${mimeType};base64,${bytes.toString('base64')}`
}

function startLocalPageServer (): Promise<{ url: string, close: () => Promise<void> }> {
    return new Promise((resolve, reject) => {
        const server = http.createServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end('<!DOCTYPE html><html><body></body></html>')
        })

        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            if (!address || typeof address === 'string') {
                reject(new Error('Failed to bind local page server'))
                return
            }

            resolve({
                url: `http://127.0.0.1:${address.port}/`,
                close: () => new Promise<void>((closeResolve, closeReject) => {
                    server.close((error) => (error ? closeReject(error) : closeResolve()))
                }),
            })
        })
    })
}

async function main (): Promise<void> {
    const audioPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_AUDIO
    if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`)
    }

    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const worker = new WindowMethodsWorker(page)
    const pageServer = await startLocalPageServer()

    try {
        await page.goto(pageServer.url)
        await worker.implementPlayClipMethod()

        const dataUrl = loadDataUrl(audioPath)
        const clip = {
            done: worker.playClip(dataUrl),
            stop: () => {
                void worker.stopCurrentClip()
            },
        }

        await sleep(PLAY_MS)

        const stopStartedAt = Date.now()
        clip.stop()
        clip.stop()

        const result = await clip.done
        const stopElapsedMs = Date.now() - stopStartedAt

        if (result.status !== 'interrupted') {
            throw new Error(`Expected status "interrupted", got "${result.status}"`)
        }

        if (stopElapsedMs > STOP_SETTLE_MS) {
            throw new Error(`stop() took ${stopElapsedMs}ms to settle done (limit ${STOP_SETTLE_MS}ms)`)
        }

        console.log(`✓ playClip interrupted in ${stopElapsedMs}ms`)
    } finally {
        await worker.cleanup()
        await browser.close()
        await pageServer.close()
    }
}

main()
    .then(() => {
        console.log('playClip smoke (T2.4) passed')
        process.exit(0)
    })
    .catch((error) => {
        console.error('playClip smoke failed:', error instanceof Error ? error.message : error)
        process.exit(1)
    })
