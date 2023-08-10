import { ICall, RoomChangeEmitType, ICallStatus } from '@/types/rtc'
import { UAEventMap } from 'jssip/lib/UA'

export type readyListener = (value: boolean) => void
export type changeActiveCallsListener = (event: { [key: string]: ICall }) => void
export type TestEventListener = (event: { test: string }) => void
export type ActiveRoomListener = (event: number | undefined) => void
export type CallAddingProgressListener = (callId: string | undefined) => void
export type RoomDeletedListener = (roomId: number) => void
export type changeActiveInputMediaDeviceListener = (event: string) => void
export type changeActiveOutputMediaDeviceListener = (event: string) => void
export type changeAvailableDeviceListListener = (event: Array<MediaDeviceInfo>) => void
export type changeMuteWhenJoinListener = (value: boolean) => void
export type changeIsDNDListener = (value: boolean) => void
export type changeIsMutedListener = (value: boolean) => void
export type changeOriginalStreamListener = (value: MediaStream) => void
export type addRoomListener = (value: RoomChangeEmitType) => void
export type updateRoomListener = (value: RoomChangeEmitType) => void
export type removeRoomListener = (value: RoomChangeEmitType) => void
export type changeCallStatusListener = (event: { [key: string]: ICallStatus }) => void

export interface OpenSIPSEventMap extends UAEventMap {
    ready: readyListener
    changeActiveCalls: changeActiveCallsListener
    callConfirmed: TestEventListener
    currentActiveRoomChanged: ActiveRoomListener
    callAddingInProgressChanged: CallAddingProgressListener
    roomDeleted: RoomDeletedListener
    changeActiveInputMediaDevice: changeActiveInputMediaDeviceListener
    changeActiveOutputMediaDevice: changeActiveOutputMediaDeviceListener
    changeAvailableDeviceList: changeAvailableDeviceListListener
    changeMuteWhenJoin: changeMuteWhenJoinListener
    changeIsDND: changeIsDNDListener
    changeIsMuted: changeIsMutedListener
    changeOriginalStream: changeOriginalStreamListener
    addRoom: addRoomListener
    updateRoom: updateRoomListener
    removeRoom: removeRoomListener
    changeCallStatus: changeCallStatusListener
}

export type ListenersKeyType = keyof OpenSIPSEventMap
export type ListenersCallbackFnType = OpenSIPSEventMap[ListenersKeyType]
export type ListenerCallbackFnType<T extends ListenersKeyType> = OpenSIPSEventMap[T]