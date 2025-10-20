export function computeRMS (samples: Float32Array): number {
    let sum = 0
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
    return Math.sqrt(sum / samples.length)
}

export async function createVADControlledStream (originalStream: MediaStream, audioCtx: AudioContext, delayMs = 150) {
    const source = audioCtx.createMediaStreamSource(originalStream)

    const delay = audioCtx.createDelay()
    delay.delayTime.value = delayMs / 1000

    const gainNode = audioCtx.createGain()
    gainNode.gain.value = 0

    const destination = audioCtx.createMediaStreamDestination()

    source.connect(delay).connect(gainNode).connect(destination)

    return {
        stream: destination.stream,
        setSpeaking: (speaking: boolean) => {
            gainNode.gain.value = speaking ? 1 : 0
        },
    }
}
