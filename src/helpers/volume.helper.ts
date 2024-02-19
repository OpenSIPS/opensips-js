import { IntervalType } from '@/types/rtc'
import audioContext from '@/helpers/audioContext'

const height = 20
const lineWidth = 4

let intervals: { [key: string]: IntervalType | undefined } = {}

export const runIndicator = (stream: MediaStream, deviceId: string) => {
    if (stream && stream.getTracks().length) {
        requestAnimationFrame(() => getVolumeLevelBar(stream, deviceId))
    } else {
        clearVolumeInterval(deviceId)
    }
}

export const clearVolumeInterval = (deviceId: string) => {
    clearInterval(intervals[deviceId])
    delete intervals[deviceId]
}

export const clearAllIntervals = () => {
    Object.keys(intervals).forEach((deviceId) => {
        clearInterval(intervals[deviceId])
    })

    intervals = {}
}

const getMaxSmallIndicatorHeight = (value: number) => {
    const halfLineHeight = height / 4
    return value < halfLineHeight ? value : halfLineHeight
}

const getVolumeLevelBar = (stream: MediaStream, deviceId: string) => {
    clearVolumeInterval(deviceId)

    const analyser = audioContext.createAnalyser()
    const microphone = audioContext.createMediaStreamSource(stream)
    const javascriptNode = audioContext.createScriptProcessor(2048, 1, 1)

    analyser.smoothingTimeConstant = 0.8
    analyser.fftSize = 1024

    microphone.connect(analyser)
    analyser.connect(javascriptNode)
    javascriptNode.connect(audioContext.destination)

    const canvas = document.getElementById(`canvas-${deviceId}`) as HTMLCanvasElement

    if (!canvas) {
        return
    }

    const indicatorWidth = lineWidth * 5
    const halfLineHeight = height / 2

    canvas.setAttribute('width', `${indicatorWidth}`)
    canvas.setAttribute('height', `${height}`)

    const canvasContext = canvas.getContext('2d')

    intervals[deviceId] = setInterval(() => {
        if (!canvasContext) {
            return
        }

        const array = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(array)
        let values = 0

        const length = array.length
        for (let i = 0; i < length; i++) {
            values += (array[i])
        }

        const average = values / length

        canvasContext.fillStyle = 'blue' //getComputedStyle(document.body).getPropertyValue('--primary-actions')
        const halfValue = average / 2
        canvasContext.clearRect(0, halfLineHeight, lineWidth, halfLineHeight)
        canvasContext.fillRect(0, halfLineHeight, lineWidth, getMaxSmallIndicatorHeight(halfValue))
        canvasContext.clearRect(0, halfLineHeight, lineWidth, -halfLineHeight)
        canvasContext.fillRect(0, halfLineHeight, lineWidth, 0 - getMaxSmallIndicatorHeight(halfValue))

        canvasContext.clearRect(lineWidth * 2, halfLineHeight, lineWidth, halfLineHeight)
        canvasContext.fillRect(lineWidth * 2, halfLineHeight, lineWidth, average)
        canvasContext.clearRect(lineWidth * 2, halfLineHeight, lineWidth, -halfLineHeight)
        canvasContext.fillRect(lineWidth * 2, halfLineHeight, lineWidth, 0 - average)

        canvasContext.clearRect(lineWidth * 4, halfLineHeight, lineWidth, halfLineHeight)
        canvasContext.fillRect(lineWidth * 4, halfLineHeight, lineWidth, getMaxSmallIndicatorHeight(halfValue))
        canvasContext.clearRect(lineWidth * 4, halfLineHeight, lineWidth, -halfLineHeight)
        canvasContext.fillRect(lineWidth * 4, halfLineHeight, lineWidth, 0 - getMaxSmallIndicatorHeight(halfValue))
    }, 200)
}
