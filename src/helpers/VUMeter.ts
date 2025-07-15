export type OnVolumeChangeFunc = (callId: string, volume: number) => void
export type Options = {
    onChangeFunction: OnVolumeChangeFunc
    emitInterval?: number
}

export default class VUMeter {
    private intervals: { [key: string]: ReturnType<typeof setInterval> | undefined } = {}
    private analysers: { [key: string]: AnalyserNode } = {}
    private emitInterval: number
    private onChangeFunction: OnVolumeChangeFunc

    constructor (options: Options) {
        this.emitInterval = options.emitInterval || 200
        this.onChangeFunction = options.onChangeFunction
    }

    async start (audioContext: AudioContext, stream: MediaStream, deviceId: string) {
        if (stream && stream.getTracks().length) {
            await this.beginCalculation(audioContext, stream, deviceId)
        }
    }

    stop (deviceId: string) {
        this.clearVolumeInterval(deviceId)

        // Clean up analyser
        if (this.analysers[deviceId]) {
            this.analysers[deviceId].disconnect()
            delete this.analysers[deviceId]
        }
    }

    clearVolumeInterval (deviceId: string) {
        if (this.intervals[deviceId]) {
            clearInterval(this.intervals[deviceId])
            delete this.intervals[deviceId]
        }
    }

    clearAllIntervals () {
        Object.keys(this.intervals).forEach((deviceId) => {
            this.stop(deviceId)
        })
        this.intervals = {}
        this.analysers = {}
    }

    async beginCalculation (audioContext: AudioContext, stream: MediaStream, deviceId: string) {
        this.clearVolumeInterval(deviceId)

        const analyser = audioContext.createAnalyser()
        const microphone = audioContext.createMediaStreamSource(stream)

        analyser.smoothingTimeConstant = 0.8
        analyser.fftSize = 1024

        microphone.connect(analyser)
        this.analysers[deviceId] = analyser

        this.intervals[deviceId] = setInterval(() => {
            const array = new Uint8Array(analyser.frequencyBinCount)
            analyser.getByteFrequencyData(array)
            let values = 0

            const length = array.length
            for (let i = 0; i < length; i++) {
                values += array[i]
            }

            const average = values / length
            this.onChangeFunction(deviceId, average)
        }, this.emitInterval)
    }
}
