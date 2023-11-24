import UA from '@/helpers/UA'
import {
    IncomingAckEvent,
    IncomingEvent,
    OutgoingAckEvent,
    OutgoingEvent
} from 'jssip/lib/RTCSession'
import { RTCSessionEvent, UAConfiguration, UAEventMap } from 'jssip/lib/UA'
import { MSRPSessionEvent } from '@/helpers/UA'
import { forEach } from 'p-iteration'

import { TempTimeData, ITimeData, setupTime } from '@/helpers/time.helper'
import { filterObjectKeys } from '@/helpers/filter.helper'
import {
    syncStream,
    processAudioVolume,
    simplifyCallObject,
    simplifyMessageObject,
    isLoggerCompatible
} from '@/helpers/audio.helper'
import WebRTCMetrics from '@/helpers/webrtcmetrics/metrics'

import { WebrtcMetricsConfigType, Probe, ProbeMetricInType, MetricAudioData, MediaDeviceType } from '@/types/webrtcmetrics'
import { ListenersKeyType, ListenerCallbackFnType } from '@/types/listeners'
import {
    RTCSessionExtended,
    ICall,
    IntervalType,
    ListenerEventType,
    MediaEvent,
    ICallStatusUpdate,
    IRoom,
    IDoCallParam,
    ICallStatus,
    IRoomUpdate,
    IOpenSIPSJSOptions,
    TriggerListenerOptions, CustomLoggerType
} from "@/types/rtc";

import {
    IMessage,
    MSRPSessionExtended,
    TriggerMSRPListenerOptions
} from '@/types/msrp'

import MSRPMessage from '@/lib/msrp/message'
import JsSIP from 'jssip/lib/JsSIP'

import { METRIC_KEYS_TO_INCLUDE } from '@/enum/metric.keys.to.include'
import { CALL_EVENT_LISTENER_TYPE } from '@/enum/call.event.listener.type'

const CALL_STATUS_UNANSWERED = 0

const STORAGE_KEYS = {
    SELECTED_INPUT_DEVICE: 'selectedInputDevice',
    SELECTED_OUTPUT_DEVICE: 'selectedOutputDevice'
}

const activeMessages: { [key: string]: IMessage } = {}

export interface InnerState {
    isMuted: boolean
    muteWhenJoin: boolean
    isDND: boolean
    activeCalls: { [key: string]: ICall }
    extendedCalls: { [key: string]: ICall }
    activeMessages: { [key: string]: IMessage }
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
    listeners: { [key: string]: Array<(call: any, event: ListenerEventType | undefined) => void> }
    metricConfig: WebrtcMetricsConfigType
    isAutoAnswer: boolean
    msrpHistory: { [key: string]: Array<MSRPMessage> }
}

class OpenSIPSJS extends UA {
    private initialized = false

