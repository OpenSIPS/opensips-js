import UA from '@/helpers/UA'
import {
    IncomingAckEvent,
    IncomingEvent,
    OutgoingAckEvent,
    OutgoingEvent,
    EndEvent
} from 'jssip/lib/RTCSession'
import { RTCSessionEvent, UAConfiguration, UAEventMap } from 'jssip/lib/UA'
import { MSRPSessionEvent } from '@/helpers/UA'
import { forEach } from 'p-iteration'

import { setupTime } from '@/helpers/time.helper'
import { ITimeData } from '@/types/timer'
import { filterObjectKeys } from '@/helpers/filter.helper'
import {
    syncStream,
    processAudioVolume,
    simplifyCallObject,
    simplifyMessageObject,
    isLoggerCompatible
} from '@/helpers/audio.helper'
import WebRTCMetrics from '@/helpers/webrtcmetrics/metrics'
//import VUMeter from '@/helpers/VUMeter'

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
    ICallStatus,
    IRoomUpdate,
    IOpenSIPSJSOptions,
    TriggerListenerOptions, CustomLoggerType, Modules, AudioModuleName
} from '@/types/rtc'

import {
    IMessage,
    MSRPSessionExtended,
    TriggerMSRPListenerOptions
} from '@/types/msrp'

import MSRPMessage from '@/lib/msrp/message'
import JsSIP from 'jssip/lib/JsSIP'

import { METRIC_KEYS_TO_INCLUDE } from '@/enum/metric.keys.to.include'
import { CALL_EVENT_LISTENER_TYPE } from '@/enum/call.event.listener.type'

import audioContext from '@/helpers/audioContext'

import { AudioModule } from '@/modules/audio'
import { VideoModule } from '@/modules/video'
import { MSRPModule } from '@/modules/msrp'
import { MODULES } from '@/enum/modules'

const CALL_STATUS_UNANSWERED = 0

const STORAGE_KEYS = {
    SELECTED_INPUT_DEVICE: 'OpensipsJSInputDevice',
    SELECTED_OUTPUT_DEVICE: 'OpensipsJSOutputDevice'
}

function requireInitialization () {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value

        descriptor.value = function (...args: any[]) {
            if (!this.initialized) {
                throw new Error('Class not initialized. Call init() first.')
            }
            return originalMethod.apply(this, args)
        }

        return descriptor
    }
}

class OpenSIPSJS extends UA {
    public initialized = false

    public readonly options: IOpenSIPSJSOptions
    public logger: CustomLoggerType = console
    //private VUMeter: VUMeter

    /* Events */
    public readonly newRTCSessionEventName: ListenersKeyType = 'newRTCSession'
    private readonly registeredEventName: ListenersKeyType = 'registered'
    private readonly unregisteredEventName: ListenersKeyType = 'unregistered'
    private readonly disconnectedEventName: ListenersKeyType = 'disconnected'
    private readonly connectedEventName: ListenersKeyType = 'connected'
    private readonly newMSRPSessionEventName: ListenersKeyType = 'newMSRPSession'

    /* State */
    //private muted = false
    //private isAutoAnswer = false
    //private isDNDEnabled = false
    //private muteWhenJoinEnabled = false

    /*private activeRooms: { [key: number]: IRoom } = {}
    private activeCalls: { [key: string]: ICall } = {}
    private extendedCalls: { [key: string]: ICall } = {}*/

    /*private activeMessages: { [key: string]: IMessage } = {}
    private extendedMessages: { [key: string]: IMessage } = {}
    private msrpHistory: { [key: string]: Array<MSRPMessage> } = {}*/

    /*private microphoneInputLevelValue = 1 // [0;1]
    private speakerVolumeValue = 1 // [0;1]*/
    /*private availableMediaDevices: Array<MediaDeviceInfo> = []
    private selectedMediaDevices: { [key in MediaDeviceType]: string } = {
        input: 'default',
        output: 'default'
    }*/

    /*private callStatus: { [key: string]: ICallStatus } = {}
    private callTime: { [key: string]: TempTimeData } = {}
    private callMetrics: { [key: string]: any } = {}
    private timeIntervals: { [key: string]: IntervalType } = {}
    private metricConfig: WebrtcMetricsConfigType = {
        refreshEvery: 1000
    }*/

