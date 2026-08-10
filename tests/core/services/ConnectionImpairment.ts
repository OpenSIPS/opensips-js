import type { Page } from 'playwright'

interface ImpairmentGraph {
    ctx: AudioContext
    dest: MediaStreamAudioDestinationNode
    volume: GainNode
    noiseGain: GainNode
    loss: { lossProb: number }
}

declare global {
    interface Window {
        __impairment?: ImpairmentGraph | null
        __rawRemoteAudioStream?: MediaStream
    }
}

export function installImpairmentGraph (): void {
    if (!window.__latestRemoteAudioStream) {
        throw new Error('No remote audio stream to impair yet. Install after the call connects.')
    }
    if (window.__impairment) {
        return
    }

    const ctx = new AudioContext()
    void ctx.resume()

    const raw = window.__latestRemoteAudioStream
    const src = ctx.createMediaStreamSource(raw)

    // Packet loss: zero out ~one processing block (~40ms) with probability lossProb.
    const loss = { lossProb: 0 }
    const lossNode = ctx.createScriptProcessor(2048, 1, 1)
    lossNode.onaudioprocess = (event: AudioProcessingEvent): void => {
        const input = event.inputBuffer.getChannelData(0)
        const output = event.outputBuffer.getChannelData(0)
        if (Math.random() < loss.lossProb) {
            output.fill(0)
        } else {
            output.set(input)
        }
    }

    // Volume (quiet): 1 = original, <1 = quieter.
    const volume = ctx.createGain()
    volume.gain.value = 1

    // Noise: white-noise buffer mixed in parallel, controlled by noiseGain.
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const noiseData = noiseBuffer.getChannelData(0)
    for (let n = 0; n < noiseData.length; n++) {
        noiseData[n] = Math.random() * 2 - 1
    }
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    noise.loop = true
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0

    const dest = ctx.createMediaStreamDestination()

    // signal path
    src.connect(lossNode)
    lossNode.connect(volume)
    volume.connect(dest)
    // noise path
    noise.connect(noiseGain)
    noiseGain.connect(dest)
    noise.start()

    window.__impairment = { ctx, dest, volume, noiseGain, loss }

    // Redirect capture to the degraded stream (the recorder is created afterwards).
    window.__rawRemoteAudioStream = raw
    window.__latestRemoteAudioStream = dest.stream

    console.log('=== CONNECTION IMPAIRMENT INSTALLED ===')
}

export function clearImpairmentGraph (): void {
    const impairment = window.__impairment
    if (!impairment) {
        return
    }
    try {
        if (window.__rawRemoteAudioStream) {
            window.__latestRemoteAudioStream = window.__rawRemoteAudioStream
        }
        void impairment.ctx.close()
    } catch (error) {
        console.error('Error clearing connection impairment:', error)
    }
    window.__impairment = null
    console.log('=== CONNECTION IMPAIRMENT CLEARED ===')
}

/**
 * Connection degrader (signal-level).
 *
 * Usage:
 *   const impairment = new ConnectionImpairment(page)
 *   await impairment.install()
 *   await impairment.setVolume(0.2)     // quiet caller
 *   await impairment.addNoise(0.1)      // background noise
 *   await impairment.setPacketLoss(0.1) // dropouts
 */
export class ConnectionImpairment {
    constructor (private readonly page: Page) {}

    public async install (): Promise<void> {
        await this.page.evaluate(installImpairmentGraph)
    }

    /**
     * Lower the caller's volume (simulates a quiet / distant speaker).
     *
     * @param level 0.0 = total silence, 1.0 = original volume (no change).
     *              Values > 1 amplify. Realistic "quiet caller": ~0.05–0.4.
     */
    public async setVolume (level: number): Promise<void> {
        const value = Math.max(0, Number(level))
        if (!Number.isFinite(value)) {
            return
        }
        await this.page.evaluate((v) => {
            if (window.__impairment) {
                window.__impairment.volume.gain.value = v
            }
        }, value)
    }

    /**
     * Mix white noise over the caller's audio (simulates a noisy environment /
     * bad line).
     *
     * @param level 0.0 = no noise, 1.0 = very loud noise over the voice.
     *              Realistic background noise: ~0.02–0.3.
     */
    public async addNoise (level: number): Promise<void> {
        const value = Math.min(1, Math.max(0, Number(level)))
        if (!Number.isFinite(value)) {
            return
        }
        await this.page.evaluate((v) => {
            if (window.__impairment) {
                window.__impairment.noiseGain.gain.value = v
            }
        }, value)
    }

    /**
     * Randomly drop short (~40ms) audio blocks (simulates packet loss /
     * dropouts).
     *
     * @param probability 0.0 = no loss, 1.0 = full loss (constant silence).
     *                    Chance per ~40ms block. Realistic: ~0.02–0.3.
     */
    public async setPacketLoss (probability: number): Promise<void> {
        const value = Math.min(1, Math.max(0, Number(probability)))
        if (!Number.isFinite(value)) {
            return
        }
        await this.page.evaluate((v) => {
            if (window.__impairment) {
                window.__impairment.loss.lossProb = v
            }
        }, value)
    }

    /**
     * Remove the degradation graph and restore the original remote stream.
     */
    public async clear (): Promise<void> {
        await this.page.evaluate(clearImpairmentGraph)
    }
}
