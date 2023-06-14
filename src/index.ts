// @ts-nocheck
import JsSIP, { UA } from 'jssip'
import { forEach } from 'p-iteration'
import {
    EndEvent,
    IncomingAckEvent,
    IncomingEvent,
    OutgoingAckEvent,
    OutgoingEvent
} from 'jssip/lib/RTCSession'
import { RTCSessionEvent, UAConfiguration, UAEventMap } from 'jssip/lib/UA'
import { TempTimeData, ITimeData, setupTime } from '@/helpers/time.helper'
import { filterObjectKeys } from '@/helpers/filter.helper'
import WebRTCMetrics from '@/helpers/webrtcmetrics/metrics'
import { WebrtcMetricsConfigType, Probe, ProbeMetricInType, MetricAudioData, MediaDeviceType } from '@/types/webrtcmetrics'
import {
    RTCConfiguration,
    RTCSessionExtended,
    ICall,
    StreamMediaType,
    IntervalType,
    RoomChangeEmitType
} from '@/types/rtc'
import { METRIC_KEYS_TO_INCLUDE } from '@/enum/metric.keys.to.include'

export interface IOpenSIPSJSOptions {
    configuration: Omit<UAConfiguration, 'sockets'>,
    socketInterfaces: [ string ]
    sipDomain: string
    sipOptions: {
        session_timers: boolean
        extraHeaders: [ string ]
        pcConfig: RTCConfiguration
    }
}

const CALL_STATUS_UNANSWERED = 0

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
}

export type ListenersKeyType = keyof OpenSIPSEventMap
export type ListenersCallbackFnType = OpenSIPSEventMap[ListenersKeyType]
export type ListenerCallbackFnType<T extends ListenersKeyType> = OpenSIPSEventMap[T]

interface MediaEvent extends Event {
    stream: MediaStream
}

export interface IDoCallParam {
    target: string
    addToCurrentRoom: boolean
}

/*export interface HHTMLMediaElement extends HTMLMediaElement {
    setSinkId(id: string)
}*/



type ICallKey = keyof ICall

/*export interface IActiveCalls {
    'roomId': string
    '_audioMuted': boolean
    '_cancel_reason': string
    '_contact': string
    'direction': string
    '_end_time': string
    '_eventsCount': number
    '_from_tag': string
    '_id': string
    '_is_canceled': boolean
    '_is_confirmed': boolean
    '_late_sdp': string
    '_localHold': boolean
    '_videoMuted': boolean
    'status': number
    'start_time': string
    '_remote_identity': string
    'audioTag': StreamMediaType
    //'audioQuality': number
    'isOnHold': boolean
    //'originalStream': MediaStream | null
    'localMuted': boolean
}*/

const CALL_KEYS_TO_INCLUDE: Array<ICallKey> = [
    'roomId',
    '_audioMuted',
    '_cancel_reason',
    '_contact',
    'direction',
    '_end_time',
    '_eventsCount',
    '_from_tag',
    '_id',
    '_is_canceled',
    '_is_confirmed',
    '_late_sdp',
    '_localHold',
    '_videoMuted',
    'status',
    'start_time',
    '_remote_identity',
    'audioTag',
    //'audioQuality',
    'isOnHold',
    //'originalStream',
    'localMuted'
]

export interface IRoom {
    started: Date
    incomingInProgress: boolean
    roomId: number
}

export interface ICallStatus {
    isMoving: boolean
    isTransferring: boolean
    isMerging: boolean
}

export interface ICallStatusUpdate {
    callId: string
    isMoving?: boolean
    isTransferring?: boolean
    isMerging?: boolean
}

export type IRoomUpdate = Omit<IRoom, 'started'> & {
    started?: Date
}

export type ListenerEventType = EndEvent | IncomingEvent | OutgoingEvent | IncomingAckEvent | OutgoingAckEvent
export interface TriggerListenerOptions {
    listenerType: string
    session: RTCSessionExtended
    event?:  ListenerEventType
}

/* Helpers */
function simplifyCallObject (call: ICall): { [key: string]: any } {
    //const simplified: { [key: string]: ICall[ICallKey] } = {}
    const simplified: { [key: string]: any } = {} as ICall

    CALL_KEYS_TO_INCLUDE.forEach(key => {
        if (call[key] !== undefined) {
            simplified[key] = call[key]
        }
    })

    simplified.localHold = call._localHold

    return simplified
}

function processAudioVolume (stream: MediaStream, volume: number) {
    const audioContext = new AudioContext()
    const audioSource = audioContext.createMediaStreamSource(stream)
    const audioDestination = audioContext.createMediaStreamDestination()
    const gainNode = audioContext.createGain()
    audioSource.connect(gainNode)
    gainNode.connect(audioDestination)
    gainNode.gain.value = volume

    return audioDestination.stream
}

function syncStream (event: MediaEvent, call: ICall, outputDevice: string, volume: number) {
    const audio = document.createElement('audio') as StreamMediaType

    audio.id = call._id
    audio.class = 'audioTag'
    audio.srcObject = event.stream
    audio.setSinkId(outputDevice)
    audio.volume = volume
    audio.play()
    call.audioTag = audio
}

const STORAGE_KEYS = {
    SELECTED_INPUT_DEVICE: 'selectedInputDevice',
    SELECTED_OUTPUT_DEVICE: 'selectedOutputDevice'
}

export const CALL_EVENT_LISTENER_TYPE = {
    NEW_CALL: 'new_call',
    CALL_CONFIRMED: 'confirmed',
    CALL_FAILED: 'failed',
    CALL_PROGRESS: 'progress',
    CALL_ENDED: 'ended'
}

const activeCalls: { [key: string]: ICall } = {}