    /*private activeStreamValue: MediaStream | null = null
    //private initialStreamValue: MediaStream | null = null*/
    //private currentActiveRoomIdValue: number | undefined
    //private isCallAddingInProgress: string | undefined
    private isMSRPInitializingValue: boolean | undefined
    private isReconnecting = false

    public audio: AudioModule = null
    public msrp: MSRPModule = null
    public video: VideoModule = null

    private listenersList: {
        [key: string]: Array<(call: any, event: ListenerEventType | undefined) => void>
    } = {}

    private modules: Array<Modules> = []

    constructor (options: IOpenSIPSJSOptions, logger?: CustomLoggerType) {
        if (!options.modules.length) {
            throw new Error('options.modules should include at least 1 module')
        }

        const configuration: UAConfiguration = {
            ...options.configuration,
            sockets: options.socketInterfaces.map(sock => new JsSIP.WebSocketInterface(sock))
        }

        super(configuration)

        if (options.pnExtraHeaders && Object.keys(options.pnExtraHeaders).length) {
            this.registrator().setExtraContactParams(options.pnExtraHeaders)
        }

        this.options = options
        this.modules = options.modules

        if (logger && isLoggerCompatible(logger)) {
            this.logger = logger
        }
    }

    public on <T extends ListenersKeyType> (type: T, listener: ListenerCallbackFnType<T>) {
        return super.on(type as keyof UAEventMap, listener as UAEventMap[keyof UAEventMap])
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

    public begin () {
        if (this.isConnected()) {
            console.error('Connection is already established')
            return
        }

        if (this.modules.includes(MODULES.AUDIO)) {
            this.audio = new AudioModule(this)
        }

        if (this.modules.includes(MODULES.MSRP)) {
            this.msrp = new MSRPModule(this)
        }

        if (this.modules.includes(MODULES.VIDEO)) {
            this.video = new VideoModule(this)
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

        this.logger.log('Connecting to', this.options.socketInterfaces[0])
        this.start()

        return this
    }

    /*public get sipOptions () {
        const options = {
            ...this.options.sipOptions,
            mediaConstraints: this.getUserMediaConstraints
        }

        return options
    }*/

    /*public get currentActiveRoomId () {
        return this.currentActiveRoomIdValue
    }
    private set currentActiveRoomId (roomId: number | undefined) {
        this.currentActiveRoomIdValue = roomId
        this.emit('currentActiveRoomChanged', roomId)
    }

    public get autoAnswer () {
        return this.isAutoAnswer
    }

    public get callAddingInProgress () {
        return this.isCallAddingInProgress
    }
    private set callAddingInProgress (value: string | undefined) {
        this.isCallAddingInProgress = value
        this.emit('callAddingInProgressChanged', value)
    }*/

    // TODO: MSRP
    /*public get isMSRPInitializing () {
        return this.isMSRPInitializingValue
    }*/

    /*public get muteWhenJoin () {
        return this.muteWhenJoinEnabled
    }

    public get isDND () {
        return this.isDNDEnabled
    }

    public get speakerVolume () {
        return this.speakerVolumeValue
    }

    public get microphoneInputLevel () {
        return this.microphoneInputLevelValue
    }

    public get getActiveCalls () {
        return this.activeCalls
    }

    public get hasActiveCalls () {
        return Object.values(this.extendedCalls).length > 0
    }*/

    // TODO: MSRP
    /*public get getActiveMessages () {
        return this.activeMessages
    }*/

    /*public get getActiveRooms () {
        return this.activeRooms
    }

    public get isMuted () {
        return this.muted
    }

    public get getInputDeviceList () {
        return this.availableMediaDevices.filter(device => device.kind === 'audioinput')
    }

    public get getOutputDeviceList () {
        return this.availableMediaDevices.filter(device => device.kind === 'audiooutput')
    }

    public get getUserMediaConstraints () {
        return {
            audio: {
                deviceId: {
                    exact: this.selectedMediaDevices.input
                }
            },
            video: false
        }
    }

    public get selectedInputDevice () {
        return this.selectedMediaDevices.input
    }

    public get selectedOutputDevice () {
        return this.selectedMediaDevices.output
    }

    public get activeStream () {
        return this.activeStreamValue
    }

    private setAvailableMediaDevices (devices: Array<MediaDeviceInfo>) {
        this.availableMediaDevices = devices
        this.emit('changeAvailableDeviceList', devices)
    }

    public async updateDeviceList () {
        await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
        const devices = await navigator.mediaDevices.enumerateDevices()

        this.setAvailableMediaDevices(devices)
    }

    private async initializeMediaDevices () {
        const initialInputDevice = localStorage.getItem(STORAGE_KEYS.SELECTED_INPUT_DEVICE) || 'default'
        const initialOutputDevice = localStorage.getItem(STORAGE_KEYS.SELECTED_OUTPUT_DEVICE) || 'default'

        // Ask input media permissions
        const stream = await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
        stream.getTracks().forEach(track => track.stop())

        const devices = await navigator.mediaDevices.enumerateDevices()

        this.setAvailableMediaDevices(devices)

        await this.setMicrophone(initialInputDevice)
        await this.setSpeaker(initialOutputDevice)

        navigator.mediaDevices.addEventListener('devicechange', async () => {
            const newDevices = await navigator.mediaDevices.enumerateDevices()
            this.setAvailableMediaDevices(newDevices)
        })
    }

    public setCallTime (value: ITimeData) {
        const time: TempTimeData = { ...value }
        delete time.callId

        this.callTime = {
            ...this.callTime,
            [value.callId]: time
        }

        this.emit('changeCallTime', this.callTime)
    }

    public removeCallTime (callId: string) {
        const callTimeCopy = { ...this.callTime }
        delete callTimeCopy[callId]

        this.callTime = {
            ...callTimeCopy,
        }

        this.emit('changeCallTime', this.callTime)
    }

    private setTimeInterval (callId: string, interval: IntervalType) {
        this.timeIntervals = {
            ...this.timeIntervals,
            [callId]: interval
        }
    }

    private removeTimeInterval (callId: string) {
        const timeIntervalsCopy = { ...this.timeIntervals }
        clearInterval(timeIntervalsCopy[callId])
        delete timeIntervalsCopy[callId]

        this.timeIntervals = {
            ...timeIntervalsCopy,
        }
    }

    private stopCallTimer (callId: string) {
        this.removeTimeInterval(callId)
        this.removeCallTime(callId)
    }

    private emitVolumeChange (callId: string, volume: number) {
        this.emit('changeCallVolume', {
            callId,
            volume
        })
    }

    public setMetricsConfig (config: WebrtcMetricsConfigType)  {
        this.metricConfig = {
            ...this.metricConfig,
            ...config
        }
    }

    public sendDTMF (callId: string, value: string) {
        const validation_regex = /^[A-D0-9]+$/g
        if (!validation_regex.test(value)) {
            throw new Error('Not allowed character in DTMF input')
        }
        const call = this.extendedCalls[callId]
        call.sendDTMF(value)
    }

    private setIsMuted (value: boolean) {
        this.muted = value
        this.emit('changeIsMuted', value)
    }

    private processMute (value: boolean) {
        const activeRoomId = this.currentActiveRoomId
        this.setIsMuted(value)

        this.initialStreamValue.getTracks().forEach(track => track.enabled = !value)
        this.roomReconfigure(activeRoomId)
    }

    public mute () {
        this.processMute(true)
    }

    public unmute () {
        this.processMute(false)
    }

    private async processHold ({ callId, toHold, automatic }: { callId: string, toHold: boolean, automatic?: boolean }) {
        const call = this.extendedCalls[callId]
        call._automaticHold = automatic ?? false

        const holdPromise = new Promise<void>((resolve) => {
            const resolveHold = () => {
                resolve()
            }

            if (toHold) {
                call.hold({}, resolveHold)
            } else {
                call.unhold({}, resolveHold)
            }
        })

        await holdPromise

        this.updateCall(call)

        const callsInRoom = Object.values(this.extendedCalls).filter(call =>
            call.roomId === this.currentActiveRoomId
            && (toHold ? callId !== call._id: true)
        )
        if (callsInRoom.length > 1) {
            await this.doConference(callsInRoom)
        }
    }

    public holdCall (callId: string, automatic = false) {
        return this.processHold({
            callId,
            automatic,
            toHold: true,
        })
    }

    public unholdCall (callId: string) {
        return this.processHold({
            callId,
            toHold: false,
        })
    }

    private cancelAllOutgoingUnanswered () {
        Object.values(this.getActiveCalls).filter(call => {
            return call.direction === 'outgoing'
                && call.status === CALL_STATUS_UNANSWERED
        }).forEach(call => this.terminateCall(call._id))
    }

    public answerCall (callId: string) {
        const call = this.extendedCalls[callId]

        this.cancelAllOutgoingUnanswered()
        call.answer(this.sipOptions)
        this.updateCall(call)
        // TODO: maybe would be better to move to the top
        this.setActiveRoom(call.roomId)

        call.connection.addEventListener('addstream', async (event: Event) => {
            this.triggerAddStream(event as MediaEvent, call)
        })
    }*/

    /*public async moveCall (callId: string, roomId: number) {
        this.updateCallStatus({
            callId,
            isMoving: true
        })
        await this.processRoomChange({
            callId,
            roomId
        })
        this.updateCallStatus({
            callId,
            isMoving: false
        })
    }

    public updateCall (value: ICall) {
        this.activeCalls[value._id] = simplifyCallObject(value) as ICall
        this.emit('changeActiveCalls', this.activeCalls)
    }*/

    /*public updateRoom (value: IRoomUpdate) {
        const room = this.activeRooms[value.roomId]

        const newRoomData: IRoom = {
            ...room,
            ...value
        }

        this.activeRooms = {
            ...this.activeRooms,
            [value.roomId]: {
                ...newRoomData
            }
        }

        this.emit('updateRoom', {
            room: newRoomData,
            roomList: this.activeRooms
        })
    }

    private hasAutoAnswerHeaders (event: RTCSessionEvent) {
        const regex = /answer-after=0/
        const request = event.request

        const callInfoHeader = request.getHeader('Call-Info')

        return callInfoHeader && regex.test(callInfoHeader)
    }

    private addCall (value: ICall, emitEvent = true) {
        this.activeCalls = {
            ...this.activeCalls,
            [value._id]: simplifyCallObject(value) as ICall
        }

        this.extendedCalls[value._id] = value

        if (emitEvent) {
            this.emit('changeActiveCalls', this.activeCalls)
        }
    }

    private addCallStatus (callId: string) {
        this.callStatus = {
            ...this.callStatus,
            [callId]: {
                isMoving: false,
                isTransferring: false,
                isMerging: false
            }
        }

        this.emit('changeCallStatus', this.callStatus)
    }*/

    /*private updateCallStatus (value: ICallStatusUpdate) {
        const prevStatus = { ...this.callStatus[value.callId] }

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

        this.callStatus = {
            ...this.callStatus,
            [value.callId]: {
                ...newStatus
            }
        }

        this.emit('changeCallStatus', this.callStatus)
    }

    private removeCallStatus (callId: string) {
        const callStatusCopy = { ...this.callStatus }
        delete callStatusCopy[callId]

        this.callStatus = {
            ...callStatusCopy,
        }

        this.emit('changeCallStatus', this.callStatus)
    }

    private addRoom (value: IRoom) {
        this.activeRooms = {
            ...this.activeRooms,
            [value.roomId]: value
        }

        this.emit('addRoom', {
            room: value,
            roomList: this.activeRooms
        })
    }

    private getActiveStream () {
        const processedStream = processAudioVolume(this.initialStreamValue, this.microphoneInputLevel * 2)
        processedStream.getTracks().forEach(track => track.enabled = !this.isMuted)
        this.setActiveStream(processedStream)
        return processedStream
    }

    public async setMicrophone (dId: string) {
        if (!this.getInputDeviceList.find(({ deviceId }) => deviceId === dId)) {
            return
        }

        this.setSelectedInputDevice(dId)

        if (Object.keys(this.getActiveCalls).length === 0) {
            return
        }

        await this.setupStream()

        const callsInCurrentRoom = Object.values(this.extendedCalls).filter(call => call.roomId === this.currentActiveRoomId)

        if (callsInCurrentRoom.length === 1) {
            Object.values(callsInCurrentRoom).forEach(async (call) => {
                const processedStream = this.getActiveStream()
                call.connection.getSenders()[0].replaceTrack(processedStream.getTracks()[0])
                this.updateCall(call)
            })
        } else {
            await this.doConference(callsInCurrentRoom)
        }
    }

    private setActiveStream (value: MediaStream) {
        if (this.activeStream) {
            this.stopVUMeter('origin')
        }

        this.setupVUMeter(value, 'origin')

        this.activeStreamValue = value
        this.emit('changeActiveStream', value)
    }

    public async setSpeaker (dId: string) {
        if (!this.getOutputDeviceList.find(({ deviceId }) => deviceId === dId)) {
            return
        }

        this.setSelectedOutputDevice(dId)

        const activeCallList = Object.values(this.extendedCalls)

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
            await this.doConference(callsInCurrentRoom)
        }
    }

    private removeRoom (roomId: number) {
        const activeRoomsCopy = { ...this.activeRooms }

        const roomToRemove = { ...activeRoomsCopy[roomId] }

        delete activeRoomsCopy[roomId]

        this.activeRooms = {
            ...activeRoomsCopy,
        }

        this.emit('removeRoom', {
            room: roomToRemove,
            roomList: this.activeRooms
        })
    }

    private deleteRoomIfEmpty (roomId: number | undefined) {
        if (roomId === undefined) {
            return
        }

        if (Object.values(this.extendedCalls).filter(call => call.roomId === roomId).length === 0) {
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
        if (this.muted) {
            call.mute({ audio: true })
        } else {
            call.unmute({ audio: true })
        }
    }

    private async roomReconfigure (roomId: number | undefined) {
        if (roomId === undefined) {
            return
        }

        const callsInRoom = Object.values(this.extendedCalls).filter(call => call.roomId === roomId)

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
                await this.holdCall(callsInRoom[0].id, true)
            }
        } else if (callsInRoom.length === 1 && this.currentActiveRoomId === roomId) {
            if (callsInRoom[0].isOnHold().local && callsInRoom[0]._automaticHold) {
                await this.unholdCall(callsInRoom[0].id)
            }

            if (callsInRoom[0].connection && callsInRoom[0].connection.getSenders()[0]) {
                const processedStream = this.getActiveStream()
                await callsInRoom[0].connection.getSenders()[0].replaceTrack(processedStream.getTracks()[0])
                this.muteReconfigure(callsInRoom[0])
            }
        } else if (callsInRoom.length > 1) {
            await this.doConference(callsInRoom)
        }
    }

    private async doConference (sessions: Array<ICall>) {
        await forEach(sessions, async (session: ICall) => {
            if (session._localHold) {
                await this.unholdCall(session._id)
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

        // For each call we will build dedicated mix for all other calls
        await forEach(sessions, async (session: ICall) => {
            if (session === null || session === undefined) {
                return
            }

            // Use the Web Audio API to mix the received tracks
            const allReceivedMediaStreams = new MediaStream()
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
                const processedStream = this.getActiveStream()
                const sourceStream = audioContext.createMediaStreamSource(processedStream)

                // stream.getTracks().forEach(track => track.enabled = !getters.isMuted) // TODO: Fix this

                sourceStream.connect(mixedOutput)
            }

            if (session.connection.getSenders()[0]) {
                //mixedOutput.stream.getTracks().forEach(track => track.enabled = !getters.isMuted) // Uncomment to mute all callers on mute
                await session.connection.getSenders()[0].replaceTrack(mixedOutput.stream.getTracks()[0])
                this.muteReconfigure(session)
            }
        })
    }

    private processCallerMute (callId: string, value: boolean) {
        const call = this.extendedCalls[callId]

        if (call && call.connection.getReceivers().length) {
            call.localMuted = value
            call.connection.getReceivers().forEach((receiver: RTCRtpReceiver) => {
                receiver.track.enabled = !value
            })
            this.updateCall(call)
            //this.roomReconfigure(call.roomId)
        }
    }

    public muteCaller (callId: string) {
        this.processCallerMute(callId, true)
    }

    public unmuteCaller (callId: string) {
        this.processCallerMute(callId, false)
    }

    public terminateCall (callId: string) {
        const call = this.extendedCalls[callId]

        if (call._status !== 8) {
            call.terminate()
        }
    }*/

    /*public transferCall (callId: string, target: string) {
        if (target.toString().length === 0) {
            return new Error('Target must be passed')
        }

        const call = this.extendedCalls[callId]

        if (!call._is_confirmed && !call._is_canceled) {
            const redirectTarget = `sip:${target}@${this.sipDomain}`

            call.terminate({
                status_code: 302,
                reason_phrase: 'Moved Temporarily',
                extraHeaders: [ `Contact: ${redirectTarget}` ]
            })

            return
        }

        this.updateCallStatus({
            callId,
            isTransferring: true
        })

        call.refer(`sip:${target}@${this.sipDomain}`)
        this.updateCall(call)
    }

    public mergeCall (roomId: number) {
        const callsInRoom = Object.values(this.extendedCalls).filter((call) => call.roomId === roomId)
        if (callsInRoom.length !== 2) return

        const firstCall = callsInRoom[0]
        const secondCall = callsInRoom[1]

        if (!firstCall || !secondCall) {
            return
        }

        // TODO: Check all call.id for working in the same way as call._id
        this.updateCallStatus({
            callId: firstCall._id,
            isMerging: true
        })
        this.updateCallStatus({
            callId: secondCall._id,
            isMerging: true
        })

        firstCall.refer(secondCall.remote_identity.uri.toString(), { replaces: secondCall })
        this.updateCall(firstCall)
    }

    // TODO: Use this method in demo
    public setDND (value: boolean) {
        this.isDNDEnabled = value
        this.emit('changeIsDND', value)
    }

    private startCallTimer (callId: string) {
        const timeData = {
            callId,
            hours: 0,
            minutes: 0,
            seconds: 0,
            formatted: ''
        }
        this.setCallTime(timeData)

        const interval = setInterval(() => {
            const callTime = { ...this.callTime[callId] }
            const updatedTime = setupTime(callTime)
            this.setCallTime({
                callId,
                ...updatedTime
            })
        }, 1000)

        this.setTimeInterval(callId, interval)
    }

    public async setActiveRoom (roomId: number | undefined) {
        const oldRoomId = this.currentActiveRoomId

        if (roomId === oldRoomId) {
            return
        }

        this.currentActiveRoomId = roomId

        await this.roomReconfigure(oldRoomId)
        await this.roomReconfigure(roomId)
    }

    private getNewRoomId () {
        const roomIdList = Object.keys(this.activeRooms)

        if (roomIdList.length === 0) {
            return 1
        }

        return (parseInt(roomIdList.sort()[roomIdList.length - 1]) + 1)
    }*/

    public subscribe (type: string, listener: (c: RTCSessionExtended) => void) {
        const isListenerEmpty = !this.listenersList[type] || !this.listenersList[type].length
        const newListeners = isListenerEmpty? [ listener ]: [ ...this.listenersList[type], listener ]

        this.listenersList = {
            ...this.listenersList,
            [type]: newListeners
        }
    }

    public removeIListener (value: string) {
        const listenersCopy = { ...this.listenersList }
        delete listenersCopy[value]

        this.listenersList = {
            ...listenersCopy,
        }
    }

    /*private async setupCall (event: RTCSessionEvent) {
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
                    this.startCallTimer(session.id)
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
            this.startCallTimer(session.id)
        }

        const call = session as ICall

        const autoAnswerByHeaders = this.hasAutoAnswerHeaders(event)

        const doAutoAnswer = call.direction === 'incoming' && !this.hasActiveCalls && (autoAnswerByHeaders || this.autoAnswer)

        call.roomId = roomId
        call.localMuted = false
        call.autoAnswer = doAutoAnswer

        if (doAutoAnswer) {
            this.addCall(call, false)
        } else {
            this.addCall(call)
        }

        // this.addCall(call)
        this.addCallStatus(session.id)
        this.addRoom(newRoomInfo)

        if (doAutoAnswer) {
            this.answerCall(call._id)
        }
    }*/

    public triggerListener ({ listenerType, session, event }: TriggerListenerOptions) {
        const listeners = this.listenersList[listenerType]

        if (!listeners || !listeners.length) {
            return
        }

        listeners.forEach((listener) => {
            listener(session, event)
        })
    }


    /*private removeCall (value: string) {
        const stateActiveCallsCopy = { ...this.activeCalls }
        delete stateActiveCallsCopy[value]

        this.activeCalls = {
            ...stateActiveCallsCopy,
        }

        const stateExtendedCallsCopy = { ...this.extendedCalls }
        delete stateExtendedCallsCopy[value]
        this.extendedCalls = {
            ...stateExtendedCallsCopy,
        }

        this.emit('changeActiveCalls', this.activeCalls)
    }*/

    /*private activeCallListRemove (call: ICall) {
        const session = this.extendedCalls[call._id]
        this.stopVUMeter('origin')

        // TODO: try without it
        session.connection.getSenders().forEach((sender) => {
            sender.track.stop()
        })

        const callRoomIdToConfigure = session.roomId
        this.removeCall(call._id)
        this.roomReconfigure(callRoomIdToConfigure)
    }*/

    /*private async newRTCSessionCallback (event: RTCSessionEvent) {
        const session = event.session as RTCSessionExtended

        if (this.isDND) {
            session.terminate({
                status_code: 486,
                reason_phrase: 'Do Not Disturb'
            })
            return
        }

        // stop timers on ended and failed
        session.on('ended', (event) => {
            this.stopVUMeter(session.id)
            this.logger.log('Session ended for', session._remote_identity?._uri?._user)
            this.triggerListener({
                listenerType: CALL_EVENT_LISTENER_TYPE.CALL_ENDED,
                session,
                event
            })
            const s = this.getActiveCalls[session.id]

            if (s) {
                this.activeCallListRemove(s)
            }

            this.stopCallTimer(session.id)
            this.removeCallStatus(session.id)
            this.removeCallMetrics(session.id)

            if (!Object.keys(this.extendedCalls).length) {
                this.setIsMuted(false)
                this.initialStreamValue.getTracks().forEach((track) => track.stop())
                this.initialStreamValue = null
            }
        })
        session.on('progress', (event: IncomingEvent | OutgoingEvent) => {
            this.logger.log('Session in progress for', session._remote_identity?._uri?._user)
            this.triggerListener({
                listenerType: CALL_EVENT_LISTENER_TYPE.CALL_PROGRESS,
                session,
                event
            })
        })
        session.on('failed', (event) => {
            this.stopVUMeter(session.id)
            this.logger.log('Session failed for', session._remote_identity?._uri?._user)
            this.triggerListener({
                listenerType: CALL_EVENT_LISTENER_TYPE.CALL_FAILED,
                session,
                event
            })

            if (session.id === this.callAddingInProgress) {
                this.callAddingInProgress = undefined
            }

            const s = this.getActiveCalls[session.id]

            if (s) {
                this.activeCallListRemove(s)
            }

            this.stopCallTimer(session.id)
            this.removeCallStatus(session.id)
            this.removeCallMetrics(session.id)

            if (!Object.keys(this.extendedCalls).length) {
                this.setIsMuted(false)
                this.initialStreamValue.getTracks().forEach((track) => track.stop())
                this.initialStreamValue = null
            }
        })
        session.on('confirmed', (event: IncomingAckEvent | OutgoingAckEvent) => {
            this.logger.log('Session confirmed for', session._remote_identity?._uri?._user)
            this.triggerListener({
                listenerType: CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED,
                session,
                event
            })
            this.updateCall(session as ICall)

            if (session.id === this.callAddingInProgress) {
                this.callAddingInProgress = undefined
            }
        })

        await this.setupCall(event)

        if (session.direction === 'outgoing') {
            const roomId = this.getActiveCalls[session.id].roomId
            this.setActiveRoom(roomId)
        }
    }*/

    private setInitialized (value: boolean) {
        this.initialized = value
        this.emit('ready', value)
    }

    /*public setMuteWhenJoin (value: boolean) {
        this.muteWhenJoinEnabled = value
        this.emit('changeMuteWhenJoin', value)
    }

    public setMicrophoneSensitivity (value: number) {
        if (value < 0 || value > 1) {
            throw new Error('Value should be in range from 0 to 1!')
        }
        this.microphoneInputLevelValue = value
        this.roomReconfigure(this.currentActiveRoomId)
    }

    public setSpeakerVolume (value: number) {
        this.speakerVolumeValue = value

        Object.values(this.extendedCalls).forEach((call) => {
            if (call.audioTag) {
                call.audioTag.volume = value
                this.updateCall(call)
            }
        })
    }

    public setAutoAnswer (value: boolean) {
        this.isAutoAnswer = value
    }

    private setSelectedInputDevice (deviceId: string) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_INPUT_DEVICE, deviceId)

        this.selectedMediaDevices.input = deviceId
        this.emit('changeActiveInputMediaDevice', deviceId)
    }

    private setSelectedOutputDevice (deviceId: string) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_OUTPUT_DEVICE, deviceId)

        this.selectedMediaDevices.output = deviceId
        this.emit('changeActiveOutputMediaDevice', deviceId)
    }*/

    /*private setCallMetrics (value: any) {
        const metrics = { ...value }
        delete metrics['callId']

        this.callMetrics = {
            ...this.callMetrics,
            [value.callId]: metrics
        }

        this.emit('changeCallMetrics', this.callMetrics)
    }

    private removeCallMetrics (callId: string) {
        const callMetricsCopy = { ...this.callMetrics }
        delete callMetricsCopy[callId]

        this.callMetrics = {
            ...callMetricsCopy,
        }

        this.emit('changeCallMetrics', this.callMetrics)
    }

    private getCallQuality (call: ICall) {
        const metrics = new WebRTCMetrics(this.metricConfig)
        const probe = metrics.createProbe(call.connection, {
            cid: call._id
        })

        const inboundKeys: Array<string> = []
        let inboundAudio: string
        probe.onreport = (probe: Probe) => {
            Object.entries(probe.audio).forEach(([ key, value ]) => {
                if (value.direction === 'inbound' && !inboundKeys.includes(key)) {
                    inboundKeys.push(key)
                    inboundAudio = key
                }
            })

            const inboundAudioMetric = probe.audio[inboundAudio] as ProbeMetricInType
            const metric: MetricAudioData = filterObjectKeys(inboundAudioMetric, METRIC_KEYS_TO_INCLUDE)
            metric.callId = call._id
            this.setCallMetrics(metrics)
        }

        this.subscribe(CALL_EVENT_LISTENER_TYPE.CALL_ENDED, (session) => {
            if (session._id === call._id) {
                metrics.stopAllProbes()
            }
        })

        metrics.startAllProbes()
    }

    private setupVUMeter (stream: MediaStream, deviceId: string) {
        this.VUMeter.start(stream, deviceId)
    }

    private stopVUMeter (deviceId: string) {
        this.VUMeter.stop(deviceId)
    }

    async setupStream () {
        const stream = await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)

        if (this.initialStreamValue) {
            this.initialStreamValue.getTracks().forEach((track) => track.stop())
            this.initialStreamValue = null
        }
        this.initialStreamValue = stream
    }

    private async triggerAddStream (event: MediaEvent, call: ICall) {
        this.setIsMuted(this.muteWhenJoin || this.isMuted)

        if (!this.initialStreamValue) {
            await this.setupStream()
        }

        const processedStream = processAudioVolume(this.initialStreamValue, this.microphoneInputLevel * 2)
        const muteMicro = this.isMuted || this.muteWhenJoin

        processedStream.getTracks().forEach(track => track.enabled = !muteMicro)
        this.setActiveStream(processedStream)
        await call.connection.getSenders()[0].replaceTrack(processedStream.getTracks()[0])

        syncStream(event, call, this.selectedOutputDevice, this.speakerVolume)
        this.setupVUMeter(event.stream, call._id)
        this.getCallQuality(call)
        this.updateCall(call)
    }

    //@requireInitialization()
    public initCall (target: string, addToCurrentRoom: boolean) {
        //this.checkInitialized()

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
            this.processRoomChange({
                callId: call.id,
                roomId: this.currentActiveRoomId
            })
        }

        call.connection.addEventListener('addstream', (event: Event) => {
            this.triggerAddStream(event as MediaEvent, call as ICall)
        })
    }*/

    /*private async processRoomChange ({ callId, roomId }: { callId: string, roomId: number }) {
        const oldRoomId = this.extendedCalls[callId].roomId

        this.extendedCalls[callId].roomId = roomId

        const call = this.extendedCalls[callId]
        this.updateCall(call)

        await this.setActiveRoom(roomId)

        return Promise.all([
            this.roomReconfigure(oldRoomId),
            this.roomReconfigure(roomId)
        ]).then(() => {
            this.deleteRoomIfEmpty(oldRoomId)
            this.deleteRoomIfEmpty(roomId)
        })
    }*/
}

export default OpenSIPSJS
