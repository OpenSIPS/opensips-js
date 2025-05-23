import { Page } from 'playwright'
import QrynLogger from './QrynLogger'

type PlayClipFunction = (url: string) => Promise<void>

declare global {
    interface Window {
        playClip: PlayClipFunction
        audioContext?: AudioContext
        mediaStreamDestination?: MediaStreamAudioDestinationNode
        originalGetUserMedia?: typeof navigator.mediaDevices.getUserMedia
    }
}

export default class WindowMethodsWorker {
    private isInitialized = false
    private logger = new QrynLogger('WindowMethodsWorker')

    constructor (
        private readonly page: Page
    ) {}

    public async implementPlayClipMethod (): Promise<void> {
        if (this.isInitialized) {
            return
        }

        await this.page.addInitScript(() => {
            // Store original getUserMedia
            const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)

            // Create AudioContext and destination
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
            const mediaStreamDestination = audioContext.createMediaStreamDestination()

            // Store references globally for cleanup and reuse
            window.audioContext = audioContext
            window.mediaStreamDestination = mediaStreamDestination
            window.originalGetUserMedia = originalGetUserMedia

            // Override getUserMedia to return our audio stream when audio is requested
            navigator.mediaDevices.getUserMedia = async (constraints) => {
                console.log('getUserMedia called with constraints:', constraints)

                if (constraints && constraints.audio) {
                    console.log('Returning custom audio stream')
                    return mediaStreamDestination.stream
                }

                // For video or other constraints, use original implementation
                return originalGetUserMedia(constraints)
            }

            // Implement playClip function
            window.playClip = async (url: string): Promise<void> => {
                console.log('playClip called with URL:', url)

                try {
                    // Resume AudioContext if suspended (required by browser policies)
                    if (audioContext.state === 'suspended') {
                        console.log('Resuming suspended AudioContext')
                        await audioContext.resume()
                    }

                    console.log('Fetching audio data from URL:', url)
                    const response = await fetch(url)
                    if (!response.ok) {
                        throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`)
                    }

                    const arrayBuffer = await response.arrayBuffer()
                    console.log('Audio data fetched, size:', arrayBuffer.byteLength, 'bytes')

                    console.log('Decoding audio data...')
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
                    console.log('Audio decoded successfully, duration:', audioBuffer.duration, 'seconds')

                    // Create and configure audio source
                    const source = audioContext.createBufferSource()
                    source.buffer = audioBuffer

                    // Connect to both the destination (for WebRTC) and default output (for monitoring)
                    source.connect(mediaStreamDestination)
                    source.connect(audioContext.destination) // This allows you to hear the audio locally

                    console.log('Starting audio playback...')
                    source.start(0)

                    // Return promise that resolves when audio finishes
                    return new Promise<void>((resolve, reject) => {
                        source.onended = () => {
                            console.log('Audio playback completed')
                            resolve()
                        }

                        source.onerror = (error) => {
                            console.error('Audio playback error:', error)
                            reject(new Error('Audio playback failed'))
                        }
                    })

                } catch (error) {
                    console.error('Error in playClip:', error)
                    throw error
                }
            }

            console.log('Audio system initialized successfully')
        })

        this.isInitialized = true
        await this.logger.log('WindowMethodsWorker initialized')
    }

    public async playClip (url: string): Promise<void> {
        if (!this.isInitialized) {
            throw new Error('WindowMethodsWorker not initialized. Call implementPlayClipMethod() first.')
        }

        await this.logger.log('Playing audio clip')

        try {
            await this.page.evaluate(async (url: string) => {
                if (!window.playClip) {
                    throw new Error('playClip method is not available')
                }

                await window.playClip(url)
            }, url)

            await this.logger.log('Audio clip played successfully')
        } catch (error) {
            await this.logger.error('Error playing audio clip', { error: error instanceof Error ? error.message : String(error) })
            throw error
        }
    }

    public async cleanup (): Promise<void> {
        if (!this.isInitialized) {
            return
        }

        await this.page.evaluate(() => {
            // Restore original getUserMedia
            if (window.originalGetUserMedia) {
                navigator.mediaDevices.getUserMedia = window.originalGetUserMedia
            }

            // Close AudioContext
            if (window.audioContext && window.audioContext.state !== 'closed') {
                window.audioContext.close()
            }

            // Clean up global references
            delete window.playClip
            delete window.audioContext
            delete window.mediaStreamDestination
            delete window.originalGetUserMedia
        })

        this.isInitialized = false
        await this.logger.log('WindowMethodsWorker cleaned up')
    }
}