export interface InnerState {
    isMuted: boolean
    muteWhenJoin: boolean
    isDND: boolean
    activeCalls: { [key: string]: ICall }
    activeRooms: { [key: number]: IRoom }
    callTime: { [key: string]: TempTimeData }
    callStatus: { [key: string]: ICallStatus }
    timeIntervals: { [key: string]: IntervalType }
    callMetrics: { [key: string]: any }
    availableMediaDevices: Array<MediaDeviceInfo>
    selectedMediaDevices: { [key in MediaDeviceType]: string }
    microphoneInputLevel: number
    speakerVolume: number
    originalStream: MediaStream | null
    listeners: { [key: string]: Array<(call: RTCSessionExtended, event: ListenerEventType | undefined) => void> }
    metricConfig: WebrtcMetricsConfigType
}

class OpenSIPSJS extends UA {
    private initialized = false

    private readonly options: IOpenSIPSJSOptions
    private readonly newRTCSessionEventName: ListenersKeyType = 'newRTCSession'
    private readonly activeCalls: { [key: string]: ICall } = {}
    //private readonly activeRooms: { [key: number]: IRoom } = {}
    private _currentActiveRoomId: number | undefined
    private _callAddingInProgress: string | undefined
    private state: InnerState = {
        isMuted: false,
        activeCalls: {},
        availableMediaDevices: [],
        selectedMediaDevices: {
            input: 'default', //localStorage.getItem(STORAGE_KEYS.SELECTED_INPUT_DEVICE) || 'default',
            output: 'default' //localStorage.getItem(STORAGE_KEYS.SELECTED_OUTPUT_DEVICE) || 'default'
        },
        microphoneInputLevel: 2, // from 0 to 2
        speakerVolume: 1, // from 0 to 1
        muteWhenJoin: false,
        originalStream: null,
        isDND: false,
        listeners: {},
        activeRooms: {},
        callStatus: {},
        callTime: {},
        timeIntervals: {},
        callMetrics: {},
        metricConfig: {
            refreshEvery: 1000,
        }
    }

    constructor (options: IOpenSIPSJSOptions) {
        const configuration: UAConfiguration = {
            ...options.configuration,
            sockets: options.socketInterfaces.map(sock => new JsSIP.WebSocketInterface(sock))
        }

        super(configuration)

        this.options = options
    }

    public on <T extends ListenersKeyType> (type: T, listener: ListenerCallbackFnType<T>) {
        return super.on(type as keyof UAEventMap, listener)
    }
    public off <T extends ListenersKeyType> (type: T, listener: ListenerCallbackFnType<T>) {
        return super.off(type, listener)
    }
    public emit (type: ListenersKeyType, args: any) {
        return super.emit(type, args)
    }

    public get sipDomain () {
        return this.options.sipDomain
    }
    public get sipOptions () {
        const options = {
            ...this.options.sipOptions,
            mediaConstraints: this.getUserMediaConstraints
        }

        return options
    }

    public get currentActiveRoomId () {
        return this._currentActiveRoomId
    }
    private set currentActiveRoomId (roomId: number | undefined) {
        this._currentActiveRoomId = roomId
        this.emit('currentActiveRoomChanged', roomId)
    }

    public get callAddingInProgress () {
        return this._callAddingInProgress
    }
    private set callAddingInProgress (value: string | undefined) {
        this._callAddingInProgress = value
        this.emit('callAddingInProgressChanged', value)
    }

    public get muteWhenJoin () {
        return this.state.muteWhenJoin
    }

    public set muteWhenJoin (value: boolean) {
        this.state.muteWhenJoin = value
        this.emit('changeMuteWhenJoin', value)
    }

    public get isDND () {
        return this.state.isDND
    }

    public set isDND (value: boolean) {
        this.state.isDND = value
        this.emit('changeIsDND', value)
    }

    public get speakerVolume () {
        return this.state.speakerVolume
    }

    public set speakerVolume (value) {
        this.state.speakerVolume = value

        Object.values(activeCalls).forEach((call) => {
            if (call.audioTag) {
                call.audioTag.volume = value
            }
        })
    }

    public get microphoneInputLevel () {
        return this.state.microphoneInputLevel
    }

    public set microphoneInputLevel (value: number) {
        this.state.microphoneInputLevel = value
        this.roomReconfigure(this.currentActiveRoomId)
    }


    public get getActiveCalls () {
        return this.state.activeCalls
    }

    public get getActiveRooms () {
        return this.state.activeRooms
    }


    public get isMuted () {
        return this.state.isMuted
    }

    public set isMuted (value: boolean) {
        this.state.isMuted = value
        this.emit('changeIsMuted', value)
    }


    public get getInputDeviceList () {
        return this.state.availableMediaDevices.filter(device => device.kind === 'audioinput')
    }

    public get getOutputDeviceList () {
        return this.state.availableMediaDevices.filter(device => device.kind === 'audiooutput')
    }

    /*getInputDeviceList: (state) => {
        return state.availableMediaDevices.filter(device => device.kind === 'audioinput');
    },
    getOutputDeviceList: (state) => {
        return state.availableMediaDevices.filter(device => device.kind === 'audiooutput');
    }*/

    public get getUserMediaConstraints () {
        return {
            audio: {
                deviceId: {
                    exact: this.state.selectedMediaDevices.input
                }
            },
            video: false
        }
    }


    public get getInputDefaultDevice () {
        return this.getInputDeviceList.find(device => device.deviceId === 'default')
    }

    public get getOutputDefaultDevice () {
        return this.getOutputDeviceList.find(device => device.deviceId === 'default')
    }

    public get selectedInputDevice () {
        return this.state.selectedMediaDevices.input
    }

