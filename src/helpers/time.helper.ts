import { ITimeData } from '@/types/timer'

export type TempTimeData = Omit<ITimeData, 'callId'> & {
    callId: string | undefined
}

function formatTime (time: number) {
    return time < 10 ? `0${time}` : `${time}`
}

export function setupTime (time: TempTimeData) {
    let hours = time.hours || 0
    let minutes = time.minutes || 0
    let seconds = time.seconds || 0

    seconds++
    if (seconds === 60) {
        seconds = 0
        minutes++

        if (minutes === 60) {
            minutes = 0
            hours++
        }
    }
    const formatted = `${formatTime(hours)}:${formatTime(minutes)}:${formatTime(seconds)}`
    return {
        seconds,
        minutes,
        hours,
        formatted
    }
}
