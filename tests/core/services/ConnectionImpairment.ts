import type { Page } from 'playwright'

interface ImpairmentGraph {
    ctx: AudioContext
    ownsContext: boolean
    dest: MediaStreamAudioDestinationNode
    volume: GainNode
    noiseGain: GainNode
    noise: AudioBufferSourceNode
    loss: { lossProb: number }
    teardown: AudioNode[]
}

interface OutgoingImpairment {
    ctx: AudioContext
    gainNode: GainNode
    baseGain: number
    noise: AudioBufferSourceNode
    noiseGain: GainNode
    intervalId: number
    state: { volume: number, lossProb: number }
}

declare global {
    interface Window {
        __impairment?: ImpairmentGraph | null
        __impairmentOut?: OutgoingImpairment | null
        __rawRemoteAudioStream?: MediaStream
        audioContext?: AudioContext
        gainNode?: GainNode
        mediaStreamDestination?: MediaStreamAudioDestinationNode
    }
}

export function installImpairmentGraph (): void {
    if (window.__impairment) {
        return
    }
    if (!window.__latestRemoteAudioStream) {
        throw new Error('No remote audio stream to impair yet. Install after the call connects.')
    }

    const ctx = window.audioContext ?? new AudioContext()
    const ownsContext = !window.audioContext
    if (ownsContext) {
        void ctx.resume()
    }

    const source = ctx.createMediaStreamSource(window.__latestRemoteAudioStream)
    const dest = ctx.createMediaStreamDestination()

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

    const volume = ctx.createGain()
    volume.gain.value = 1

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

    const keepAlive = ctx.createGain()
    keepAlive.gain.value = 0

    source.connect(lossNode)
    lossNode.connect(volume)
    volume.connect(dest)
    noise.connect(noiseGain)
    noiseGain.connect(dest)
    noise.start()
    lossNode.connect(keepAlive)
    keepAlive.connect(ctx.destination)

    window.__impairment = {
        ctx,
        ownsContext,
        dest,
        volume,
        noiseGain,
        noise,
        loss,
        teardown: [ lossNode, volume, noise, noiseGain, keepAlive, source ]
    }

    window.__rawRemoteAudioStream = window.__latestRemoteAudioStream
    window.__latestRemoteAudioStream = dest.stream
    console.log('=== CONNECTION IMPAIRMENT INSTALLED (incoming) ===')
}

export function installOutgoingImpairmentGraph (): number {
    if (window.__impairmentOut) {
        return window.__impairmentOut.baseGain
    }
    if (!window.gainNode || !window.mediaStreamDestination || !window.audioContext) {
        throw new Error('Outgoing audio system not ready (playClip init must run first).')
    }

    const ctx = window.audioContext
    const gainNode = window.gainNode
    const baseGain = gainNode.gain.value

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
    noise.connect(noiseGain)
    noiseGain.connect(window.mediaStreamDestination)
    noise.start()

    const state = { volume: 1, lossProb: 0 }
    const intervalId = window.setInterval(() => {
        gainNode.gain.value = (Math.random() < state.lossProb) ? 0 : baseGain * state.volume
    }, 40)

    window.__impairmentOut = {
        ctx,
        gainNode,
        baseGain,
        noise,
        noiseGain,
        intervalId,
        state
    }
    console.log('=== CONNECTION IMPAIRMENT INSTALLED (outgoing), baseGain =', baseGain, '===')
    return baseGain
}

export function clearImpairmentGraph (): void {
    const graph = window.__impairment
    if (!graph) {
        return
    }

    try {
        graph.teardown.forEach((node) => {
            try {
                node.disconnect()
            } catch {
                //
            }
        })
        try {
            graph.noise.stop()
        } catch {
            //
        }
        if (window.__rawRemoteAudioStream) {
            window.__latestRemoteAudioStream = window.__rawRemoteAudioStream
        }
        if (graph.ownsContext) {
            void graph.ctx.close()
        }
    } catch (error) {
        console.error('Error clearing connection impairment:', error)
    }

    window.__impairment = null
    console.log('=== CONNECTION IMPAIRMENT CLEARED (incoming) ===')
}

export function clearOutgoingImpairmentGraph (): void {
    const graph = window.__impairmentOut
    if (!graph) {
        return
    }

    try {
        window.clearInterval(graph.intervalId)
        graph.gainNode.gain.value = graph.baseGain
        try {
            graph.noise.stop()
        } catch {
            //
        }
        try {
            graph.noiseGain.disconnect()
        } catch {
            //
        }
    } catch (error) {
        console.error('Error clearing outgoing impairment:', error)
    }

    window.__impairmentOut = null
    console.log('=== CONNECTION IMPAIRMENT CLEARED (outgoing) ===')
}

export class ConnectionImpairment {
    constructor (private readonly page: Page) {}

    public async install (): Promise<void> {
        await this.page.evaluate(installImpairmentGraph)
    }

    public async installOutgoing (): Promise<number> {
        return this.page.evaluate(installOutgoingImpairmentGraph)
    }

    public async readOutgoingState (): Promise<{ installed: boolean, baseGain: number, gain: number, volume: number, lossProb: number }> {
        return this.page.evaluate(() => {
            const out = window.__impairmentOut
            if (!out) {
                return { installed: false, baseGain: 0, gain: window.gainNode?.gain.value ?? 0, volume: 0, lossProb: 0 }
            }
            return {
                installed: true,
                baseGain: out.baseGain,
                gain: out.gainNode.gain.value,
                volume: out.state.volume,
                lossProb: out.state.lossProb
            }
        })
    }

    public async setVolume (level: number): Promise<void> {
        const value = Math.max(0, Number(level))
        if (!Number.isFinite(value)) {
            return
        }
        await this.page.evaluate((v) => {
            if (window.__impairment) {
                window.__impairment.volume.gain.value = v
            }
            if (window.__impairmentOut) {
                window.__impairmentOut.state.volume = v
                window.__impairmentOut.gainNode.gain.value = window.__impairmentOut.baseGain * v
            }
        }, value)
    }

    public async addNoise (level: number): Promise<void> {
        const value = Math.min(1, Math.max(0, Number(level)))
        if (!Number.isFinite(value)) {
            return
        }
        await this.page.evaluate((v) => {
            if (window.__impairment) {
                window.__impairment.noiseGain.gain.value = v
            }
            if (window.__impairmentOut) {
                window.__impairmentOut.noiseGain.gain.value = v
            }
        }, value)
    }

    public async setPacketLoss (probability: number): Promise<void> {
        const value = Math.min(1, Math.max(0, Number(probability)))
        if (!Number.isFinite(value)) {
            return
        }
        await this.page.evaluate((v) => {
            if (window.__impairment) {
                window.__impairment.loss.lossProb = v
            }
            if (window.__impairmentOut) {
                window.__impairmentOut.state.lossProb = v
            }
        }, value)
    }

    public async clear (): Promise<void> {
        await this.page.evaluate(clearImpairmentGraph)
    }

    public async clearOutgoing (): Promise<void> {
        await this.page.evaluate(clearOutgoingImpairmentGraph)
    }
}
