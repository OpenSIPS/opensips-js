import { IntervalType } from '@/types/rtc'
import managedAudioContext from '@/helpers/audioContext'

const height = 20
const lineWidth = 4

interface VolumeIndicator {
    interval?: IntervalType
    analyser?: AnalyserNode
    source?: MediaStreamAudioSourceNode
}

const indicators: { [key: string]: VolumeIndicator } = {}

export const runIndicator = async (stream: MediaStream, deviceId: string) => {
    if (stream && stream.getTracks().length) {
        await setupVolumeIndicator(stream, deviceId)
    } else {
        clearVolumeIndicator(deviceId)
    }
}

export const clearVolumeIndicator = (deviceId: string) => {
    const indicator = indicators[deviceId]
    if (!indicator) return

    // Clear interval
    if (indicator.interval) {
        clearInterval(indicator.interval)
    }

    // Disconnect audio nodes
    if (indicator.source) {
        indicator.source.disconnect()
    }
    if (indicator.analyser) {
        indicator.analyser.disconnect()
    }

    // Remove from tracking
    delete indicators[deviceId]
}

export const clearAllIndicators = () => {
    Object.keys(indicators).forEach(clearVolumeIndicator)
}

const getMaxSmallIndicatorHeight = (value: number) => {
    const halfLineHeight = height / 4
    return value < halfLineHeight ? value : halfLineHeight
}

const setupVolumeIndicator = async (stream: MediaStream, deviceId: string) => {
    // Clear any existing indicator for this device
    clearVolumeIndicator(deviceId)

    const canvas = document.getElementById(`canvas-${deviceId}`) as HTMLCanvasElement
    if (!canvas) {
        console.warn(`Canvas element with id 'canvas-${deviceId}' not found`)
        return
    }

    // Get the audio context (will resume if suspended)
    const audioContext = await managedAudioContext.getContext()

    // Create audio nodes
    const analyser = audioContext.createAnalyser()
    const source = audioContext.createMediaStreamSource(stream)

    analyser.smoothingTimeConstant = 0.8
    analyser.fftSize = 1024

    // Connect source to analyser (no need to connect to destination)
    source.connect(analyser)

    // Store references for cleanup
    indicators[deviceId] = {
        analyser,
        source
    }

    // Setup canvas
    const indicatorWidth = lineWidth * 5
    const halfLineHeight = height / 2

    canvas.setAttribute('width', `${indicatorWidth}`)
    canvas.setAttribute('height', `${height}`)

    const canvasContext = canvas.getContext('2d')
    if (!canvasContext) {
        console.error('Failed to get canvas 2D context')
        clearVolumeIndicator(deviceId)
        return
    }

    // Create frequency data array
    const frequencyData = new Uint8Array(analyser.frequencyBinCount)

    // Setup rendering loop
    const interval = setInterval(() => {
        // Check if canvas still exists
        const currentCanvas = document.getElementById(`canvas-${deviceId}`)
        if (!currentCanvas) {
            clearVolumeIndicator(deviceId)
            return
        }

        // Get frequency data
        analyser.getByteFrequencyData(frequencyData)

        // Calculate average volume
        let sum = 0
        for (let i = 0; i < frequencyData.length; i++) {
            sum += frequencyData[i]
        }
        const average = sum / frequencyData.length

        // Draw volume indicator
        drawVolumeIndicator(canvasContext, average, halfLineHeight)
    }, 200)

    // Store interval reference
    indicators[deviceId].interval = interval
}

const drawVolumeIndicator = (
    ctx: CanvasRenderingContext2D,
    average: number,
    halfLineHeight: number
) => {
    const halfValue = average / 2

    // Set fill style (you can customize this based on your theme)
    ctx.fillStyle = 'blue' // or use: getComputedStyle(document.body).getPropertyValue('--primary-actions')

    // Draw left indicator (small)
    ctx.clearRect(0, 0, lineWidth, height)
    ctx.fillRect(0, halfLineHeight - getMaxSmallIndicatorHeight(halfValue), lineWidth, getMaxSmallIndicatorHeight(halfValue))
    ctx.fillRect(0, halfLineHeight, lineWidth, getMaxSmallIndicatorHeight(halfValue))

    // Draw middle indicator (full)
    ctx.clearRect(lineWidth * 2, 0, lineWidth, height)
    ctx.fillRect(lineWidth * 2, halfLineHeight - average, lineWidth, average)
    ctx.fillRect(lineWidth * 2, halfLineHeight, lineWidth, average)

    // Draw right indicator (small)
    ctx.clearRect(lineWidth * 4, 0, lineWidth, height)
    ctx.fillRect(lineWidth * 4, halfLineHeight - getMaxSmallIndicatorHeight(halfValue), lineWidth, getMaxSmallIndicatorHeight(halfValue))
    ctx.fillRect(lineWidth * 4, halfLineHeight, lineWidth, getMaxSmallIndicatorHeight(halfValue))
}

// Optional: Add a function to check if an indicator is active
export const isIndicatorActive = (deviceId: string): boolean => {
    return deviceId in indicators
}

// Optional: Add a function to get all active indicator device IDs
export const getActiveIndicators = (): string[] => {
    return Object.keys(indicators)
}