    private readonly options: IOpenSIPSJSOptions
    private readonly newRTCSessionEventName: ListenersKeyType = 'newRTCSession'
    private readonly registeredEventName: ListenersKeyType = 'registered'
    private readonly unregisteredEventName: ListenersKeyType = 'unregistered'
    private readonly disconnectedEventName: ListenersKeyType = 'disconnected'
    private readonly connectedEventName: ListenersKeyType = 'connected'
    private readonly newMSRPSessionEventName: ListenersKeyType = 'newMSRPSession'
    private readonly activeCalls: { [key: string]: ICall } = {}
    private readonly extendedCalls: { [key: string]: ICall } = {}
    private readonly activeMessages: { [key: string]: IMessage } = {}
    //private readonly activeRooms: { [key: number]: IRoom } = {}
    private _currentActiveRoomId: number | undefined
    private _callAddingInProgress: string | undefined
    private _isMSRPInitializing: boolean | undefined
    private isReconnecting = false
    private logger: CustomLoggerType = console
    private state: InnerState = {
        isMuted: false,
        isAutoAnswer: false,
        activeCalls: {},
        extendedCalls: {},
        activeMessages: {},
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
        },
        msrpHistory: {}
    }

    constructor (options: IOpenSIPSJSOptions, logger?: CustomLoggerType) {
        const configuration: UAConfiguration = {
            ...options.configuration,
            sockets: options.socketInterfaces.map(sock => new JsSIP.WebSocketInterface(sock))
        }

        super(configuration)

        this.options = options

        if (logger && isLoggerCompatible(logger)) {
            this.logger = logger
        }
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

    public get autoAnswer () {
        return this.state.isAutoAnswer
    }

    public set autoAnswer (value: boolean) {
        this.state.isAutoAnswer = value
    }

    public get callAddingInProgress () {
        return this._callAddingInProgress
    }
    private set callAddingInProgress (value: string | undefined) {
        this._callAddingInProgress = value
        this.emit('callAddingInProgressChanged', value)
    }

    public get isMSRPInitializing () {
        return this._isMSRPInitializing
    }
    private set isMSRPInitializing (value: boolean | undefined) {
        this._isMSRPInitializing = value
        this.emit('isMSRPInitializingChanged', value)
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

        Object.values(this.state.extendedCalls).forEach((call) => {
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

    public get hasActiveCalls () {
        return Object.values(this.state.extendedCalls).length > 0
    }

    public get getActiveMessages () {
        return this.state.activeMessages
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

    private setAvailableMediaDevices (devices: Array<MediaDeviceInfo>) {
        this.state.availableMediaDevices = devices
        this.emit('changeAvailableDeviceList', devices)
    }

    public async updateDeviceList () {
        await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
        const devices = await navigator.mediaDevices.enumerateDevices()

        this.setAvailableMediaDevices(devices)
    }

    public async setMediaDevices (setDefaults = false) {
        this.state.selectedMediaDevices.input = localStorage.getItem(STORAGE_KEYS.SELECTED_INPUT_DEVICE) || 'default'
        this.state.selectedMediaDevices.output = localStorage.getItem(STORAGE_KEYS.SELECTED_OUTPUT_DEVICE) || 'default'

        await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
        const devices = await navigator.mediaDevices.enumerateDevices()

        this.setAvailableMediaDevices(devices)

        const defaultMicrophone = setDefaults
            ? this.getInputDefaultDevice?.deviceId || ''
            : ''
        const defaultSpeaker = setDefaults
            ? this.getOutputDefaultDevice?.deviceId || ''
            : ''

        await this.setMicrophone(defaultMicrophone)
        await this.setSpeaker(defaultSpeaker)
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
        const call = this.state.extendedCalls[callId]
        call.sendDTMF(value)
    }

    public doMute (value: boolean) {
        const activeRoomId = this.currentActiveRoomId
        this.isMuted = value
        this.roomReconfigure(activeRoomId)
    }

    public doCallHold ({ callId, toHold, automatic }: { callId: string, toHold: boolean, automatic?: boolean }) {
        const call = this.state.extendedCalls[callId]
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
        const call = this.state.extendedCalls[callId]

        this._cancelAllOutgoingUnanswered()
        call.answer(this.sipOptions)
        this.updateCall(call)
        // TODO: maybe would be better to move to the top
        this.setCurrentActiveRoomId(call.roomId)

        call.connection.addEventListener('addstream', async (event: Event) => {
            this._triggerAddStream(event as MediaEvent, call)
        })
    }

    public msrpAnswer (callId: string) {
        const call = activeMessages[callId]

        //this._cancelAllOutgoingUnanswered()
        call.answer(this.sipOptions)
        this.updateMSRPSession(call)
        // TODO: maybe would be better to move to the top
        //this.setCurrentActiveRoomId(call.roomId)
    }

    public async callMove (callId: string, roomId: number) {
        this._updateCallStatus({ callId, isMoving: true })
        await this.callChangeRoom({ callId, roomId })
        this._updateCallStatus({ callId, isMoving: false })
    }

    public updateCall (value: ICall) {
        this.state.activeCalls[value._id] = simplifyCallObject(value) as ICall
        this.emit('changeActiveCalls', this.state.activeCalls)
    }

    public updateMSRPSession (value: IMessage) {
        this.state.activeMessages[value._id] = simplifyMessageObject(value) as IMessage
        this.emit('changeActiveMessages', this.state.activeMessages)
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

    private hasAutoAnswerHeaders (event: RTCSessionEvent) {
        const regex = /answer-after=0/
        const request = event.request

        const callInfoHeader = request.getHeader('Call-Info')

        return callInfoHeader && regex.test(callInfoHeader)
    }

    private _addCall (value: ICall, emitEvent = true) {
        this.state.activeCalls = {
            ...this.state.activeCalls,
            [value._id]: simplifyCallObject(value) as ICall
        }

        /*this.state.extendedCalls = {
            ...this.state.extendedCalls,
            [value._id]: value
        }*/

        this.state.extendedCalls[value._id] = value

        if (emitEvent) {
            this.emit('changeActiveCalls', this.state.activeCalls)
        }
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

        this.emit('changeCallStatus', this.state.callStatus)
    }

    private _addMMSRPSession (value: IMessage) {
        this.state.activeMessages = {
            ...this.state.activeMessages,
            [value._id]: simplifyMessageObject(value) as IMessage
        }

        activeMessages[value._id] = value
        this.emit('changeActiveMessages', this.state.activeMessages)
    }

    private _addMSRPMessage (value: MSRPMessage, session: MSRPSessionExtended) {
        const sessionMessages = this.state.msrpHistory[session.id] || []
        sessionMessages.push(value)

        this.state.msrpHistory = {
            ...this.state.msrpHistory,
            [session.id]: [ ...sessionMessages ]
        }
        this.emit('newMSRPMessage', { message: value, session: session })
    }

    private _updateCallStatus (value: ICallStatusUpdate) {
        const prevStatus = { ...this.state.callStatus[value.callId] }

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

        this.state.callStatus = {
            ...this.state.callStatus,
            [value.callId]: {
                ...newStatus
            }
        }

        this.emit('changeCallStatus', this.state.callStatus)
    }

    private _removeCallStatus (callId: string) {
        const callStatusCopy = { ...this.state.callStatus }
        delete callStatusCopy[callId]

        this.state.callStatus = {
            ...callStatusCopy,
        }

        this.emit('changeCallStatus', this.state.callStatus)
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

        const callsInCurrentRoom = Object.values(this.state.extendedCalls).filter(call => call.roomId === this.currentActiveRoomId)

        if (callsInCurrentRoom.length === 1) {
            Object.values(callsInCurrentRoom).forEach(call => {
                const processedStream = processAudioVolume(stream, this.microphoneInputLevel)
                processedStream.getTracks().forEach(track => track.enabled = !this.isMuted)
                this._setOriginalStream(processedStream)
                call.connection.getSenders()[0].replaceTrack(processedStream.getTracks()[0])
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

        const activeCallList = Object.values(this.state.extendedCalls)

        if (activeCallList.length === 0) {
            return
        }

        const callsInCurrentRoom = activeCallList.filter(call => call.roomId === this.currentActiveRoomId)

        if (callsInCurrentRoom.length === 1) {
            activeCallList.forEach(call => {
                call.audioTag?.setSinkId(dId)
                this.updateCall(call)
            })
        } else {
            await this._doConference(callsInCurrentRoom)
        }
    }

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

        if (Object.values(this.state.extendedCalls).filter(call => call.roomId === roomId).length === 0) {
            this.removeRoom(roomId)

            if (this.currentActiveRoomId === roomId) {
                this.currentActiveRoomId = undefined
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

        const callsInRoom = Object.values(this.state.extendedCalls).filter(call => call.roomId === roomId)

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
                this._setOriginalStream(processedStream)
                await callsInRoom[0].connection.getSenders()[0].replaceTrack(processedStream.getTracks()[0])
                this.muteReconfigure(callsInRoom[0])
            }
        } else if (callsInRoom.length > 1) {
            await this._doConference(callsInRoom)
        }
    }

    private async _doConference (sessions: Array<ICall>) {
        sessions.forEach(call => {
            if (call._localHold) {
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

            session.connection.getReceivers().forEach((receiver:  RTCRtpReceiver) => {
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
                this._setOriginalStream(processedStream)
                const sourceStream = audioContext.createMediaStreamSource(processedStream)

                // stream.getTracks().forEach(track => track.enabled = !getters.isMuted) // TODO: Fix this

                sourceStream.connect(mixedOutput)
            }

            if (session.connection.getSenders()[0]) {
                //mixedOutput.stream.getTracks().forEach(track => track.enabled = !getters.isMuted) // Uncomment to mute all callers on mute
                await session.connection.getSenders()[0].replaceTrack(mixedOutput.stream.getTracks()[0])
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
        const call = this.state.extendedCalls[callId]

        if (call && call.connection.getReceivers().length) {
            call.localMuted = value
            call.connection.getReceivers().forEach((receiver: RTCRtpReceiver) => {
                receiver.track.enabled = !value
            })
            this.updateCall(call)
            this.roomReconfigure(call.roomId)
        }
    }

    public callTerminate (callId: string) {
        const call = this.state.extendedCalls[callId]

        if (call._status !== 8) {
            call.terminate()
        }
    }

    public messageTerminate (callId: string) {
        const call = activeMessages[callId]

        if (call._status !== 8) {
            call.terminate()
        }
    }

    public callTransfer (callId: string, target: string) {
        if (target.toString().length === 0) {
            return console.error('Target must be passed')
        }

        const call = this.state.extendedCalls[callId]

        if (!call._is_confirmed && !call._is_canceled) {
            const redirectTarget = `sip:${target}@${this.sipDomain}`

            call.terminate({
                status_code: 302,
                reason_phrase: 'Moved Temporarily',
                extraHeaders: [ `Contact: ${redirectTarget}` ]
            })

            return
        }

        this._updateCallStatus({ callId, isTransferring: true })

        call.refer(`sip:${target}@${this.sipDomain}`)
        this.updateCall(call)
    }

    public callMerge (roomId: number) {
        const callsInRoom = Object.values(this.state.extendedCalls).filter((call) => call.roomId === roomId)
        if (callsInRoom.length !== 2) return

        const firstCall = callsInRoom[0]
        const secondCall = callsInRoom[1]

        if (!firstCall || !secondCall) {
            return
        }

        // TODO: Check all call.id for working in the same way as call._id
        this._updateCallStatus({ callId: firstCall._id, isMerging: true })
        this._updateCallStatus({ callId: secondCall._id, isMerging: true })

        firstCall.refer(secondCall.remote_identity.uri.toString(), { 'replaces': secondCall })
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
        this.setCallTime(timeData)

        const interval = setInterval(() => {
            const callTime = { ...this.state.callTime[callId] }
            const updatedTime = setupTime(callTime)
            this.setCallTime({ callId, ...updatedTime })
        }, 1000)

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
    }

    private getNewRoomId () {
        const roomIdList = Object.keys(this.state.activeRooms)

        if (roomIdList.length === 0) {
            return 1
        }

        return (parseInt(roomIdList.sort()[roomIdList.length - 1]) + 1)
    }

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

    private async addCall (event: RTCSessionEvent) {
        const session = event.session as RTCSessionExtended
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
            this.logger.log('New incoming call from', session._remote_identity?._uri?._user)
            newRoomInfo.incomingInProgress = true

            this.subscribe(CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED, (call) => {
                if (session.id === call.id) {
                    this.updateRoom( {
                        incomingInProgress: false,
                        roomId
                    })
                    this._startCallTimer(session.id)
                }
            })

            this.subscribe(CALL_EVENT_LISTENER_TYPE.CALL_FAILED, (call) => {
                if (session.id === call.id) {
                    this.updateRoom({
                        incomingInProgress: false,
                        roomId
                    })

                    this.deleteRoomIfEmpty(roomId)
                }
            })

        } else if (session.direction === 'outgoing') {
            this._startCallTimer(session.id)
        }

        const call = session as ICall

        const autoAnswerByHeaders = this.hasAutoAnswerHeaders(event)

        const doAutoAnswer = call.direction === 'incoming' && !this.hasActiveCalls && (autoAnswerByHeaders || this.autoAnswer)

        call.roomId = roomId
        call.localMuted = false
        call.autoAnswer = doAutoAnswer

        if (doAutoAnswer) {
            this._addCall(call, false)
        } else {
            this._addCall(call)
        }

        // this._addCall(call)
        this._addCallStatus(session.id)
        this._addRoom(newRoomInfo)

        if (doAutoAnswer) {
            this.callAnswer(call._id)
        }
    }

    private addMessageSession (session: MSRPSessionExtended) {
        // For cases when session.direction === 'outgoing' and all the
        // session properties are missing before answer
        if (!session._id) {
            return
        }

        const sessionAlreadyInActiveMessages = this.getActiveMessages[session._id]

        if (sessionAlreadyInActiveMessages !== undefined) {
            return
        }

        /*const roomId = this.getNewRoomId()

        const newRoomInfo: IRoom = {
            started: new Date(),
            incomingInProgress: false,
            roomId
        }*/

        /*if (session.direction === 'incoming') {
            newRoomInfo.incomingInProgress = true

            this.subscribe(CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED, (call) => {
                if (session.id === call.id) {
                    this.updateRoom( {
                        incomingInProgress: false,
                        roomId
                    })
                    this._startCallTimer(session.id)
                }
            })

            this.subscribe(CALL_EVENT_LISTENER_TYPE.CALL_FAILED, (call) => {
                if (session.id === call.id) {
                    this.updateRoom({
                        incomingInProgress: false,
                        roomId
                    })
                }
            })

        } else if (session.direction === 'outgoing') {
            this._startCallTimer(session.id)
        }*/

        const MSRPSession = session as IMessage

        //MSRPSession.roomId = roomId

        this._addMMSRPSession(MSRPSession)
        //this._addMMSRPSessionStatus(session.id)
        //this._addRoom(newRoomInfo)
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
    private _triggerMSRPListener ({ listenerType, session, event }: TriggerMSRPListenerOptions) {
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

        // delete activeCalls[value]
        this.state.activeCalls = {
            ...stateActiveCallsCopy,
        }

        const stateExtendedCallsCopy = { ...this.state.extendedCalls }
        delete stateExtendedCallsCopy[value]
        this.state.extendedCalls = {
            ...stateExtendedCallsCopy,
        }

        this.emit('changeActiveCalls', this.state.activeCalls)
    }

    private _removeMMSRPSession (value: string) {
        const stateActiveMessagesCopy = { ...this.state.activeMessages }
        delete stateActiveMessagesCopy[value]

        delete activeMessages[value]
        this.state.activeMessages = {
            ...stateActiveMessagesCopy,
        }
        this.emit('changeActiveMessages', this.state.activeMessages)
    }

    private _activeCallListRemove (call: ICall) {
        const callRoomIdToConfigure = this.state.extendedCalls[call._id].roomId
        this._removeCall(call._id)
        this.roomReconfigure(callRoomIdToConfigure)
    }

    private _activeMessageListRemove (call: IMessage) {
        //const callRoomIdToConfigure = activeMessages[call._id].roomId
        this._removeMMSRPSession(call._id)
        //this.roomReconfigure(callRoomIdToConfigure)
    }

    private newRTCSessionCallback (event: RTCSessionEvent) {
        const session = event.session as RTCSessionExtended

        if (this.isDND) {
            session.terminate({ status_code: 486, reason_phrase: 'Do Not Disturb' })
            return
        }

        // stop timers on ended and failed
        session.on('ended', (event) => {
            this.logger.log('Session ended for', session._remote_identity?._uri?._user)
            this._triggerListener({ listenerType: CALL_EVENT_LISTENER_TYPE.CALL_ENDED, session, event })
            const s = this.getActiveCalls[session.id]

            if (s) {
                this._activeCallListRemove(s)
            }

            this._stopCallTimer(session.id)
            this._removeCallStatus(session.id)
            this._removeCallMetrics(session.id)

            if (!Object.keys(this.state.extendedCalls).length) {
                this.isMuted = false
            }
        })
        session.on('progress', (event: IncomingEvent | OutgoingEvent) => {
            this.logger.log('Session in progress for', session._remote_identity?._uri?._user)
            this._triggerListener({ listenerType: CALL_EVENT_LISTENER_TYPE.CALL_PROGRESS, session, event })
        })
        session.on('failed', (event) => {
            this.logger.log('Session failed for', session._remote_identity?._uri?._user)
            this._triggerListener({ listenerType: CALL_EVENT_LISTENER_TYPE.CALL_FAILED, session, event })

            if (session.id === this.callAddingInProgress) {
                this.callAddingInProgress = undefined
            }

            const s = this.getActiveCalls[session.id]

            if (s) {
                this._activeCallListRemove(s)
            }

            this._stopCallTimer(session.id)
            this._removeCallStatus(session.id)
            this._removeCallMetrics(session.id)

            if (!Object.keys(this.state.extendedCalls).length) {
                this.isMuted = false
            }
        })
        session.on('confirmed', (event: IncomingAckEvent | OutgoingAckEvent) => {
            this.logger.log('Session confirmed for', session._remote_identity?._uri?._user)
            this._triggerListener({ listenerType: CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED, session, event })
            this.updateCall(session as ICall)

            if (session.id === this.callAddingInProgress) {
                this.callAddingInProgress = undefined
            }
        })

        this.addCall(event)

        if (session.direction === 'outgoing') {
            const roomId = this.getActiveCalls[session.id].roomId
            this.setCurrentActiveRoomId(roomId)
        }
    }

    private newMSRPSessionCallback (event: MSRPSessionEvent) {
        const session = event.session as MSRPSessionExtended

        /*if (this.isDND) {
            session.terminate({ status_code: 486, reason_phrase: 'Do Not Disturb' })
            return
        }*/

        // stop timers on ended and failed
        session.on('ended', (event: Event) => {
            this._triggerMSRPListener({ listenerType: CALL_EVENT_LISTENER_TYPE.CALL_ENDED, session, event })
            const s = this.getActiveMessages[session.id]
            this._activeMessageListRemove(s)
            //this._stopCallTimer(session.id)
            //this._removeCallStatus(session.id)
            //this._removeCallMetrics(session.id)

            /*if (!Object.keys(activeMessages).length) {
                this.isMuted = false
            }*/
        })
        /*session.on('active', (event: Event) => {
            console.log('event newMSRPSessionCallback active', session)
            //this._triggerMSRPListener({ listenerType: CALL_EVENT_LISTENER_TYPE.CALL_PROGRESS, session, event })
        })*/
        session.on('failed', (event: Event) => {
            this._triggerMSRPListener({ listenerType: CALL_EVENT_LISTENER_TYPE.CALL_FAILED, session, event })

            /*if (session.id === this.callAddingInProgress) {
                this.callAddingInProgress = undefined
            }*/

            // console.log(session, '0000000000000000000000000')
            const s = this.getActiveMessages[session.id]
            this._activeMessageListRemove(s)
            //this._stopCallTimer(session.id)
            //this._removeCallStatus(session.id)
            //this._removeCallMetrics(session.id)

            /*if (!Object.keys(activeMessages).length) {
                this.isMuted = false
            }*/
        })
        session.on('confirmed', (event: IncomingAckEvent | OutgoingAckEvent) => {
            this._triggerMSRPListener({ listenerType: CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED, session, event })
            this.updateMSRPSession(session as IMessage)

            /*if (session.id === this.callAddingInProgress) {
                this.callAddingInProgress = undefined
            }*/
        })

        session.on('newMessage', (msg: MSRPMessage) => {
            this._addMSRPMessage(msg, session)
        })

        this.addMessageSession(session)

        /*if (session.direction === 'outgoing') {
            const roomId = this.getActiveMessages[session.id].roomId
            this.setCurrentActiveRoomId(roomId)
        }*/
    }

    private setInitialized (value: boolean) {
        this.initialized = value
        this.emit('ready', value)
    }

    public begin () {
        if (this.isConnected()) {
            console.error('Connection is already established')
            return
        }

        this.on(
            this.registeredEventName,
            () => {
                this.logger.log('Successfully registered to', this.options.socketInterfaces[0])
                this.setInitialized(true)
            }
        )

        this.on(
            this.unregisteredEventName,
            () => {
                this.logger.log('Unregistered from', this.options.socketInterfaces[0])
                this.setInitialized(false)
            }
        )

        this.on(
            this.newRTCSessionEventName,
            this.newRTCSessionCallback.bind(this)
        )

        this.on(
            this.connectedEventName,
            () => {
                this.logger.log('Connected to', this.options.socketInterfaces[0])
                this.isReconnecting = false
            }
        )

        this.on(
            this.disconnectedEventName,
            () => {
                if (this.isReconnecting) {
                    return
                }
                this.logger.log('Disconnected from', this.options.socketInterfaces[0])
                this.logger.log('Reconnecting to', this.options.socketInterfaces[0])
                this.isReconnecting = true
                this.stop()
                this.setInitialized(false)
                setTimeout(this.start.bind(this), 5000)
            }
        )

        this.on(
            this.newMSRPSessionEventName,
            this.newMSRPSessionCallback.bind(this)
        )

        this.logger.log('Connecting to', this.options.socketInterfaces[0])
        this.start()

        this.setMediaDevices(true)

        return this
    }

    public setMuteWhenJoin (value: boolean) {
        this.muteWhenJoin = value
    }

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
        this.isMuted = this.muteWhenJoin

        const stream = await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
        const processedStream = processAudioVolume(stream, this.microphoneInputLevel)
        const muteMicro = this.isMuted || this.muteWhenJoin

        processedStream.getTracks().forEach(track => track.enabled = !muteMicro)
        this._setOriginalStream(processedStream)
        await call.connection.getSenders()[0].replaceTrack(processedStream.getTracks()[0])

        syncStream(event, call, this.selectedOutputDevice, this.speakerVolume)
        this._getCallQuality(call)
        this.updateCall(call)
    }

    public doCall ({ target, addToCurrentRoom }: IDoCallParam) {
        this.checkInitialized()

        if (target.length === 0) {
            return console.error('Target must be a valid string')
        }

        this.logger.log(`Calling sip:${target}@${this.sipDomain}...`)
        const call = this.call(
            `sip:${target}@${this.sipDomain}`,
            this.sipOptions
        )

        this.callAddingInProgress = call.id

        if (addToCurrentRoom && this.currentActiveRoomId !== undefined) {
            this.callChangeRoom({
                callId: call.id,
                roomId: this.currentActiveRoomId
            })
        }

        call.connection.addEventListener('addstream', (event: Event) => {
            this._triggerAddStream(event as MediaEvent, call as ICall)
        })
    }

    public initMSRP (target: string, body: string, options: any) {

        this.checkInitialized()

        if (target.length === 0) {
            return console.error('Target must be a valid string')
        }

        const session = this.startMSRP(target, options) as MSRPSessionExtended
        session.on('active', () => {
            this.addMessageSession(session)
            session.sendMSRP(body)
            this.isMSRPInitializing = false
        })

        this.isMSRPInitializing = true

        // if (this.currentActiveRoomId !== undefined) {
        //     this.callChangeRoom({
        //         callId: call.id,
        //         roomId: this.currentActiveRoomId
        //     })
        // }

        //this.updateMSRPSession(session)
    }

    public sendMSRP (msrpSessionId: string, body: string) {
        const msrpSession = activeMessages[msrpSessionId]
        if (!msrpSession) {
            throw new Error(`MSRP session with id ${msrpSessionId} doesn't exist!`)
        }

        msrpSession.sendMSRP(body)
    }

    public async callChangeRoom ({ callId, roomId }: { callId: string, roomId: number }) {
        const oldRoomId = this.state.extendedCalls[callId].roomId

        this.state.extendedCalls[callId].roomId = roomId

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