    public set selectedInputDevice (deviceId: string) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_INPUT_DEVICE, deviceId)

        this.state.selectedMediaDevices.input = deviceId
        this.emit('changeActiveInputMediaDevice', deviceId)
    }

    public get selectedOutputDevice () {
        return this.state.selectedMediaDevices.output
    }

    public set selectedOutputDevice (deviceId: string) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_OUTPUT_DEVICE, deviceId)

        this.state.selectedMediaDevices.output = deviceId
        this.emit('changeActiveOutputMediaDevice', deviceId)
    }

    public get originalStream () {
        return this.state.originalStream
    }

    /*getSelectedInputDevice: state => state.selectedMediaDevices.input,
    getInputDefaultDevice: (state, getters) => {
        return getters.getInputDeviceList.find(device => device.id === 'default')
    },
    getOutputDefaultDevice: (state, getters) => {
        return getters.getOutputDeviceList.find(device => device.id === 'default')
    },
    getSelectedOutputDevice: state => state.selectedMediaDevices.output,*/

    /*private setDefaultMediaDevices () {
        this.state.selectedMediaDevices.input = localStorage.getItem(STORAGE_KEYS.SELECTED_INPUT_DEVICE) || 'default'
        this.state.selectedMediaDevices.output = localStorage.getItem(STORAGE_KEYS.SELECTED_OUTPUT_DEVICE) || 'default'
        console.log('emit', this.state.selectedMediaDevices)
        //this.emit('changeActiveMediaDevice', this.state.selectedMediaDevices)
    }*/

    private setAvailableMediaDevices (devices: Array<MediaDeviceInfo>) {
        this.state.availableMediaDevices = devices
        this.emit('changeAvailableDeviceList', devices)
    }

    public async updateDeviceList () {
        await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
        const devices = await navigator.mediaDevices.enumerateDevices()

        //commit(STORE_MUTATION_TYPES.SET_MEDIA_DEVICES, devices)
        //this.state.availableMediaDevices = devices
        this.setAvailableMediaDevices(devices)
    }

    public async setMediaDevices (setDefaults = false) {
        this.state.selectedMediaDevices.input = localStorage.getItem(STORAGE_KEYS.SELECTED_INPUT_DEVICE) || 'default'
        this.state.selectedMediaDevices.output = localStorage.getItem(STORAGE_KEYS.SELECTED_OUTPUT_DEVICE) || 'default'

        await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
        const devices = await navigator.mediaDevices.enumerateDevices()

        //commit(STORE_MUTATION_TYPES.SET_MEDIA_DEVICES, devices)
        //this.state.availableMediaDevices = devices
        this.setAvailableMediaDevices(devices)

        const defaultMicrophone = setDefaults
            ? this.getInputDefaultDevice?.deviceId || ''
            : ''
        const defaultSpeaker = setDefaults
            ? this.getOutputDefaultDevice?.deviceId || ''
            : ''

        //dispatch('setMicrophone', defaultMicrophone)
        await this.setMicrophone(defaultMicrophone)
        //dispatch('setSpeaker', defaultSpeaker)
        await this.setSpeaker(defaultSpeaker)
        //this.emit('changeActiveMediaDevice', this.state.selectedMediaDevices)
    }

    public setCallTime (value: ITimeData) {
        const time: TempTimeData = { ...value }
        delete time.callId

        this.state.callTime = {
            ...this.state.callTime,
            [value.callId]: time
        }
    }

    public removeCallTime (callId: string) {
        const callTimeCopy = { ...this.state.callTime }
        delete callTimeCopy[callId]

        this.state.callTime = {
            ...callTimeCopy,
        }
    }

    private setTimeInterval (callId: string, interval: IntervalType) {
        this.state.timeIntervals = {
            ...this.state.timeIntervals,
            [callId]: interval
        }
    }

    private removeTimeInterval (callId: string) {
        const timeIntervalsCopy = { ...this.state.timeIntervals }
        clearInterval(timeIntervalsCopy[callId])
        delete timeIntervalsCopy[callId]

        this.state.timeIntervals = {
            ...timeIntervalsCopy,
        }
    }

    private _stopCallTimer (callId: string) {
        //commit(STORE_MUTATION_TYPES.REMOVE_TIME_INTERVAL, callId)
        //commit(STORE_MUTATION_TYPES.REMOVE_CALL_TIME, callId)

        this.removeTimeInterval(callId)
        this.removeCallTime(callId)
    }

    public setMetricsConfig (config: WebrtcMetricsConfigType)  {
        this.state.metricConfig = { ...this.state.metricConfig, ...config }
    }

    public sendDTMF (callId: string, value: string) {
        const validation_regex = /^[A-D0-9]+$/g
        if (!validation_regex.test(value)) {
            throw new Error('Not allowed character in DTMF input')
        }
        const call = activeCalls[callId]
        call.sendDTMF(value)
    }

    public doMute (value: boolean) {
        const activeRoomId = this.currentActiveRoomId
        //commit(STORE_MUTATION_TYPES.SET_MUTED, muted)
        this.isMuted = value
        //dispatch('_roomReconfigure', activeRoomId)
        this.roomReconfigure(activeRoomId)
    }

    public doCallHold ({ callId, toHold, automatic }: { callId: string, toHold: boolean, automatic?: boolean }) {
        const call = activeCalls[callId]
        call._automaticHold = automatic ?? false

        if (toHold) {
            call.hold()
        } else {
            call.unhold()
        }
    }

    private _cancelAllOutgoingUnanswered () {
        Object.values(this.getActiveCalls).filter(call => {
            return call.direction === 'outgoing'
                && call.status === CALL_STATUS_UNANSWERED
        }).forEach(call => this.callTerminate(call._id))
    }

    public callAnswer (callId: string) {
        const call = activeCalls[callId]

        //dispatch('_cancelAllOutgoingUnanswered')
        this._cancelAllOutgoingUnanswered()
        call.answer(this.sipOptions)
        //commit(STORE_MUTATION_TYPES.UPDATE_CALL, call)
        this.updateCall(call)
        //dispatch('setCurrentActiveRoom', call.roomId) //TODO: move to top
        this.setCurrentActiveRoomId(call.roomId)

        call.connection.addEventListener('addstream', async event => {
            //dispatch('_triggerAddStream', {event, call})
            this._triggerAddStream(event as MediaEvent, call)
        })
    }

    public async callMove (callId: string, roomId: number) {
        // commit(STORE_MUTATION_TYPES.UPDATE_CALL_STATUS, { callId, isMoving: true });
        this._updateCallStatus({ callId, isMoving: true })
        //await dispatch('callChangeRoom', {callId, roomId})
        await this.callChangeRoom({ callId, roomId })
        // commit(STORE_MUTATION_TYPES.UPDATE_CALL_STATUS, { callId, isMoving: false });
        this._updateCallStatus({ callId, isMoving: false })
    }

    public updateCall (value: ICall) {
        /*this.state.activeCalls = {
            ...this.state.activeCalls,
            [value._id]: simplifyCallObject(value)
        }*/

        this.state.activeCalls[value._id] = simplifyCallObject(value) as ICall
        this.emit('changeActiveCalls', this.state.activeCalls)
    }

    public updateRoom (value: IRoomUpdate) {
        const room = this.state.activeRooms[value.roomId]

        const newRoomData: IRoom = {
            ...room,
            ...value
        }

        this.state.activeRooms = {
            ...this.state.activeRooms,
            [value.roomId]: {
                ...newRoomData
            }
        }

        this.emit('updateRoom', { room: newRoomData, roomList: this.state.activeRooms })
    }

    private _addCall (value: ICall) {
        this.state.activeCalls = {
            ...this.state.activeCalls,
            [value._id]: simplifyCallObject(value) as ICall
        }

        activeCalls[value._id] = value
        this.emit('changeActiveCalls', this.state.activeCalls)
    }

    private _addCallStatus (callId: string) {
        this.state.callStatus = {
            ...this.state.callStatus,
            [callId]: {
                isMoving: false,
                isTransferring: false,
                isMerging: false
            }
        }
    }

    private _updateCallStatus (value: ICallStatusUpdate) {
        const prevStatus = { ...this.state.callStatus[value.callId] }
        //const newStatus = { ...value }
        /*const newStatus: ICallStatus = {
            isMoving: value.isMoving,
            isTransferring: value.isTransferring,
            isMerging: value.isMerging
        }*/

        const newStatus: ICallStatus = {
            ...prevStatus
        }

        if (value.isMoving !== undefined) {
            newStatus.isMoving = value.isMoving
        }

        if (value.isTransferring !== undefined) {
            newStatus.isTransferring = value.isTransferring
        }

        if (value.isMerging !== undefined) {
            newStatus.isMerging = value.isMerging
        }

        //delete newStatus['callId']

        this.state.callStatus = {
            ...this.state.callStatus,
            [value.callId]: {
                ...newStatus
            }
        }
    }

    private _removeCallStatus (callId: string) {
        const callStatusCopy = { ...this.state.callStatus }
        delete callStatusCopy[callId]

        this.state.callStatus = {
            ...callStatusCopy,
        }
    }

    private _addRoom (value: IRoom) {
        this.state.activeRooms = {
            ...this.state.activeRooms,
            [value.roomId]: value
        }

        this.emit('addRoom', { room: value, roomList: this.state.activeRooms })
    }

    public async setMicrophone (dId: string) {
        if (!this.getInputDeviceList.find(({ deviceId }) => deviceId === dId)) {
            return
        }

        this.selectedInputDevice = dId

        let stream: MediaStream // = null

        try {
            stream = await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
        } catch (err) {
            console.error(err)
        }

        if (Object.keys(this.getActiveCalls).length === 0) {
            return
        }

        const callsInCurrentRoom = Object.values(activeCalls).filter(call => call.roomId === this.currentActiveRoomId)

        if (callsInCurrentRoom.length === 1) {
            Object.values(callsInCurrentRoom).forEach(call => {
                const processedStream = processAudioVolume(stream, this.microphoneInputLevel)
                processedStream.getTracks().forEach(track => track.enabled = !this.isMuted)
                this._setOriginalStream(processedStream)
                call.connection.getSenders()[0].replaceTrack(processedStream.getTracks()[0])
                //commit(STORE_MUTATION_TYPES.UPDATE_CALL, call)
                this.updateCall(call)
            })
        } else {
            await this._doConference(callsInCurrentRoom)
        }
    }

    private _setOriginalStream (value: MediaStream) {
        this.state.originalStream = value
        this.emit('changeOriginalStream', value)
    }

    public async setSpeaker (dId: string) {
        if (!this.getOutputDeviceList.find(({ deviceId }) => deviceId === dId)) {
            return
        }

        this.selectedOutputDevice = dId

        const activeCallList = Object.values(activeCalls)

        if (activeCallList.length === 0) {
            return
        }

        const callsInCurrentRoom = activeCallList.filter(call => call.roomId === this.currentActiveRoomId)

        if (callsInCurrentRoom.length === 1) {
            activeCallList.forEach(call => {
                call.audioTag?.setSinkId(dId)
                //commit(STORE_MUTATION_TYPES.UPDATE_CALL, call)
                this.updateCall(call)
            })
        } else {
            await this._doConference(callsInCurrentRoom)
        }
    }

    /*private deleteRoom (roomId: number) {
        delete this.activeRooms[roomId]
        this.emit('roomDeleted', roomId)
    }*/

    private removeRoom (roomId: number) {
        const activeRoomsCopy = { ...this.state.activeRooms }

        const roomToRemove = { ...activeRoomsCopy[roomId] }

        delete activeRoomsCopy[roomId]

        this.state.activeRooms = {
            ...activeRoomsCopy,
        }

        this.emit('removeRoom', { room: roomToRemove, roomList: this.state.activeRooms })
    }

    private deleteRoomIfEmpty (roomId: number | undefined) {
        if (roomId === undefined) {
            return
        }

        if (Object.values(activeCalls).filter(call => call.roomId === roomId).length === 0) {
            //this.deleteRoom(roomId)
            this.removeRoom(roomId)

            if (this.currentActiveRoomId === roomId) {
                this.currentActiveRoomId = roomId
            }
        }
    }

    private checkInitialized () {
        if (!this.initialized) {
            throw new Error('[OpenSIPSJS] You must call `start` method first!')
        }
    }

    private muteReconfigure (call: ICall) {
        if (this.state.isMuted) {
            call.mute({ audio: true })
        } else {
            call.unmute({ audio: true })
        }
    }

    private async roomReconfigure (roomId: number | undefined) {
        if (roomId === undefined) {
            return
        }

        const callsInRoom = Object.values(activeCalls).filter(call => call.roomId === roomId)

        // Let`s take care on the audio output first and check if passed room is our selected room
        if (this.currentActiveRoomId === roomId) {
            callsInRoom.forEach(call => {
                if (call.audioTag) {
                    this.muteReconfigure(call)
                    call.audioTag.muted = false
                    this.updateCall(call)
                }
            })
        } else {
            callsInRoom.forEach(call => {
                if (call.audioTag) {
                    call.audioTag.muted = true
                    this.updateCall(call)
                }
            })
        }

        // Now let`s configure the sound we are sending for each active call on this room
        if (callsInRoom.length === 0) {
            this.deleteRoomIfEmpty(roomId)
        } else if (callsInRoom.length === 1 && this.currentActiveRoomId !== roomId) {
            if (!callsInRoom[0].isOnHold().local) {
                this.doCallHold({ callId: callsInRoom[0].id, toHold: true, automatic: true })
            }
        } else if (callsInRoom.length === 1 && this.currentActiveRoomId === roomId) {
            if (callsInRoom[0].isOnHold().local && callsInRoom[0]._automaticHold) {
                this.doCallHold({ callId: callsInRoom[0].id, toHold: false })
            }

            let stream: MediaStream | undefined

            try {
                stream = await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
            } catch (err) {
                console.error(err)
            }

            if (stream && callsInRoom[0].connection && callsInRoom[0].connection.getSenders()[0]) {
                const processedStream = processAudioVolume(stream, this.microphoneInputLevel)
                processedStream.getTracks().forEach(track => track.enabled = !this.state.isMuted)
                //dispatch('_setOriginalStream', processedStream)
                this._setOriginalStream(processedStream)
                await callsInRoom[0].connection.getSenders()[0].replaceTrack(processedStream.getTracks()[0])
                this.muteReconfigure(callsInRoom[0])
            }
        } else if (callsInRoom.length > 1) {
            //await dispatch('_doConference', callsInRoom)
            await this._doConference(callsInRoom)
        }
    }

    private async _doConference (sessions: Array<ICall>) {
        sessions.forEach(call => {
            if (call._localHold) {
                //dispatch('doCallHold', { callId: call._id, toHold: false })
                this.doCallHold({ callId: call._id, toHold: false })
            }
        })

        // Take all received tracks from the sessions you want to merge
        const receivedTracks: Array<MediaStreamTrack> = []

        sessions.forEach(session => {
            if (session !== null && session !== undefined) {
                session.connection.getReceivers().forEach((receiver: RTCRtpReceiver) => {
                    receivedTracks.push(receiver.track)
                })
            }
        })

        // Use the Web Audio API to mix the received tracks
        const audioContext = new AudioContext()
        const allReceivedMediaStreams = new MediaStream()

        // For each call we will build dedicated mix for all other calls
        await forEach(sessions, async (session: ICall) => {
            if (session === null || session === undefined) {
                return
            }

            const mixedOutput = audioContext.createMediaStreamDestination()

            session.connection.getReceivers().forEach(receiver => {
                receivedTracks.forEach(track => {
                    allReceivedMediaStreams.addTrack(receiver.track)

                    if (receiver.track.id !== track.id) {
                        const sourceStream = audioContext.createMediaStreamSource(new MediaStream([ track ]))

                        sourceStream.connect(mixedOutput)
                    }
                })
            })

            if (sessions[0].roomId === this.currentActiveRoomId) {
                // Mixing your voice with all the received audio
                const stream = await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
                const processedStream = processAudioVolume(stream, this.microphoneInputLevel)
                processedStream.getTracks().forEach(track => track.enabled = !this.isMuted)
                //dispatch('_setOriginalStream', processedStream)
                this._setOriginalStream(processedStream)
                const sourceStream = audioContext.createMediaStreamSource(processedStream)

                // stream.getTracks().forEach(track => track.enabled = !getters.isMuted) // TODO: Fix this

                sourceStream.connect(mixedOutput)
            }

            if (session.connection.getSenders()[0]) {
                //mixedOutput.stream.getTracks().forEach(track => track.enabled = !getters.isMuted) // Uncomment to mute all callers on mute
                await session.connection.getSenders()[0].replaceTrack(mixedOutput.stream.getTracks()[0])
                //dispatch('_muteReconfigure', session)
                this._muteReconfigure(session)
            }
        })
    }

    public _muteReconfigure (call: ICall) {
        if (this.isMuted) {
            call.mute({ audio: true })
        } else {
            call.unmute({ audio: true })
        }
    }

    public muteCaller (callId: string, value: boolean) {
        const call = activeCalls[callId]

        if (call && call.connection.getReceivers().length) {
            call.localMuted = value
            call.connection.getReceivers().forEach(receiver => {
                receiver.track.enabled = !value
            })
            //commit(STORE_MUTATION_TYPES.UPDATE_CALL, call)
            this.updateCall(call)
            //dispatch('_roomReconfigure', call.roomId)
            this.roomReconfigure(call.roomId)
        }
    }

    public callTerminate (callId: string) {
        const call = activeCalls[callId]

        if (call._status !== 8) {
            call.terminate()
        }
    }

    public callTransfer (callId: string, target: string) {
        if (target.toString().length === 0) {
            return console.error('Target must be passed')
        }

        //commit(STORE_MUTATION_TYPES.UPDATE_CALL_STATUS, { callId, isTransferring: true })
        this._updateCallStatus({ callId, isTransferring: true })

        const call = activeCalls[callId]

        call.refer(`sip:${target}@${this.sipDomain}`)
        //commit(STORE_MUTATION_TYPES.UPDATE_CALL, call)
        this.updateCall(call)
    }

    public callMerge (roomId: number) {
        const callsInRoom = Object.values(activeCalls).filter((call) => call.roomId === roomId)
        if (callsInRoom.length !== 2) return

        const firstCall = callsInRoom[0]
        const secondCall = callsInRoom[1]

        if (!firstCall || !secondCall) {
            return
        }

        // TODO: Check all call.id for working in the same way as call._id
        //commit(STORE_MUTATION_TYPES.UPDATE_CALL_STATUS, { callId: firstCall._id, isMerging: true });
        this._updateCallStatus({ callId: firstCall._id, isMerging: true })
        //commit(STORE_MUTATION_TYPES.UPDATE_CALL_STATUS, { callId: secondCall._id, isMerging: true });
        this._updateCallStatus({ callId: secondCall._id, isMerging: true })

        //firstCall.refer(secondCall.remote_identity._uri.toString(), {'replaces': secondCall});
        firstCall.refer(secondCall.remote_identity.uri.toString(), { 'replaces': secondCall })
        //commit(STORE_MUTATION_TYPES.UPDATE_CALL, firstCall)
        this.updateCall(firstCall)
    }

    // TODO: Use this method in demo
    public setDND (value: boolean) {
        this.isDND = value
    }

    private _startCallTimer (callId: string) {
        const timeData = {
            callId,
            hours: 0,
            minutes: 0,
            seconds: 0,
            formatted: ''
        }
        //commit(STORE_MUTATION_TYPES.SET_CALL_TIME, timeData)
        this.setCallTime(timeData)

        const interval = setInterval(() => {
            const callTime = { ...this.state.callTime[callId] }
            const updatedTime = setupTime(callTime)
            //commit(STORE_MUTATION_TYPES.SET_CALL_TIME, { callId, ...updatedTime })
            this.setCallTime({ callId, ...updatedTime })
        }, 1000)

        //commit(STORE_MUTATION_TYPES.SET_TIME_INTERVAL, { callId, interval })
        this.setTimeInterval(callId, interval)
    }

    public async setCurrentActiveRoomId (roomId: number | undefined) {
        const oldRoomId = this.currentActiveRoomId

        if (roomId === oldRoomId) {
            return
        }

        this.currentActiveRoomId = roomId

        await this.roomReconfigure(oldRoomId)
        await this.roomReconfigure(roomId)
        //await dispatch('roomReconfigure', oldRoomId)
        //await dispatch('roomReconfigure', roomId)
    }

    private getNewRoomId () {
        const roomIdList = Object.keys(this.state.activeRooms)

        if (roomIdList.length === 0) {
            return 1
        }

        return (parseInt(roomIdList.sort()[roomIdList.length - 1]) + 1)
    }

    /*private setSelectedInputDevice (deviceId) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_INPUT_DEVICE, deviceId)

        this.state.selectedMediaDevices.input = deviceId
    }*/

    /*private setSelectedOutputDevice (deviceId) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_OUTPUT_DEVICE, deviceId)

        this.state.selectedMediaDevices.output = deviceId
    }*/
    public subscribe (type: string, listener: (c: RTCSessionExtended) => void) {
        const isListenerEmpty = !this.state.listeners[type] || !this.state.listeners[type].length
        const newListeners = isListenerEmpty? [ listener ]: [ ...this.state.listeners[type], listener ]

        this.state.listeners = {
            ...this.state.listeners,
            [type]: newListeners
        }
    }

    public removeIListener (value: string) {
        const listenersCopy = { ...this.state.listeners }
        delete listenersCopy[value]

        this.state.listeners = {
            ...listenersCopy,
        }
    }

    private async addCall (session: RTCSessionExtended) {
        const sessionAlreadyInActiveCalls = this.getActiveCalls[session.id]

        if (sessionAlreadyInActiveCalls !== undefined) {
            return
        }

        const roomId = this.getNewRoomId()

        const newRoomInfo: IRoom = {
            started: new Date(),
            incomingInProgress: false,
            roomId
        }

        if (session.direction === 'incoming') {
            newRoomInfo.incomingInProgress = true

            //this.on('callConfirmed',)

            this.subscribe(CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED, (call) => {
                if (session.id === call.id) {
                    /*commit(STORE_MUTATION_TYPES.UPDATE_ROOM, {
                        incomingInProgress: false,
                        roomId
                    })*/
                    this.updateRoom( {
                        incomingInProgress: false,
                        roomId
                    })
                    //dispatch('_startCallTimer', session.id)
                    this._startCallTimer(session.id)
                }
            })

            this.subscribe(CALL_EVENT_LISTENER_TYPE.CALL_FAILED, (call) => {
                if (session.id === call.id) {
                    /*commit(STORE_MUTATION_TYPES.UPDATE_ROOM, {
                        incomingInProgress: false,
                        roomId
                    })*/
                    this.updateRoom({
                        incomingInProgress: false,
                        roomId
                    })
                }
            })

        } else if (session.direction === 'outgoing') {
            //dispatch('_startCallTimer', session.id)
            this._startCallTimer(session.id)
            //this.subscribe(CALL_EVENT_LISTENER_TYPE.NEW_CALL, () => console.log('NEW_CALL'))
            //this.subscribe(CALL_EVENT_LISTENER_TYPE.CALL_FAILED, () => console.log('CALL_FAILED'))
            //this.subscribe(CALL_EVENT_LISTENER_TYPE.CALL_ENDED, () => console.log('CALL_ENDED'))
        }

        /*const call: ICall = {
            ...session,
            roomId,
            localMuted: false
        }*/
        const call = session as ICall

        call.roomId = roomId
        call.localMuted = false

        //commit(STORE_MUTATION_TYPES.ADD_CALL, call)
        this._addCall(call)
        //commit(STORE_MUTATION_TYPES.ADD_CALL_STATUS, session.id)
        this._addCallStatus(session.id)
        //commit(STORE_MUTATION_TYPES.ADD_ROOM, newRoomInfo)
        this._addRoom(newRoomInfo)
    }

    private _triggerListener ({ listenerType, session, event }: TriggerListenerOptions) {
        const listeners = this.state.listeners[listenerType]

        if (!listeners || !listeners.length) {
            return
        }

        listeners.forEach((listener) => {
            listener(session, event)
        })
    }

    private _removeCall (value: string) {
        const stateActiveCallsCopy = { ...this.state.activeCalls }
        delete stateActiveCallsCopy[value]

        delete activeCalls[value]
        this.state.activeCalls = {
            ...stateActiveCallsCopy,
        }
        this.emit('changeActiveCalls', this.state.activeCalls)
    }

    private _activeCallListRemove (call: ICall) {
        const callRoomIdToConfigure = activeCalls[call._id].roomId
        //commit(STORE_MUTATION_TYPES.REMOVE_CALL, call._id)
        this._removeCall(call._id)
        //dispatch('_roomReconfigure', callRoomIdToConfigure)
        this.roomReconfigure(callRoomIdToConfigure)
    }

    private newRTCSessionCallback (event: RTCSessionEvent) {
        const session = event.session as RTCSessionExtended

        if (this.isDND) {
            session.terminate({ status_code: 486, reason_phrase: 'Do Not Disturb' })
            return
        }

        // stop timers on ended and failed
        session.on('ended', (event) => {
            //console.log('ended', event)
            //dispatch('_triggerListener', { listenerType: CALL_EVENT_LISTENER_TYPE.CALL_ENDED, session, event })
            this._triggerListener({ listenerType: CALL_EVENT_LISTENER_TYPE.CALL_ENDED, session, event })
            //dispatch('_activeCallListRemove', session)
            const s = this.getActiveCalls[session.id]
            this._activeCallListRemove(s)
            //dispatch('_stopCallTimer', session.id)
            this._stopCallTimer(session.id)
            //commit(STORE_MUTATION_TYPES.REMOVE_CALL_STATUS, session.id)
            this._removeCallStatus(session.id)
            //commit(STORE_MUTATION_TYPES.REMOVE_CALL_METRICS, session.id)
            this._removeCallMetrics(session.id)

            if (!Object.keys(activeCalls).length) {
                //commit(STORE_MUTATION_TYPES.SET_MUTED, false)
                this.isMuted = false
            }
        })
        session.on('progress', (event: IncomingEvent | OutgoingEvent) => {
            //console.log('progress', event)
            //dispatch('_triggerListener', { listenerType: CALL_EVENT_LISTENER_TYPE.CALL_PROGRESS, session, event })
            this._triggerListener({ listenerType: CALL_EVENT_LISTENER_TYPE.CALL_PROGRESS, session, event })
        })
        session.on('failed', (event) => {
            //dispatch('_triggerListener', { listenerType: CALL_EVENT_LISTENER_TYPE.CALL_FAILED, session, event })
            this._triggerListener({ listenerType: CALL_EVENT_LISTENER_TYPE.CALL_FAILED, session, event })

            if (session.id === this.callAddingInProgress) {
                //commit(STORE_MUTATION_TYPES.CALL_ADDING_IN_PROGRESS, null)
                this.callAddingInProgress = undefined
            }

            //dispatch('_activeCallListRemove', session)
            const s = this.getActiveCalls[session.id]
            this._activeCallListRemove(s)
            //dispatch('_stopCallTimer', session.id)
            this._stopCallTimer(session.id)
            //commit(STORE_MUTATION_TYPES.REMOVE_CALL_STATUS, session.id)
            this._removeCallStatus(session.id)
            //commit(STORE_MUTATION_TYPES.REMOVE_CALL_METRICS, session.id)
            this._removeCallMetrics(session.id)

            if (!Object.keys(activeCalls).length) {
                //commit(STORE_MUTATION_TYPES.SET_MUTED, false)
                this.isMuted = false
            }
        })
        session.on('confirmed', (event: IncomingAckEvent | OutgoingAckEvent) => {
            //dispatch('_triggerListener', { listenerType: CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED, session, event })
            this._triggerListener({ listenerType: CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED, session, event })
            //commit(STORE_MUTATION_TYPES.UPDATE_CALL, session)
            this.updateCall(session as ICall)

            if (session.id === this.callAddingInProgress) {
                this.callAddingInProgress = undefined
            }
        })

        //dispatch('_triggerListener', { listenerType: CALL_EVENT_LISTENER_TYPE.NEW_CALL, session })
        //this._triggerListener({ listenerType: CALL_EVENT_LISTENER_TYPE.NEW_CALL, session, event: () => { console.log('1 new call') } })
        //dispatch('_addCall', session)
        this.addCall(session)

        if (session.direction === 'outgoing') {
            //console.log('Is outgoing')
            //dispatch('setCurrentActiveRoom', session.roomId)
            const roomId = this.getActiveCalls[session.id].roomId
            this.setCurrentActiveRoomId(roomId)
        }
    }

    private setInitialized () {
        this.initialized = true
        this.emit('ready', true)
    }

    public start () {
        this.on(
            this.newRTCSessionEventName,
            this.newRTCSessionCallback.bind(this)
        )

        super.start()

        this.setInitialized()
        //this.setDefaultMediaDevices()
        this.setMediaDevices(true)

        return this
    }

    public setMuteWhenJoin (value: boolean) {
        this.muteWhenJoin = value
    }

    /*public setSpeakerVolume (value: number) {
        //commit(STORE_MUTATION_TYPES.SET_SPEAKER_VOLUME, value);
        this.speakerVolume = value

        Object.values(activeCalls).forEach((call) => {
            if (call.audioTag) {
                call.audioTag.volume = this.speakerVolume
            }
        })
    }*/

    private _setCallMetrics (value: any) {
        const metrics = { ...value }
        delete metrics['callId']

        this.state.callMetrics = {
            ...this.state.callMetrics,
            [value.callId]: metrics
        }
    }

    private _removeCallMetrics (callId: string) {
        const callMetricsCopy = { ...this.state.callMetrics }
        delete callMetricsCopy[callId]

        this.state.callMetrics = {
            ...callMetricsCopy,
        }
    }

    private _getCallQuality (call: ICall) {
        const metrics = new WebRTCMetrics(this.state.metricConfig)
        const probe = metrics.createProbe(call.connection, {
            cid: call._id
        })

        const inboundKeys: Array<string> = []
        let inboundAudio: string
        probe.onreport = (probe: Probe) => {
            //console.log('probe', probe)

            /*const inboundMetrics = Object.entries(probe.audio).filter(([ key, value ]) => {
                return value.direction === 'inbound'
            })*/

            //const ioo = Object.entries(probe.audio).
            Object.entries(probe.audio).forEach(([ key, value ]) => {
                if (value.direction === 'inbound' && !inboundKeys.includes(key)) {
                    inboundKeys.push(key)
                    inboundAudio = key
                }
            })

            /*inboundMetrics.forEach(([ key, value ]) => {
                if (!inboundKeys.includes(key)) {
                    inboundKeys.push(key)
                    inboundAudio = key
                }
            })*/

            const inboundAudioMetric = probe.audio[inboundAudio] as ProbeMetricInType
            const metric: MetricAudioData = filterObjectKeys(inboundAudioMetric, METRIC_KEYS_TO_INCLUDE)
            metric.callId = call._id
            //commit(STORE_MUTATION_TYPES.SET_CALL_METRICS, metrics)
            this._setCallMetrics(metrics)
        }

        this.subscribe(CALL_EVENT_LISTENER_TYPE.CALL_ENDED, (session) => {
            if (session._id === call._id) {
                metrics.stopAllProbes()
            }
        })

        metrics.startAllProbes()
    }

    private async _triggerAddStream (event: MediaEvent, call: ICall) {
        //commit(STORE_MUTATION_TYPES.SET_MUTED, this.muteWhenJoin)
        this.isMuted = this.muteWhenJoin

        const stream = await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
        const processedStream = processAudioVolume(stream, this.microphoneInputLevel)
        const muteMicro = this.isMuted || this.muteWhenJoin

        processedStream.getTracks().forEach(track => track.enabled = !muteMicro)
        //dispatch('_setOriginalStream', processedStream)
        this._setOriginalStream(processedStream)
        await call.connection.getSenders()[0].replaceTrack(processedStream.getTracks()[0])

        syncStream(event, call, this.selectedOutputDevice, this.speakerVolume)
        //dispatch('_getCallQuality', call)
        this._getCallQuality(call)
        //commit(STORE_MUTATION_TYPES.UPDATE_CALL, call)
        this.updateCall(call)
    }

    public doCall ({ target, addToCurrentRoom }: IDoCallParam) {
        this.checkInitialized()

        if (target.length === 0) {
            return console.error('Target must be a valid string')
        }

        const call = this.call(
            `sip:${target}@${this.sipDomain}`,
            this.sipOptions
        ) as RTCSessionExtended

        this.callAddingInProgress = call.id

        if (addToCurrentRoom && this.currentActiveRoomId !== undefined) {
            this.callChangeRoom({
                callId: call.id,
                roomId: this.currentActiveRoomId
            })
        }

        call.connection.addEventListener('addstream', (event) => {
            // dispatch('_triggerAddStream', { event, call })
            this._triggerAddStream(event as MediaEvent, call)
        })
    }

    public async callChangeRoom ({ callId, roomId }: { callId: string, roomId: number }) {
        const oldRoomId = activeCalls[callId].roomId

        activeCalls[callId].roomId = roomId

        await this.setCurrentActiveRoomId(roomId)

        return Promise.all([
            this.roomReconfigure(oldRoomId),
            this.roomReconfigure(roomId)
        ]).then(() => {
            this.deleteRoomIfEmpty(oldRoomId)
            this.deleteRoomIfEmpty(roomId)
        })
    }
}

export default OpenSIPSJS