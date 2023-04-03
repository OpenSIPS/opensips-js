import { IntervalType } from '~/src/types/rtc'

const height = 20
const lineWidth = 4
let interval: IntervalType | undefined = undefined

export const runIndicator = (stream: MediaStream, deviceId: string) => {
    if (stream && stream.getTracks().length) {
        //console.log('RUN INDICATOR IF')
        getVolumeLevelBar(stream, deviceId)
    } else {
        //console.log('RUN INDICATOR ELSE')
        clearVolumeInterval()
    }
}

export const clearVolumeInterval = () => {
    clearInterval(interval)
}

const getMaxSmallIndicatorHeight = (value: number) => {
    const halfLineHeight = height / 4
    return value < halfLineHeight ? value : halfLineHeight
}

const getVolumeLevelBar = (stream: MediaStream, deviceId: string) => {
    //console.log('IN GET VOLUME LEVEL BAR')
    //console.log('TRACKS LENGTH', stream.getTracks().length)
    clearInterval(interval)
    const audioContext = new AudioContext()
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

    interval = setInterval(() => {
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
        //console.log('average', average)

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