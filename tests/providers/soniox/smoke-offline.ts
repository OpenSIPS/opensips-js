/**
 * T2.2 offline smoke for SonioxSpeechProvider (no SIP / Playwright required).
 *
 * Usage:
 *   SONIOX_API_KEY=... yarn smoke:soniox
 *   SONIOX_API_KEY=... yarn smoke:soniox -- --wav tests/core/sounds/audio.wav
 */
import fs from 'node:fs'
import path from 'node:path'

import { config } from 'dotenv'

import { SonioxSpeechProvider } from './SonioxSpeechProvider'

config()

const DEFAULT_WAV = path.resolve('tests/core/sounds/audio.wav')
const CHUNK_SIZE = 4096
const CHUNK_DELAY_MS = 50

function sleep (ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function smokeTextToSpeech (provider: SonioxSpeechProvider): Promise<void> {
    const result = await provider.textToSpeech('hello')
    const bytes = Buffer.isBuffer(result.audio) ? result.audio : Buffer.from(result.audio, 'base64')

    if (bytes.length === 0) {
        throw new Error('TTS smoke failed: empty audio buffer')
    }

    console.log(`✓ TTS: received ${bytes.length} bytes (${result.mimeType ?? 'unknown mime'})`)
}

async function smokeSpeechToText (
    provider: SonioxSpeechProvider,
    wavPath: string
): Promise<void> {
    if (!fs.existsSync(wavPath)) {
        throw new Error(`STT smoke failed: wav not found at ${wavPath}`)
    }

    const transcripts: Array<{ text: string, isFinal: boolean }> = []
    provider.onTranscript((text, isFinal) => {
        if (!text.trim()) {
            return
        }
        transcripts.push({
            text,
            isFinal: Boolean(isFinal) 
        })
        console.log(`  transcript${isFinal ? ' (final)' : ''}: ${text}`)
    })

    await provider.startRecording()

    const wav = fs.readFileSync(wavPath)
    for (let offset = 0; offset < wav.length; offset += CHUNK_SIZE) {
        await provider.writeAudioChunk(wav.subarray(offset, offset + CHUNK_SIZE))
        await sleep(CHUNK_DELAY_MS)
    }

    await provider.stopRecording()

    const finalText = transcripts
        .filter(entry => entry.isFinal)
        .map(entry => entry.text)
        .join('')
        .trim()

    if (!finalText && transcripts.length === 0) {
        throw new Error('STT smoke failed: no transcript received')
    }

    console.log(`✓ STT: ${transcripts.length} chunk(s), final text length ${finalText.length}`)
}

async function main (): Promise<void> {
    const apiKey = process.env.SONIOX_API_KEY
    if (!apiKey) {
        console.error('SONIOX_API_KEY is required for Soniox offline smoke.')
        process.exit(1)
    }

    const wavArgIndex = process.argv.indexOf('--wav')
    const wavPath = wavArgIndex >= 0
        ? path.resolve(process.argv[wavArgIndex + 1] ?? DEFAULT_WAV)
        : DEFAULT_WAV

    const provider = new SonioxSpeechProvider({
        apiKey,
        sttAudioFormat: 'wav',
    })

    console.log('Soniox offline smoke (T2.2)\n')

    await smokeTextToSpeech(provider)
    await smokeSpeechToText(provider, wavPath)

    console.log('\nAll Soniox offline smoke checks passed.')
}

main().catch((error) => {
    console.error('Soniox offline smoke failed:', error instanceof Error ? error.message : String(error))
    process.exit(1)
})
