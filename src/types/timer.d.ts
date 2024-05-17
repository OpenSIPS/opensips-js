export interface ITimeData {
  callId: string
  hours: number
  minutes: number
  seconds: number
  formatted: string
}

export type TempTimeData = Omit<ITimeData, 'callId'> & {
  callId: string | undefined
}

export type CallTime = Record<string, TempTimeData>
