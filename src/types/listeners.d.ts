import { UAEventMap } from 'jssip/lib/UA'

import { IMessage, MSRPSessionExtended } from '@/types/msrp'
import { ICall, RoomChangeEmitType, ICallStatus } from '@/types/rtc'
import MSRPMessage from '@/lib/msrp/message'
import { ITimeData } from '@/types/timer'
import { IncomingMSRPSessionEvent, OutgoingMSRPSessionEvent } from '@/helpers/UA'

export type MSRPMessageEventType = {
    message: MSRPMessage,
    session: MSRPSessionExtended
}

export type ChangeVolumeEventType = {
    callId: string
    volume: number
}

export type NoiseReductionStateEventType = {
    sessionId: string
    enabled: boolean
}

export type readyListener = (value: boolean) => void
export type connectionListener = (value: boolean) => void
export type reconnectionListener = (value: boolean) => void
export type reconnectionAttemptsLimitListener = () => void
export type changeActiveCallsListener = (event: { [key: string]: ICall }) => void
export type changeActiveMessagesListener = (event: { [key: string]: IMessage }) => void
export type TestEventListener = (event: { test: string }) => void
export type ActiveRoomListener = (event: number | undefined) => void
export type CallAddingProgressListener = (callId: string | undefined) => void
export type MSRPInitializingListener = (sessionId: string | undefined) => void
export type RoomDeletedListener = (roomId: number) => void
export type changeActiveInputMediaDeviceListener = (event: string) => void
export type changeActiveOutputMediaDeviceListener = (event: string) => void
export type changeAvailableDeviceListListener = (event: Array<MediaDeviceInfo>) => void
export type changeMuteWhenJoinListener = (value: boolean) => void
export type changeIsDNDListener = (value: boolean) => void
export type changeIsCallWaitingListener = (value: boolean) => void
export type changeIsMutedListener = (value: boolean) => void
export type changeActiveStreamListener = (value: MediaStream) => void
export type addRoomListener = (value: RoomChangeEmitType) => void
export type updateRoomListener = (value: RoomChangeEmitType) => void
export type removeRoomListener = (value: RoomChangeEmitType) => void
export type IncomingMSRPSessionListener = (event: IncomingMSRPSessionEvent) => void;
export type OutgoingMSRPSessionListener = (event: OutgoingMSRPSessionEvent) => void;
export type MSRPSessionListener = IncomingMSRPSessionListener | OutgoingMSRPSessionListener;
export type MSRPMessageListener = (event: MSRPMessageEventType) => void;
export type changeCallStatusListener = (event: { [key: string]: ICallStatus }) => void
export type changeCallTimeListener = (event: { [key: string]: ITimeData }) => void
export type changeCallMetricsListener = (event: { [key: string]: any }) => void
export type changeCallVolumeListener = (event: ChangeVolumeEventType) => void
export type changeNoiseReductionStateListener = (event: NoiseReductionStateEventType) => void
export type conferenceStartListener = () => void
export type conferenceEndListener = (sessionId) => void
export type changeMainVideoStreamListener = (event: { name: string, event: MediaStream }) => void
export type startScreenShareListener = (event: MediaStream) => void
export type stopScreenShareListener = () => void
export type startBlurListener = () => void
export type stopBlurListener = () => void
export type memberJoinListener = (event: object) => void
export type memberHangupListener = (event: object) => void
export type changeAudioStateListener = (state: boolean) => void
export type changeVideoStateListener = (state: boolean) => void

export interface OpenSIPSEventMap extends UAEventMap {
    ready: readyListener
    connection: connectionListener
    reconnecting: reconnectionListener
    reconnectionAttemptsLimitReached: reconnectionAttemptsLimitListener
    // JSSIP
    changeActiveCalls: changeActiveCallsListener
    changeActiveMessages: changeActiveMessagesListener
    callConfirmed: TestEventListener
    currentActiveRoomChanged: ActiveRoomListener
    callAddingInProgressChanged: CallAddingProgressListener
    isMSRPInitializingChanged: MSRPInitializingListener
    roomDeleted: RoomDeletedListener
    changeActiveInputMediaDevice: changeActiveInputMediaDeviceListener
    changeActiveOutputMediaDevice: changeActiveOutputMediaDeviceListener
    changeAvailableDeviceList: changeAvailableDeviceListListener
    changeMuteWhenJoin: changeMuteWhenJoinListener
    changeIsDND: changeIsDNDListener
    changeIsCallWaiting: changeIsCallWaitingListener
    changeIsMuted: changeIsMutedListener
    changeActiveStream: changeActiveStreamListener
    addRoom: addRoomListener
    updateRoom: updateRoomListener
    removeRoom: removeRoomListener
    changeCallStatus: changeCallStatusListener
    changeCallTime: changeCallTimeListener
    changeCallMetrics: changeCallMetricsListener
    changeCallVolume: changeCallVolumeListener
    changeNoiseReductionState: changeNoiseReductionStateListener
    newMSRPMessage: MSRPMessageListener
    newMSRPSession: MSRPSessionListener
    // JANUS
    conferenceStart: conferenceStartListener
    conferenceEnd: conferenceEndListener
    startScreenShare: startScreenShareListener
    stopScreenShare: stopScreenShareListener
    startBlur: startBlurListener
    stopBlur: stopBlurListener
    memberJoin: memberJoinListener
    memberHangup: memberHangupListener
    changeAudioState: changeAudioStateListener
    changeVideoState: changeVideoStateListener
}

export type ListenersKeyType = keyof OpenSIPSEventMap
export type ListenersCallbackFnType = OpenSIPSEventMap[ListenersKeyType]
export type ListenerCallbackFnType<T extends ListenersKeyType> = OpenSIPSEventMap[T]
