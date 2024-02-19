import audioContext from '@/helpers/audioContext'

export type OnVolumeChangeFunc = (callId: string, volume: number) => void
export type Options = {
    onChangeFunction: OnVolumeChangeFunc
    emitInterval?: number
}

export default class VUMeter {
    private intervals: { [key: string]: number | undefined } = {}
    private emitInterval: number
    private onChangeFunction: OnVolumeChangeFunc

    constructor (options: Options) {
        this.emitInterval = options.emitInterval || 200
        this.onChangeFunction = options.onChangeFunction
    }

    start (stream: MediaStream, deviceId: string) {
        if (stream && stream.getTracks().length) {
            requestAnimationFrame(() => this.beginCalculation(stream, deviceId))
        }
    }

    stop (deviceId: string) {
        this.clearVolumeInterval(deviceId)
    }

    clearVolumeInterval (deviceId: string) {
        console.log('clearVolumeInterval', deviceId)
        clearInterval(this.intervals[deviceId])
        delete this.intervals[deviceId]
    }

    clearAllIntervals () {
        Object.keys(this.intervals).forEach((deviceId) => {
            clearInterval(this.intervals[deviceId])
        })

        this.intervals = {}
    }

    beginCalculation (stream: MediaStream, deviceId: string) {
        this.clearVolumeInterval(deviceId)

        const analyser = audioContext.createAnalyser()
        const microphone = audioContext.createMediaStreamSource(stream)
        const javascriptNode = audioContext.createScriptProcessor(2048, 1, 1)

        analyser.smoothingTimeConstant = 0.8
        analyser.fftSize = 1024

        microphone.connect(analyser)
        analyser.connect(javascriptNode)
        javascriptNode.connect(audioContext.destination)

        this.intervals[deviceId] = setInterval(() => {
            const array = new Uint8Array(analyser.frequencyBinCount)
            analyser.getByteFrequencyData(array)
            let values = 0

            const length = array.length
            for (let i = 0; i < length; i++) {
                values += (array[i])
            }

            const average = values / length

            this.onChangeFunction(deviceId, average)
        }, this.emitInterval)
    }

}
