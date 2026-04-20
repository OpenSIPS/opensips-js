import {
    ICall,
    ICallStatus,
    ICallStatusUpdate,
    IntervalType,
    IRoom,
    IRoomUpdate,
    RTCSessionExtended,
    VADSessionState,
    NoiseReductionOptions,
    NoiseReductionOptionsWithoutVadModule
} from '@/types/rtc'
import { CallTime, ITimeData, TempTimeData } from '@/types/timer'
import { setupTime } from '@/helpers/time.helper'
import { createVADControlledStream, computeRMS } from '@/helpers/vad.helper'
import {
    MediaDeviceType,
    MetricAudioData,
    Probe,
    ProbeMetricInType,
    WebrtcMetricsConfigType
} from '@/types/webrtcmetrics'
import { isMobile, processAudioVolume, simplifyCallObject, syncStream } from '@/helpers/audio.helper'
import { RTCSessionEvent } from 'jssip/lib/UA'
import { forEach } from 'p-iteration'
import { CALL_EVENT_LISTENER_TYPE } from '@/enum/call.event.listener.type'
import { SIP_STATUS_CODE } from '@/enum/sip.status.code'
import { IncomingAckEvent, IncomingEvent, OutgoingAckEvent, OutgoingEvent } from 'jssip/lib/RTCSession'
import WebRTCMetrics from '@/helpers/webrtcmetrics/metrics'
import { filterObjectKeys } from '@/helpers/filter.helper'
import { METRIC_KEYS_TO_INCLUDE } from '@/enum/metric.keys.to.include'
import vadDefaultConfig from '@/enum/vad.default.config'
import VUMeter from '@/helpers/VUMeter'
import OpenSIPSJS from '@/index'
import ManagedAudioContext from '@/helpers/audioContext'

const STORAGE_KEYS = {
    SELECTED_INPUT_DEVICE: 'OpensipsJSInputDevice',
    SELECTED_OUTPUT_DEVICE: 'OpensipsJSOutputDevice'
}
const CALL_STATUS_UNANSWERED = 0

function connectTrackToStream (stream: MediaStream, additionalTrack: MediaStreamTrack) {
    const ctx = new AudioContext()

    const source1 = ctx.createMediaStreamSource(stream)
    const source2 = ctx.createMediaStreamSource(
        new MediaStream([ additionalTrack ])
    )

    const destination = ctx.createMediaStreamDestination()

    source1.connect(destination)
    source2.connect(destination)

    // destination.stream already contains exactly ONE mixed audio track
    return destination.stream
}

export class AudioModule {
    private context: OpenSIPSJS
    private currentActiveRoomIdValue: number | undefined
    private isAutoAnswer = false
    private isCallAddingInProgress: string | undefined
    private muteWhenJoinEnabled = false
    private isDNDEnabled = false
    // If false - all incoming calls will be rejected when busy
    private isCallWaitingEnabled = true
    private muted = false

    private microphoneInputLevelValue = 1 // [0;1]
    private speakerVolumeValue = 1 // [0;1]

    private activeRooms: { [key: number]: IRoom } = {}
    private activeCalls: { [key: string]: ICall } = {}
    private extendedCalls: { [key: string]: ICall } = {}

    private conferenceNodes: {
        [roomId: number]: {
            sources: Map<string, MediaStreamAudioSourceNode>
            destinations: Map<string, MediaStreamAudioDestinationNode>
            gains: Map<string, GainNode>
        }
    } = {}

    private availableMediaDevices: Array<MediaDeviceInfo> = []
    private selectedMediaDevices: { [key in MediaDeviceType]: string } = {
        input: 'default',
        output: 'default'
    }

    private callStatus: { [key: string]: ICallStatus } = {}
    private callTime: CallTime = {}
    private callMetrics: { [key: string]: any } = {}
    private timeIntervals: { [key: string]: IntervalType } = {}
    private metricConfig: WebrtcMetricsConfigType = {
        refreshEvery: 1000
    }

    private activeStreamValue: MediaStream | null = null
    private initialStreamValue: MediaStream | null = null

    private noiseReduction: NoiseReductionOptions
    private vadSession: any = null
    private vadSessionState: VADSessionState = {
        currentMode: 'clean',
        isSpeaking: false
    }
    private vadInterval: ReturnType<typeof setInterval> = null
    private vadMrsInterval: ReturnType<typeof setInterval>  = null
    private vadSessionGeneration = 0
    // TODO: Conference health check - uncomment if needed for automatic track state monitoring
    // private conferenceHealthCheckIntervals: Record<number, ReturnType<typeof setInterval>> = {}

    // Store ringback tone timers and audio contexts per session
    private ringbackTimers: { [sessionId: string]: ReturnType<typeof setTimeout> } = {}
    private ringbackAudioContexts: { [sessionId: string]: { context: AudioContext, oscillator1: OscillatorNode, oscillator2: OscillatorNode, gainNode: GainNode, intervalId?: ReturnType<typeof setInterval> } } = {}
    private ringbackSessionProgressReceived: { [sessionId: string]: boolean } = {}

    private hangupBeepContext: { context: AudioContext, oscillator: OscillatorNode, gainNode: GainNode } | null = null

    private VUMeter: VUMeter
    private MicVAD: any

    public managedAudioContext = new ManagedAudioContext()

    constructor (context: OpenSIPSJS) {
        this.context = context

        this.context.on(
            this.context.newRTCSessionEventName,
            this.newRTCSessionCallback.bind(this)
        )

        this.VUMeter = new VUMeter({
            onChangeFunction: this.emitVolumeChange.bind(this)
        })

        this.initializeMediaDevices()

        this.processVADConfiguration(this.context.options.configuration?.noiseReductionOptions || {})
        this.setupVADInstance()
    }

    public setVADConfiguration (options: Partial<NoiseReductionOptionsWithoutVadModule>) {
        if (!this.MicVAD) {
            throw new Error('VAD module is not provided in the initial configuration')
        }

        const iterationKeys = Object.keys(options)
        for (const key of iterationKeys) {
            this.noiseReduction[key] = options[key]
        }

        if (this.hasActiveCalls) {
            this.roomReconfigure(this.currentActiveRoomId)
        }
    }

    private setupVADInstance () {
        const vadModule = this.context.options.configuration?.noiseReductionOptions?.vadModule
        if (vadModule && vadModule.MicVAD) {
            this.MicVAD = vadModule.MicVAD
            console.log('✅ VAD module loaded successfully')
        } else if (this.noiseReduction.mode !== 'disabled') {
            console.warn('⚠️ Noise reduction is enabled but VAD module is not provided. To use VAD features, please install @ricky0123/vad-web and pass it via configuration.noiseReductionOptions.vadModule option.')
            // Disable noise reduction if VAD is not available
            this.noiseReduction.mode = 'disabled'
        }
    }

    private processVADConfiguration (options: Partial<NoiseReductionOptions>) {
        this.noiseReduction = {
            mode: options.mode || 'disabled',
            checkEveryMs: options.checkEveryMs || 500,
            noiseCheckInterval: options.noiseCheckInterval || 2000,
            noiseThreshold: options.noiseThreshold || 0.004,
            vadConfig: options.vadConfig || {},
            baseAssetPath: options.baseAssetPath || 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.28/dist/',
            onnxWASMBasePath: options.onnxWASMBasePath || 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/'
        }
    }

    public get sipOptions () {
        const options = {
            ...this.context.options.sipOptions,
            mediaConstraints: this.getUserMediaConstraints
        }

        return options
    }

    /*public begin () {
        if (this.context.isConnected()) {
            console.error('Connection is already established')
            return
        }

        this.context.on(
            this.context.registeredEventName,
            () => {
                this.context.logger.log('Successfully registered to', this.context.options.socketInterfaces[0])
                this.context.setInitialized(true)
            }
        )

        this.context.on(
            this.context.unregisteredEventName,
            () => {
                this.context.logger.log('Unregistered from', this.context.options.socketInterfaces[0])
                this.context.setInitialized(false)
            }
        )

        this.context.on(
            this.context.newRTCSessionEventName,
            this.newRTCSessionCallback.bind(this)
        )

        this.context.on(
            this.context.connectedEventName,
            () => {
                this.context.logger.log('Connected to', this.context.options.socketInterfaces[0])
                this.context.isReconnecting = false
            }
        )

        this.context.on(
            this.context.disconnectedEventName,
            () => {
                if (this.context.isReconnecting) {
                    return
                }
                this.context.logger.log('Disconnected from', this.context.options.socketInterfaces[0])
                this.context.logger.log('Reconnecting to', this.context.options.socketInterfaces[0])
                this.context.isReconnecting = true
                this.context.stop()
                this.context.setInitialized(false)
                setTimeout(this.context.start.bind(this.context), 5000)
            }
        )

        this.context.on(
            this.context.newMSRPSessionEventName,
            this.context.newMSRPSessionCallback.bind(this.context)
        )

        this.context.logger.log('Connecting to', this.context.options.socketInterfaces[0])
        this.context.start()

        this.initializeMediaDevices()

        return this.context
    }*/

    public get currentActiveRoomId () {
        return this.currentActiveRoomIdValue
    }
    private set currentActiveRoomId (roomId: number | undefined) {
        this.currentActiveRoomIdValue = roomId
        this.context.emit('currentActiveRoomChanged', roomId)
    }

    public get autoAnswer () {
        return this.isAutoAnswer
    }

    public get callAddingInProgress () {
        return this.isCallAddingInProgress
    }
    private set callAddingInProgress (value: string | undefined) {
        this.isCallAddingInProgress = value
        this.context.emit('callAddingInProgressChanged', value)
    }

    public get muteWhenJoin () {
        return this.muteWhenJoinEnabled
    }

    public get isDND () {
        return this.isDNDEnabled
    }

    /**
     * Gets the current state of the call waiting feature.
     *
     * When call waiting is enabled (true), incoming calls will be allowed even when
     * other calls are active.
     *
     * When call waiting is disabled (false) and there are already active calls,
     * any new incoming calls will be automatically rejected with a "busy" status.
     *
     * @returns {boolean} True if call waiting is enabled, false if disabled
     */
    public get isCallWaiting (): boolean {
        return this.isCallWaitingEnabled
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
    }

    public get hasActiveAnsweredCalls () {
        const rooms = Object.values(this.activeRooms)
        const answeredSessions = rooms.filter((room) => !room.incomingInProgress)

        return answeredSessions.length > 0
    }

    public get getActiveRooms () {
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
        if (isMobile()) {
            return {
                video: false,
                audio: true
            }
        }

        return {
            audio: {
                deviceId: {
                    exact: this.selectedMediaDevices.input
                },
                echoCancellation: true,
                echoCancellationType: 'system',
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,
                latency: 0.01
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
        this.context.emit('changeAvailableDeviceList', devices)
    }

    public async updateDeviceList () {
        await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
        const devices = await navigator.mediaDevices.enumerateDevices()

        this.setAvailableMediaDevices(devices)
    }

    private async initializeMediaDevices () {
        const initialInputDevice = localStorage.getItem(STORAGE_KEYS.SELECTED_INPUT_DEVICE) || 'default'
        const initialOutputDevice = localStorage.getItem(STORAGE_KEYS.SELECTED_OUTPUT_DEVICE) || 'default'

        try {
            // Ask input media permissions
            const stream = await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
            const devices = await navigator.mediaDevices.enumerateDevices()

            this.setAvailableMediaDevices(devices)

            await this.setMicrophone(initialInputDevice)
            await this.setSpeaker(initialOutputDevice)

            navigator.mediaDevices.addEventListener('devicechange', async () => {
                const newDevices = await navigator.mediaDevices.enumerateDevices()
                this.setAvailableMediaDevices(newDevices)
            })

            stream.getTracks().forEach(track => track.stop())
        } catch (err) {
            console.error(err)
        }

    }

    private async cleanupConferenceNodes (roomId: number) {
        // TODO: Conference health check - uncomment if needed
        // this.stopConferenceHealthCheck(roomId)
        const nodes = this.conferenceNodes[roomId]

        if (!nodes) {
            return
        }

        // Disconnect all nodes with error handling
        let disconnectedSources = 0
        nodes.sources.forEach((source, key) => {
            try {
                source.disconnect()
                disconnectedSources++
            } catch (error) {
                console.error(`[cleanupConferenceNodes] Error disconnecting source ${key}:`, error)
                this.context.logger?.error(`[cleanupConferenceNodes] Error disconnecting source ${key}:`, error)
            }
        })

        let disconnectedDestinations = 0
        nodes.destinations.forEach((dest, key) => {
            try {
                dest.disconnect()
                disconnectedDestinations++
            } catch (error) {
                console.error(`[cleanupConferenceNodes] Error disconnecting destination ${key}:`, error)
                this.context.logger?.error(`[cleanupConferenceNodes] Error disconnecting destination ${key}:`, error)
            }
        })

        let disconnectedGains = 0
        nodes.gains.forEach((gain, key) => {
            try {
                gain.disconnect()
                disconnectedGains++
            } catch (error) {
                console.error(`[cleanupConferenceNodes] Error disconnecting gain ${key}:`, error)
                this.context.logger?.error(`[cleanupConferenceNodes] Error disconnecting gain ${key}:`, error)
            }
        })

        delete this.conferenceNodes[roomId]
    }

    public setCallTime (value: ITimeData) {
        const time: TempTimeData = { ...value }
        delete time.callId

        this.callTime = {
            ...this.callTime,
            [value.callId]: time
        }

        this.context.emit('changeCallTime', this.callTime)
    }

    public removeCallTime (callId: string) {
        const callTimeCopy = { ...this.callTime }
        delete callTimeCopy[callId]

        this.callTime = {
            ...callTimeCopy,
        }

        this.context.emit('changeCallTime', this.callTime)
    }

    private setTimeInterval (callId: string, interval: IntervalType) {
        this.timeIntervals = {
            ...this.timeIntervals,
            [callId]: interval
        }
    }

    private removeTimeInterval (callId: string) {
        const timeIntervalsCopy = { ...this.timeIntervals }

        if (!timeIntervalsCopy[callId]) {
            return
        }

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
        this.context.emit('changeCallVolume', {
            callId,
            volume
        })
    }

    public getNoiseReductionMode () {
        return this.noiseReduction.mode
    }

    public setMetricsConfig (config: WebrtcMetricsConfigType)  {
        this.metricConfig = {
            ...this.metricConfig,
            ...config
        }
    }

    public sendDTMF (callId: string, value: string) {
        const validation_regex = /^[A-D0-9*#]+$/g
        if (!validation_regex.test(value)) {
            throw new Error('Not allowed character used in the DTMF input')
        }

        const call = this.extendedCalls[callId]
        call.sendDTMF(value)
    }

    private setIsMuted (value: boolean) {
        this.muted = value
        this.context.emit('changeIsMuted', value)
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
        if (!call) return

        call._automaticHold = automatic ?? false

        const holdPromise = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Hold operation timeout'))
            }, 5000)

            const handleComplete = () => {
                clearTimeout(timeout)
                call.putOnHoldTimestamp = toHold ? Date.now() : undefined
                resolve()
            }

            const handleError = (error: any) => {
                clearTimeout(timeout)
                reject(error)
            }

            try {
                if (toHold) {
                    this.stopSessionVad()
                    call.hold({}, handleComplete)
                } else {
                    call.unhold({}, handleComplete)
                }
            } catch (error) {
                handleError(error)
            }
        })

        try {
            await holdPromise
            this.updateCall(call)

            const callsInRoom = Object.values(this.extendedCalls).filter(c =>
                c.roomId === call.roomId && (toHold ? callId !== c._id : true)
            )

            if (callsInRoom.length > 1) {
                await this.doConference(callsInRoom)
            }
        } catch (error) {
            console.error('Hold operation failed:', error)
            throw error
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

        call.connection.addEventListener('track', (event: RTCTrackEvent) => {
            this.triggerAddStream(event, call)
        })
    }

    public async moveCall (callId: string, roomId: number) {
        this.updateCallStatus({
            callId,
            isMoving: true
        })

        /*const callsInRoom = Object.values(this.extendedCalls).filter(call => call._id === callId)

        callsInRoom.forEach((call, index) => {
            call.audioTag.muted = true
        })*/

        /*const newRoomId = this.getNewRoomId()

        const newRoomInfo: IRoom = {
            started: new Date(),
            incomingInProgress: false,
            roomId: newRoomId
        }
        this.addRoom(newRoomInfo)*/

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
        this.context.emit('changeActiveCalls', this.activeCalls)
    }

    public updateRoom (value: IRoomUpdate) {
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

        this.context.emit('updateRoom', {
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

        /*this.extendedCalls = {
            ...this.extendedCalls,
            [value._id]: value
        }*/

        this.extendedCalls[value._id] = value

        if (emitEvent) {
            this.context.emit('changeActiveCalls', this.activeCalls)
        }
    }

    private addCallStatus (callId: string) {
        this.callStatus = {
            ...this.callStatus,
            [callId]: {
                isMoving: false,
                isTransferring: false,
                isMerging: false,
                isTransferred: false
            }
        }

        this.context.emit('changeCallStatus', this.callStatus)
    }

    private updateCallStatus (value: ICallStatusUpdate) {
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

        if (value.isTransferred !== undefined) {
            newStatus.isTransferred = value.isTransferred
        }

        this.callStatus = {
            ...this.callStatus,
            [value.callId]: {
                ...newStatus
            }
        }

        this.context.emit('changeCallStatus', this.callStatus)
    }

    private removeCallStatus (callId: string) {
        const callStatusCopy = { ...this.callStatus }
        delete callStatusCopy[callId]

        this.callStatus = {
            ...callStatusCopy,
        }

        this.context.emit('changeCallStatus', this.callStatus)
    }

    private addRoom (value: IRoom) {
        this.activeRooms = {
            ...this.activeRooms,
            [value.roomId]: value
        }

        this.context.emit('addRoom', {
            room: value,
            roomList: this.activeRooms
        })
    }

    private async setupActiveStream () {
        const processedStream = await processAudioVolume(await this.managedAudioContext.getContext(), this.initialStreamValue, this.microphoneInputLevel * 2)
        processedStream.getTracks().forEach(track => track.enabled = !this.isMuted)
        await this.setActiveStream(processedStream)
    }

    private async getActiveStream () {
        const processedStream = await processAudioVolume(await this.managedAudioContext.getContext(), this.initialStreamValue, this.microphoneInputLevel * 2)
        processedStream.getTracks().forEach(track => track.enabled = !this.isMuted)
        await this.setActiveStream(processedStream)
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
                await this.setupActiveStream()
                const processedStream = this.activeStream
                call.connection.getSenders()[0].replaceTrack(processedStream.getTracks()[0])
                this.updateCall(call)
            })
        } else {
            await this.doConference(callsInCurrentRoom)
        }
    }

    private async setActiveStream (value: MediaStream) {
        if (this.activeStream) {
            this.stopVUMeter('origin')
        }

        await this.setupVUMeter(value, 'origin')

        this.activeStreamValue = value
        this.context.emit('changeActiveStream', value)
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

        this.context.emit('removeRoom', {
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
        if (!this.context.initialized) {
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

    /**
     * Monitors background noise while user is not speaking.
     * Calls `onNoiseDetected()` or `onNoiseStop()` when mode should switch.
     */
    private async startNoiseMonitor ({
        stream,
        onNoiseDetected,
        onNoiseStop,
    }: {
        stream: MediaStream;
        onNoiseDetected: () => void;
        onNoiseStop: () => void;
    }) {
        let ctx: AudioContext
        try {
            ctx = await this.managedAudioContext.getContext()
        } catch (error) {
            console.error('[startNoiseMonitor] Failed to get AudioContext:', error)
            this.context.logger?.error('[startNoiseMonitor] Failed to get AudioContext:', error)
            return
        }

        let source: MediaStreamAudioSourceNode
        let analyser: AnalyserNode
        try {
            source = ctx.createMediaStreamSource(stream.clone())
            analyser = ctx.createAnalyser()
        } catch (error) {
            console.error('[startNoiseMonitor] Failed to create audio nodes:', error)
            console.error('[startNoiseMonitor] AudioContext state:', ctx.state)
            this.context.logger?.error('[startNoiseMonitor] Failed to create audio nodes:', error)
            this.context.logger?.error('[startNoiseMonitor] AudioContext state:', ctx.state)
            return
        }
        analyser.fftSize = 1024
        const buf = new Float32Array(analyser.fftSize)
        source.connect(analyser)

        const rmsHistory: number[] = []

        if (this.vadInterval) {
            clearInterval(this.vadInterval)
            this.vadInterval = null
        }

        if (this.vadMrsInterval) {
            clearInterval(this.vadMrsInterval)
            this.vadMrsInterval = null
        }

        this.vadMrsInterval = setInterval(() => {
            analyser.getFloatTimeDomainData(buf)
            const rms = computeRMS(buf)
            rmsHistory.push(rms)

            const maxSamples = Math.ceil(
                this.noiseReduction.noiseCheckInterval / this.noiseReduction.checkEveryMs
            )
            if (rmsHistory.length > maxSamples) rmsHistory.shift()
        }, this.noiseReduction.checkEveryMs)

        this.vadInterval = setInterval(() => {
            if (rmsHistory.length === 0) return

            const avgRms =
                rmsHistory.reduce((a, b) => a + b, 0) / rmsHistory.length

            const state = this.vadSessionState

            if (!state) {
                console.warn('[startNoiseMonitor] State not found, stopping interval')
                this.context.logger?.warn('[startNoiseMonitor] State not found, stopping interval')
                if (this.vadInterval) {
                    clearInterval(this.vadInterval)
                    this.vadInterval = null
                }
                if (this.vadMrsInterval) {
                    clearInterval(this.vadMrsInterval)
                    this.vadMrsInterval = null
                }
                return
            }

            const isNoisy = avgRms > this.noiseReduction.noiseThreshold

            if (!state.isSpeaking) {
                if (isNoisy && state.currentMode === 'clean') {
                    state.currentMode = 'noisy'
                    console.log('Average noise high → enable VAD')
                    this.context.emit('changeNoiseReductionState',  true)
                    onNoiseDetected()
                } else if (!isNoisy && state.currentMode === 'noisy') {
                    state.currentMode = 'clean'
                    console.log('Average noise low → disable VAD')
                    this.context.emit('changeNoiseReductionState', false)
                    onNoiseStop()
                }
            }
        }, this.noiseReduction.noiseCheckInterval)
    }

    private async processVADForActiveStream (vadTracksToPopulate = {}) {
        const stream = this.activeStream
        this.stopSessionVad()

        const currentGeneration = this.vadSessionGeneration
        const isStale = () => currentGeneration !== this.vadSessionGeneration

        this.vadSessionState = {
            currentMode: 'clean',
            isSpeaking: false
        }

        const audioContext = await this.managedAudioContext.getContext()
        if (isStale()) {
            return
        }

        const vadControlled = await createVADControlledStream(stream, audioContext, 150)
        if (isStale()) {
            return
        }

        let isFirstFrameProcessed = false

        const callsInCurrentRoom = Object.values(this.extendedCalls)
            .filter((session) => session.roomId === this.currentActiveRoomId)

        const vadSession = await this.MicVAD.new({
            getStream: () => new Promise((res) => res(stream)),
            pauseStream: async () => { /* no-op: prevent MicVAD from stopping our processed stream tracks */ },
            resumeStream: async (_stream) => _stream,
            ...vadDefaultConfig,
            ...this.noiseReduction.vadConfig,
            baseAssetPath: this.noiseReduction.baseAssetPath,
            onnxWASMBasePath: this.noiseReduction.onnxWASMBasePath,
            onFrameProcessed: () => {
                if (isStale()) return

                if (!isFirstFrameProcessed) {
                    isFirstFrameProcessed = true
                    console.log('✅ VAD initialized, starting background noise monitoring')

                    if (this.noiseReduction.mode === 'enabled') {
                        if (vadTracksToPopulate && Object.keys(vadTracksToPopulate).length) {
                            Object.keys(vadTracksToPopulate).forEach((sessionId) => {
                                const session = this.extendedCalls[sessionId]
                                if (!session) return

                                if (session.connection.getSenders()[0]) {
                                    const streamToSend =
                                        connectTrackToStream(vadControlled.stream, vadTracksToPopulate[sessionId])
                                    session.connection.getSenders()[0].replaceTrack(streamToSend.getAudioTracks()[0])
                                }
                            })
                        } else {
                            const session = callsInCurrentRoom[0]
                            const sender = session?.connection?.getSenders()[0]
                            const vadTrack = vadControlled.stream.getAudioTracks()[0]
                            if (sender) {
                                sender.replaceTrack(vadTrack)
                            }
                        }

                        return
                    }

                    if (!this.vadSessionState) {
                        console.error('[processVAD] CRITICAL: State not found')
                        this.context.logger?.error('[processVAD] CRITICAL: State not found')
                        return
                    }

                    // Start noise monitor asynchronously (don't await to avoid blocking callback)
                    this.startNoiseMonitor({
                        stream,
                        onNoiseDetected: async () => {
                            console.log('[processVad] - Replace track with Vad Controlled')
                            this.context.logger?.log('[processVad] - Replace track with Vad Controlled')

                            if (vadTracksToPopulate && Object.keys(vadTracksToPopulate).length) {
                                Object.keys(vadTracksToPopulate).forEach((sessionId) => {
                                    const session = this.extendedCalls[sessionId]
                                    if (!session) return

                                    if (session.connection.getSenders()[0]) {
                                        const streamToSend =
                                            connectTrackToStream(vadControlled.stream, vadTracksToPopulate[sessionId])
                                        session.connection.getSenders()[0].replaceTrack(streamToSend.getAudioTracks()[0])
                                    }
                                })
                            } else {
                                const session = callsInCurrentRoom[0]
                                if (session.connection.getSenders()[0]) {
                                    session.connection.getSenders()[0].replaceTrack(vadControlled.stream.getAudioTracks()[0])
                                }
                            }

                            /*await session.connection.getSenders()[0]
                                ?.replaceTrack(vadControlled.stream.getAudioTracks()[0])*/
                        },
                        onNoiseStop: async () => {
                            console.log('Replace track with Original')

                            if (vadTracksToPopulate && Object.keys(vadTracksToPopulate).length) {
                                Object.keys(vadTracksToPopulate).forEach((sessionId) => {
                                    const session = this.extendedCalls[sessionId]
                                    if (!session) return

                                    const sender = session.connection.getSenders()[0]

                                    if (
                                        sender &&
                                        sender.track &&
                                        sender.transport &&
                                        sender.transport.state !== 'closed' &&
                                        sender.transport.state !== 'failed'
                                    ) {
                                        const streamToSend =
                                                connectTrackToStream(stream, vadTracksToPopulate[sessionId])
                                        sender.replaceTrack(streamToSend.getAudioTracks()[0])
                                    }
                                })
                            } else {
                                const sender = callsInCurrentRoom[0].connection.getSenders()[0]

                                if (
                                    sender &&
                                    sender.track &&
                                    sender.transport &&
                                    sender.transport.state !== 'closed' &&
                                    sender.transport.state !== 'failed'
                                ) {
                                    sender.replaceTrack(stream.getAudioTracks()[0])
                                }
                            }

                            //await sender.replaceTrack(stream.getAudioTracks()[0])
                        },
                    })
                }
            },
            onSpeechStart: () => {
                if (isStale()) return

                console.log('🎤 Speech started')
                vadControlled.setSpeaking(true)

                /*if (this.noiseReduction.mode === 'enabled') {
                    session.connection.getSenders()[0]
                        ?.replaceTrack(vadControlled.stream.getAudioTracks()[0])
                }*/

                this.vadSessionState.isSpeaking = true
            },
            onSpeechEnd: () => {
                if (isStale()) return

                console.log('🛑 Speech end')
                vadControlled.setSpeaking(false)

                /*if (this.noiseReduction.mode === 'enabled') {
                    session.connection.getSenders()[0]
                        ?.replaceTrack(vadControlled.stream.getAudioTracks()[0])
                }*/

                this.vadSessionState.isSpeaking = false
            }
        })

        if (isStale()) {
            try {
                vadSession.pause()
            } catch (error) {
                this.context.logger?.error('[processVADForActiveStream] Error pausing stale vadSession:', error)
            }
            return
        }

        if (this.vadSession) {
            this.vadSession.pause()
            this.vadSession = null
        }

        this.vadSession = vadSession
        vadSession.start()
    }

    private stopSessionVad () {
        this.vadSessionGeneration++

        if (this.vadSession) {
            this.vadSession.pause()
            this.vadSession = null
        }

        if (this.vadInterval) {
            clearInterval(this.vadInterval)
            this.vadInterval = null
        }

        if (this.vadMrsInterval) {
            clearInterval(this.vadMrsInterval)
            this.vadMrsInterval = null
        }

        if (this.vadSessionState) {
            this.vadSessionState = {
                currentMode: 'clean',
                isSpeaking: false
            }

            this.context.emit('changeNoiseReductionState', false)
        }
    }

    private async roomReconfigure (roomId: number | undefined) {
        if (roomId === undefined) {
            return
        }

        const callsInRoom = Object.values(this.extendedCalls).filter(call => call.roomId === roomId)

        const isHostRoom = this.currentActiveRoomId === roomId

        console.log('[roomReconfigure] - Calls In Room:', callsInRoom)
        this.context.logger?.log('[roomReconfigure] - Calls In Room:', callsInRoom)
        callsInRoom.forEach((call, index) => {
            if (call.audioTag) {
                call.connection.getReceivers().forEach((receiver: RTCRtpReceiver) => {
                    receiver.track.enabled = !call.localMuted
                })

                // Only unmute if this is the host's current room
                if (isHostRoom) {
                    this.muteReconfigure(call)
                }

                const shouldMute = !isHostRoom
                call.audioTag.muted = shouldMute

                this.updateCall(call)
            }
        })

        // Clean up empty rooms
        if (callsInRoom.length === 0) {
            const hasConferenceNodes = !!this.conferenceNodes[roomId]

            if (hasConferenceNodes) {
                await this.cleanupConferenceNodes(roomId)
            }

            console.log('[roomReconfigure] - Delete empty room', roomId)
            this.context.logger?.log('[roomReconfigure] - Delete empty room', roomId)
            this.deleteRoomIfEmpty(roomId)
            return
        }

        // Single call in non-active room - put on hold
        if (callsInRoom.length === 1 && !isHostRoom) {
            const call = callsInRoom[0]

            const holdState = call.isOnHold()

            if (!holdState.local) {
                await this.holdCall(call._id, true)
            }

            // Clean up any conference nodes
            const hasConferenceNodes = !!this.conferenceNodes[roomId]
            if (hasConferenceNodes) {
                await this.cleanupConferenceNodes(roomId)
            }

            return
        }

        // Single call in active room - unhold if needed and set up direct audio
        if (callsInRoom.length === 1 && isHostRoom) {
            const call = callsInRoom[0]

            const holdState = call.isOnHold()

            if (holdState.local && call._automaticHold) {
                await this.unholdCall(call._id)
            }

            const senders = call.connection?.getSenders() || []
            const firstSender = senders[0]

            if (call.connection && firstSender) {
                try {
                    await this.setupActiveStream()
                    const processedStream = this.activeStream

                    if ([ 'enabled', 'dynamic' ].includes(this.noiseReduction.mode)) {
                        console.log('[roomReconfigure] - Call processVAD from roomReconfigure')
                        this.context.logger?.log('[roomReconfigure] - Call processVAD from roomReconfigure')
                        this.processVADForActiveStream()
                    }

                    const tracks = processedStream.getTracks()

                    await firstSender.replaceTrack(tracks[0])
                    this.muteReconfigure(call)
                } catch (error) {
                    console.error(error)
                }
            }

            // Clean up any conference nodes for single participant
            const hasConferenceNodes = !!this.conferenceNodes[roomId]
            if (hasConferenceNodes) {
                await this.cleanupConferenceNodes(roomId)
            }

            return
        }

        // Multiple calls - set up conference
        if (callsInRoom.length > 1) {
            await this.doConference(callsInRoom)
        }
    }

    private async doConference (sessions: Array<ICall>) {
        console.log('[doConference] - In doConference, sessions:', sessions)
        this.context.logger?.log('[doConference] - In doConference, sessions:', sessions)
        if (sessions.length === 0) {
            return
        }

        const roomId = sessions[0].roomId
        const isHostRoom = this.currentActiveRoomId === roomId

        // Validate all sessions have same room ID
        const roomMismatch = sessions.find(s => s.roomId !== roomId)
        if (roomMismatch) {
            return
        }

        // Check AudioContext state before proceeding
        let audioContext: AudioContext
        try {
            audioContext = await this.managedAudioContext.getContext()
        } catch (error) {
            console.error('[doConference] Failed to get AudioContext:', error)
            this.context.logger?.error('[doConference] Failed to get AudioContext:', error)
            return
        }

        const initialState = audioContext.state
        if (initialState !== 'running') {
            console.error(`[doConference] ERROR: AudioContext is not running! State: ${initialState}`)
            this.context.logger?.error(`[doConference] ERROR: AudioContext is not running! State: ${initialState}`)
            if (initialState === 'suspended' || initialState === 'interrupted') {
                try {
                    await audioContext.resume()
                    const newState = audioContext.state
                    if (newState !== 'running') {
                        console.error(`[doConference] Failed to resume AudioContext, state: ${newState}`)
                        this.context.logger?.error(`[doConference] Failed to resume AudioContext, state: ${newState}`)
                        return
                    }
                } catch (error) {
                    console.error('[doConference] Error resuming AudioContext:', error)
                    this.context.logger?.error('[doConference] Error resuming AudioContext:', error)
                    return
                }
            } else if (initialState === 'closed') {
                console.error('[doConference] AudioContext is closed, cannot proceed')
                this.context.logger?.error('[doConference] AudioContext is closed, cannot proceed')
                return
            } else {
                return
            }
        }

        // Clean up existing conference nodes for this room
        await this.cleanupConferenceNodes(roomId)

        // Initialize new conference nodes
        this.conferenceNodes[roomId] = {
            sources: new Map(),
            destinations: new Map(),
            gains: new Map()
        }
        const nodes = this.conferenceNodes[roomId]

        // Create a map of all receiver tracks
        const receiverTracks = new Map<string, MediaStreamTrack>()

        console.log('[doConference] - Before sessions forEach, sessions:', sessions)
        this.context.logger?.log('[doConference] - Before sessions forEach, sessions:', sessions)
        sessions.forEach((session, sessionIndex) => {
            console.log('[doConference] - In sessions forEach, iteration for', session._id)
            this.context.logger?.log('[doConference] - In sessions forEach, iteration for', session._id)
            if (session && session.connection) {
                const receivers = session.connection.getReceivers()

                console.log('[doConference] - Receivers list length for', session._id, receivers.length)
                this.context.logger?.log('[doConference] - Receivers list length for', session._id, receivers.length)

                receivers.forEach((receiver: RTCRtpReceiver, receiverIndex) => {
                    receiver.track.enabled = !session.localMuted
                    const trackId = receiver.track?.id
                    const readyState = receiver.track?.readyState
                    const kind = receiver.track?.kind
                    const trackKey = `${session._id}-${trackId}`

                    console.log('[doConference] - Gathering receiver tracks', session._id)
                    console.log('[doConference] - Receiver track readyState', receiver.track.readyState)
                    this.context.logger?.log('[doConference] - Gathering receiver tracks', session._id)
                    this.context.logger?.log('[doConference] - Receiver track readyState', receiver.track.readyState)
                    if (receiver.track && receiver.track.readyState === 'live') {
                        console.log('[doConference] - Gathered receiver track', session._id)
                        this.context.logger?.log('[doConference] - Gathered receiver track', session._id)
                        receiverTracks.set(trackKey, receiver.track)
                    }
                })
            } else {
                console.log('[doConference] - No session or RTC connection, session:', session)
                this.context.logger?.log('[doConference] - No session or RTC connection, session:', session)
            }
        })

        await this.setupActiveStream()

        const tracksForVadSessions = {}

        await forEach(sessions, async (session: ICall, sessionIndex) => {
            if (!session || !session.connection) {
                console.log('[doConference] - Return because of no session or connection, session:', session)
                this.context.logger?.log('[doConference] - Return because of no session or connection, session:', session)
                return
            }

            const mixedOutput = audioContext.createMediaStreamDestination()
            const othersOnlyOutput = audioContext.createMediaStreamDestination()
            nodes.destinations.set(session._id, mixedOutput)
            nodes.destinations.set(`${session._id}-others`, othersOnlyOutput)

            // Check if this session has any receiver tracks available
            const sessionReceivers = session.connection.getReceivers()
            const hasReceivers = sessionReceivers.length > 0
            console.log(`[doConference] Session ${session._id} has ${sessionReceivers.length} receivers`)
            this.context.logger?.log(`[doConference] Session ${session._id} has ${sessionReceivers.length} receivers`)

            if (!hasReceivers) {
                console.warn(`[doConference] Session ${session._id} has no receivers yet. Will re-configure when track arrives.`)
                this.context.logger?.warn(`[doConference] Session ${session._id} has no receivers yet. Will re-configure when track arrives.`)
                // Still create the mix destination so the session can send audio to others
                // But don't try to add tracks from this session to others' mixes
            }

            receiverTracks.forEach((track, trackKey) => {
                console.log('[doConference] - In forEach receiverTracks for', session._id)
                this.context.logger?.log('[doConference] - In forEach receiverTracks for', session._id)
                // Don't include the session's own received audio
                if (!trackKey.startsWith(session._id)) {
                    // Double-check track is still valid before creating audio nodes
                    if (!track || track.readyState !== 'live') {
                        console.warn(`[doConference] Skipping invalid track ${track?.id || 'unknown'} for session ${session._id}`)
                        this.context.logger?.warn(`[doConference] Skipping invalid track ${track?.id || 'unknown'} for session ${session._id}`)
                        return
                    }

                    try {
                        const source = audioContext.createMediaStreamSource(new MediaStream([ track ]))
                        const gainNode = audioContext.createGain()
                        const sourceKey = `${session._id}-${trackKey}`

                        source.connect(gainNode)
                        gainNode.connect(mixedOutput)
                        gainNode.connect(othersOnlyOutput)
                        console.log('[doConference] - In forEach connect track for', session._id)
                        this.context.logger?.log('[doConference] - In forEach connect track for', session._id)

                        // Store references for cleanup
                        nodes.sources.set(sourceKey, source)
                        nodes.gains.set(sourceKey, gainNode)
                    } catch (error) {
                        console.error(error)
                    }
                }
            })

            const othersOnlyTracks = othersOnlyOutput.stream.getTracks()

            tracksForVadSessions[session._id] = othersOnlyTracks[0]

            if (isHostRoom && this.activeStreamValue) {

                try {
                    //await this.setupActiveStream()
                    const processedStream = this.activeStream

                    const localSource = audioContext.createMediaStreamSource(processedStream)
                    const localGain = audioContext.createGain()
                    const localKey = `${session._id}-local`

                    localSource.connect(localGain)
                    localGain.connect(mixedOutput)

                    nodes.sources.set(localKey, localSource)
                    nodes.gains.set(localKey, localGain)
                } catch (error) {
                    console.error(error)
                }
            } else if (isHostRoom) {
                console.error(`Host room but no activeStreamValue - skipping host microphone for session ${session._id}`)
                this.context.logger?.error(`Host room but no activeStreamValue - skipping host microphone for session ${session._id}`)
            } /*else {
                session.connection.getReceivers().forEach((receiver: RTCRtpReceiver) => {
                    receiver.track.enabled = false
                })
            }*/

            const senders = session.connection.getSenders()
            const sender = senders[0]
            const mixedTracks = mixedOutput.stream.getTracks()

            if (sender && mixedTracks[0]) {
                try {
                    console.log('[doConference] - Final replaceTrack for', session._id)
                    this.context.logger?.log('[doConference] - Final replaceTrack for', session._id)
                    console.log('RIGHT 2 initial replace for ', session._id)
                    await sender.replaceTrack(mixedTracks[0])

                    // IMPORTANT: Only unmute if host is in this room
                    /*if (isHostRoom) {
                        console.log(`[doConference] Applying mute reconfigure for session ${session._id} (host room)`)
                        this.muteReconfigure(session)
                    } else {
                        console.log(`[doConference] Muting session ${session._id} (not host room)`)
                        // Mute the outgoing audio for rooms where host is not present
                        session.mute({ audio: true })
                    }*/
                    this.muteReconfigure(session)

                } catch (error) {
                    console.error(error)
                }
            }
        })

        if ([ 'enabled', 'dynamic' ].includes(this.noiseReduction.mode)) {
            console.log('[doConference] - Call processVAD from doConference')
            this.context.logger?.log('[doConference] - Call processVAD from doConference')
            this.processVADForActiveStream(tracksForVadSessions)
        }
    }

    private processCallerMute (callId: string, value: boolean) {
        const call = this.extendedCalls[callId]

        if (call && call.connection.getReceivers().length) {
            call.localMuted = value
            call.connection.getReceivers().forEach((receiver: RTCRtpReceiver) => {
                receiver.track.enabled = !value
            })
            this.updateCall(call)
        }
    }

    public muteCaller (callId: string) {
        this.processCallerMute(callId, true)
    }

    public unmuteCaller (callId: string) {
        this.processCallerMute(callId, false)
    }

    public terminateCall (callId: string) {
        // TODO: if it answered incoming call and we are doing hangup we are getting unregistered event and sockets are reconnecting
        const call = this.extendedCalls[callId]

        if (call._status === 4) {
            call.terminate({
                status_code: 603,
                reason_phrase: 'Decline'
            })
        } else if (call._status !== 8) {
            call.terminate()
        }
    }

    /**
     * Handle SIP response for ringback tone logic
     * Called from onTransportData when 100/180/183 responses are received
     * Can be called with either session ID or call_id from SIP message
     * @param identifier - The call/session ID or SIP call_id
     * @param statusCode - SIP status code (100, 180, or 183)
     */
    public handleSipResponseForRingback (identifier: string, statusCode: number) {
        let callId: string | null = null

        if (this.extendedCalls[identifier]) {
            callId = identifier
        } else {
            const matchingCall = Object.values(this.extendedCalls).find((call: ICall) => {
                return call.id === identifier || call._id === identifier ||
                       (call.id && call.id.includes(identifier)) ||
                       (call._id && call._id.includes(identifier))
            })
            if (matchingCall) {
                callId = matchingCall.id
            }
        }

        if (!callId) {
            this.context.logger?.warn(`[handleSipResponseForRingback] Could not find session for identifier ${identifier}, status ${statusCode}`)
            return
        }

        const call = this.extendedCalls[callId]
        if (!call) {
            this.context.logger?.warn(`[handleSipResponseForRingback] Call not found in extendedCalls for ${callId}`)
            return
        }

        if (call.direction !== 'outgoing') {
            return
        }

        if (call._is_confirmed) {
            this.context.logger?.log(`[handleSipResponseForRingback] Call ${callId} is already confirmed, skipping ringback tone`)
            return
        }

        if (statusCode === SIP_STATUS_CODE.TRYING || statusCode === SIP_STATUS_CODE.RINGING) {
            if (this.ringbackTimers[callId]) {
                return
            }

            // Mark that we haven't received 183 yet
            this.ringbackSessionProgressReceived[callId] = false

            this.ringbackTimers[callId] = setTimeout(() => {
                const currentCall = this.extendedCalls[callId]
                if (currentCall && !currentCall._is_confirmed && !this.ringbackSessionProgressReceived[callId]) {
                    this.startLocalRingbackTone(callId)
                    this.context.logger?.log(`[handleSipResponseForRingback] Started local ringback tone for call ${callId} after 2 seconds without 183`)
                } else if (currentCall && currentCall._is_confirmed) {
                    this.context.logger?.log(`[handleSipResponseForRingback] Call ${callId} was confirmed during 2-second wait, skipping ringback tone`)
                }

                delete this.ringbackTimers[callId]
            }, 2000)

            this.context.logger?.log(`[handleSipResponseForRingback] Started 2-second timer for call ${callId} after receiving ${statusCode}`)
        }

        // Handle 183 Session Progress - stop timer and ringback if playing
        if (statusCode === SIP_STATUS_CODE.SESSION_PROGRESS) {
            this.ringbackSessionProgressReceived[callId] = true

            if (this.ringbackTimers[callId]) {
                clearTimeout(this.ringbackTimers[callId])
                delete this.ringbackTimers[callId]
                this.context.logger?.log(`[handleSipResponseForRingback] Cancelled ringback timer for call ${callId} - 183 received`)
            }

            this.stopLocalRingbackTone(callId)
            this.context.logger?.log(`[handleSipResponseForRingback] Stopped local ringback tone for call ${callId} - 183 received with SDP`)
        }
    }

    /**
     * Start playing a local ringback tone (beep sound) for a session
     * Standard ringback tone pattern: 440Hz + 480Hz, 1 second on, 3 seconds off
     */
    private async startLocalRingbackTone (sessionId: string) {
        // Don't start if already playing
        if (this.ringbackAudioContexts[sessionId]) {
            return
        }

        try {
            const audioContext = await this.managedAudioContext.getContext()

            const oscillator1 = audioContext.createOscillator()
            const oscillator2 = audioContext.createOscillator()
            const gainNode = audioContext.createGain()

            oscillator1.frequency.value = 440
            oscillator2.frequency.value = 480
            oscillator1.type = 'sine'
            oscillator2.type = 'sine'

            gainNode.gain.value = 0

            oscillator1.connect(gainNode)
            oscillator2.connect(gainNode)
            gainNode.connect(audioContext.destination)

            oscillator1.start()
            oscillator2.start()

            const ringbackData = {
                context: audioContext,
                oscillator1,
                oscillator2,
                gainNode,
                intervalId: null as ReturnType<typeof setInterval> | null
            }
            this.ringbackAudioContexts[sessionId] = ringbackData

            const playBeep = () => {
                if (!this.ringbackAudioContexts[sessionId]) {
                    return
                }

                const now = audioContext.currentTime
                gainNode.gain.cancelScheduledValues(now)
                gainNode.gain.setValueAtTime(0, now)
                gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05)

                gainNode.gain.linearRampToValueAtTime(0, now + 1.0)
            }

            playBeep()

            const intervalId = setInterval(() => {
                if (!this.ringbackAudioContexts[sessionId]) {
                    clearInterval(intervalId)
                    return
                }
                playBeep()
            }, 4000)

            ringbackData.intervalId = intervalId
            this.ringbackAudioContexts[sessionId] = ringbackData

            this.context.logger?.log(`[startLocalRingbackTone] Started ringback tone for session ${sessionId}`)
        } catch (error) {
            this.context.logger?.error(`[startLocalRingbackTone] Error starting ringback tone for session ${sessionId}:`, error)
            console.error(`[startLocalRingbackTone] Error starting ringback tone for session ${sessionId}:`, error)
        }
    }

    /**
     * Stop playing the local ringback tone for a session
     */
    private stopLocalRingbackTone (sessionId: string) {
        const ringbackData = this.ringbackAudioContexts[sessionId]
        if (!ringbackData) {
            return
        }

        try {
            if (ringbackData.intervalId) {
                clearInterval(ringbackData.intervalId)
            }

            if (ringbackData.oscillator1) {
                ringbackData.oscillator1.stop()
            }
            if (ringbackData.oscillator2) {
                ringbackData.oscillator2.stop()
            }

            if (ringbackData.gainNode) {
                ringbackData.gainNode.disconnect()
            }

            delete this.ringbackAudioContexts[sessionId]

            this.context.logger?.log(`[stopLocalRingbackTone] Stopped ringback tone for session ${sessionId}`)
        } catch (error) {
            this.context.logger?.error(`[stopLocalRingbackTone] Error stopping ringback tone for session ${sessionId}:`, error)
            console.error(`[stopLocalRingbackTone] Error stopping ringback tone for session ${sessionId}:`, error)
            delete this.ringbackAudioContexts[sessionId]
        }
    }

    /**
     * Clean up ringback tone resources for a session
     * Called when call ends, fails, or is confirmed
     */
    private cleanupRingbackTone (sessionId: string) {
        if (this.ringbackTimers[sessionId]) {
            clearTimeout(this.ringbackTimers[sessionId])
            delete this.ringbackTimers[sessionId]
        }

        this.stopLocalRingbackTone(sessionId)

        delete this.ringbackSessionProgressReceived[sessionId]
    }

    /**
     * Play a hangup beep sound when a call is terminated
     * Standard hangup beep: single tone, short duration (~200ms)
     */
    private async playHangupBeep () {
        if (this.hangupBeepContext) {
            return
        }

        try {
            const audioContext = await this.managedAudioContext.getContext()

            const oscillator = audioContext.createOscillator()
            const gainNode = audioContext.createGain()

            oscillator.frequency.value = 800
            oscillator.type = 'sine'

            gainNode.gain.value = 0

            oscillator.connect(gainNode)
            gainNode.connect(audioContext.destination)

            this.hangupBeepContext = {
                context: audioContext,
                oscillator,
                gainNode
            }

            oscillator.start()

            const now = audioContext.currentTime
            gainNode.gain.setValueAtTime(0, now)
            gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01)
            gainNode.gain.setValueAtTime(0.3, now + 0.15)
            gainNode.gain.linearRampToValueAtTime(0, now + 0.2)

            oscillator.stop(now + 0.2)

            setTimeout(() => {
                if (this.hangupBeepContext) {
                    try {
                        if (this.hangupBeepContext.oscillator) {
                            this.hangupBeepContext.oscillator.disconnect()
                        }
                        if (this.hangupBeepContext.gainNode) {
                            this.hangupBeepContext.gainNode.disconnect()
                        }
                    } catch (error) {
                        console.error('[playHangupBeep] Cleanup playing hangup beep error:', error)
                    }
                    this.hangupBeepContext = null
                }
            }, 250)

            this.context.logger?.log('[playHangupBeep] Played hangup beep')
        } catch (error) {
            this.context.logger?.error('[playHangupBeep] Error playing hangup beep:', error)
            console.error('[playHangupBeep] Error playing hangup beep:', error)
            this.hangupBeepContext = null
        }
    }

    public transferCall (callId: string, target: string) {
        if (target.toString().length === 0) {
            return new Error('Target must be passed')
        }

        const call = this.extendedCalls[callId]

        if (!call._is_confirmed && !call._is_canceled) {
            const redirectTarget = `sip:${target}@${this.context.sipDomain}`

            call.terminate({
                status_code: 302,
                reason_phrase: 'Moved Temporarily',
                extraHeaders: [ `Contact: ${redirectTarget}` ]
            })

            return
        }

        this.updateCallStatus({
            callId,
            isTransferring: true,
            isTransferred: false
        })

        call.refer(`sip:${target}@${this.context.sipDomain}`, {
            eventHandlers: {
                requestSucceeded: () => {
                    this.updateCallStatus({
                        callId,
                        isTransferring: false,
                        isTransferred: true
                    })
                },
                requestFailed: () => {
                    this.updateCallStatus({
                        callId,
                        isTransferring: false,
                        isTransferred: false
                    })
                }
            }
        })
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

    public mergeCallByIds (firstCallId: string, secondCallId: string) {
        const firstCall = Object.values(this.extendedCalls).find((call) => call._id === firstCallId)
        const secondCall = Object.values(this.extendedCalls).find((call) => call._id === secondCallId)

        if (!firstCall || !secondCall) {
            throw new Error('Call ID is not provided')
        }

        // TODO: Check all call.id for working in the same way as call._id
        this.updateCallStatus({
            callId: firstCallId,
            isMerging: true
        })
        this.updateCallStatus({
            callId: secondCallId,
            isMerging: true
        })

        firstCall.refer(secondCall.remote_identity.uri.toString(), { replaces: secondCall })
        this.updateCall(firstCall)
    }

    // TODO: Use this method in demo
    public setDND (value: boolean) {
        this.isDNDEnabled = value
        this.context.emit('changeIsDND', value)
    }

    /**
     * Sets the call waiting feature state.
     *
     * When call waiting is disabled (false) and there are already active calls,
     * any new incoming calls will be automatically rejected with a "busy" status.
     *
     * When call waiting is enabled (true), incoming calls will be allowed even when
     * other calls are active.
     *
     * This setting is used in the shouldTerminateNewSession method to determine whether
     * to automatically terminate new incoming sessions when the user is already on a call.
     *
     * @param {boolean} value - True to enable call waiting, false to disable
     */
    public setCallWaiting (value: boolean) {
        this.isCallWaitingEnabled = value
        this.context.emit('changeIsCallWaiting', value)
    }

    private startCallTimer (callId: string) {
        this.removeTimeInterval(callId)

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
    }

    private async setupCall (event: RTCSessionEvent) {
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
            this.context.logger.log('New incoming call from', session._remote_identity?._uri?._user)
            newRoomInfo.incomingInProgress = true

            this.context.subscribe(CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED, (call) => {
                if (session.id === call.id) {
                    this.updateRoom( {
                        incomingInProgress: false,
                        roomId
                    })
                    this.startCallTimer(session.id)
                }
            })

            this.context.subscribe(CALL_EVENT_LISTENER_TYPE.CALL_FAILED, (call) => {
                if (session.id === call.id) {
                    this.updateRoom({
                        incomingInProgress: false,
                        roomId
                    })

                    this.deleteRoomIfEmpty(roomId)
                }
            })
        } else if (session.direction === 'outgoing') {
            // Start timer when call starts RINGING (183 Session Progress - actual ringing)
            const progressHandler = (event: IncomingEvent | OutgoingEvent) => {
                const hasSDP = !!(event?.response?.body)
                const contentType = event?.response?.getHeader?.('Content-Type')
                const contentLength = event?.response?.getHeader?.('Content-Length')

                console.log('PPP SDP Check:', {
                    hasBody: hasSDP,
                    contentType: contentType,
                    contentLength: contentLength,
                    bodyLength: event?.response?.body?.length || 0,
                    bodyPreview: event?.response?.body?.substring(0, 100) || 'N/A'
                })

                if (event.response && event.response.status_code === SIP_STATUS_CODE.SESSION_PROGRESS) {
                    this.startCallTimer(session.id)
                    // Remove this listener after first 183 to avoid multiple starts
                    session.off('progress', progressHandler)
                }
            }
            session.on('progress', progressHandler)

            // Reset timer when call is ANSWERED
            session.once('confirmed', () => {
                this.startCallTimer(session.id)
            })
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
            // 250ms delay before answering to ensure proper timing between 180 Ringing and 200 OK
            setTimeout(() => {
                this.answerCall(call._id)
            }, 250)
        }
    }

    private removeCall (value: string) {
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

        this.context.emit('changeActiveCalls', this.activeCalls)
    }

    private activeCallListRemove (call: ICall) {
        const session = this.extendedCalls[call._id]
        if (!session) return

        this.stopVUMeter('origin')
        this.stopVUMeter(call._id)

        const callRoomId = session.roomId

        // Clean up the call
        this.removeCall(call._id)

        // Reconfigure the room
        this.roomReconfigure(callRoomId).then(() => {
            // Additional cleanup if needed
        }).catch(error => {
            console.error('Error reconfiguring room after call removal:', error)
        })
    }


    /**
     * Determines whether a new incoming session should be automatically terminated
     * based on Do Not Disturb (DND) settings and Call Waiting settings.
     *
     * @param {RTCSessionEvent} event - The event containing the new RTC session
     * @returns {boolean} True if the session should be terminated automatically, false otherwise
     */
    private shouldTerminateNewSession (event: RTCSessionEvent): boolean {
        const session = event.session as RTCSessionExtended

        if (session.direction === 'outgoing') {
            return false
        }

        const terminateBecauseOfCallWaiting = !this.isCallWaiting && this.hasActiveCalls

        return this.isDND || terminateBecauseOfCallWaiting
    }

    private async newRTCSessionCallback (event: RTCSessionEvent) {
        const session = event.session as RTCSessionExtended

        if (this.shouldTerminateNewSession(event)) {
            session.terminate({
                status_code: 486,
                reason_phrase: 'Do Not Disturb'
            })
            return
        }

        // TODO: ADDED BECAUSE MARIANA NEEDED FOR THE PLAYING BIP SOUND ON INCOMING CALL
        this.context.triggerListener({
            listenerType: CALL_EVENT_LISTENER_TYPE.NEW_CALL,
            session,
            event
        })

        // stop timers on ended and failed
        session.on('ended', (event) => {
            this.stopVUMeter(session.id)
            this.context.logger.log('Session ended for', session._remote_identity?._uri?._user)
            this.context.triggerListener({
                listenerType: CALL_EVENT_LISTENER_TYPE.CALL_ENDED,
                session,
                event
            })

            // Play only for answered calls
            if (session._is_confirmed) {
                this.playHangupBeep()
            }

            if (session.connection) {
                const connectionState = session.connection.connectionState

                if (connectionState === 'closed' || connectionState === 'disconnected') {
                    this.context.emit('connectionStateChange', {
                        session,
                        connectionState
                    })
                }
            }

            if ([ 'enabled', 'dynamic' ].includes(this.noiseReduction.mode)) {
                this.stopSessionVad()
            }

            this.cleanupRingbackTone(session.id)

            const s = this.getActiveCalls[session.id]

            if (s) {
                this.activeCallListRemove(s)
            }

            this.stopCallTimer(session.id)
            this.removeCallStatus(session.id)
            this.removeCallMetrics(session.id)

            if (!Object.keys(this.extendedCalls).length) {
                this.setIsMuted(false)
                this.initialStreamValue?.getTracks().forEach((track) => track.stop())
                this.initialStreamValue = null
            }

            if (this.context.isWaitingForSessionHangup() && !this.hasActiveAnsweredCalls) {
                this.context.stopSessionAfterWaiting()
            }
        })
        session.on('progress', (event: IncomingEvent | OutgoingEvent) => {
            this.context.logger.log('Session in progress for', session._remote_identity?._uri?._user)
            this.context.triggerListener({
                listenerType: CALL_EVENT_LISTENER_TYPE.CALL_PROGRESS,
                session,
                event
            })
        })
        session.on('failed', (event) => {
            this.stopVUMeter(session.id)
            this.context.logger.log('Session failed for', session._remote_identity?._uri?._user)
            this.context.triggerListener({
                listenerType: CALL_EVENT_LISTENER_TYPE.CALL_FAILED,
                session,
                event
            })

            if (session.connection) {
                const connectionState = session.connection.connectionState

                if (connectionState === 'closed' || connectionState === 'disconnected') {
                    this.context.emit('connectionStateChange', {
                        session,
                        connectionState
                    })
                }
            }

            if ([ 'enabled', 'dynamic' ].includes(this.noiseReduction.mode)) {
                this.stopSessionVad()
            }

            this.cleanupRingbackTone(session.id)

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
                this.initialStreamValue?.getTracks().forEach((track) => track.stop())
                this.initialStreamValue = null
            }

            if (this.context.isWaitingForSessionHangup() && !this.hasActiveAnsweredCalls) {
                this.context.stopSessionAfterWaiting()
            }
        })
        session.on('confirmed', (event: IncomingAckEvent | OutgoingAckEvent) => {
            this.context.logger.log('Session confirmed for', session._remote_identity?._uri?._user)
            this.context.triggerListener({
                listenerType: CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED,
                session,
                event
            })
            this.updateCall(session as ICall)

            this.cleanupRingbackTone(session.id)

            if (session.id === this.callAddingInProgress) {
                this.callAddingInProgress = undefined
            }
        })

        const setupConnectionListeners = (connection: RTCPeerConnection) => {
            if (!connection) return

            connection.addEventListener('connectionstatechange', (event) => {
                this.context.emit('connectionStateChange', {
                    session,
                    connectionState: connection.connectionState
                })
                // TODO: Automatic conference reconfiguration on connection state change - uncomment if needed
                /*const connectionState = connection.connectionState
                // Re-configure conference if connection state changes and we're in a conference
                // This ensures tracks are re-evaluated when connection recovers
                if (session.roomId !== undefined) {
                    const callsInRoom = Object.values(this.extendedCalls).filter(call => call.roomId === session.roomId)
                    if (callsInRoom.length > 1) {
                        console.log(`[ConnectionStateChange] Re-configuring conference for room ${session.roomId} due to connection state: ${connectionState}`)
                        // Use setTimeout to avoid re-configuring during connection setup
                        setTimeout(() => {
                            this.roomReconfigure(session.roomId)
                        }, 1000)
                    }
                }*/
            })
            // TODO: Track state monitoring - uncomment if needed for automatic track state monitoring
            /*// Monitor track state changes
            connection.addEventListener('track', (event: RTCTrackEvent) => {
                const track = event.track

                // Monitor track state changes
                track.addEventListener('ended', () => {
                    console.warn(`[TrackEnded] Track ${track.id} ended for session ${session.id}`)
                    // Re-configure conference when a track ends
                    if (session.roomId !== undefined) {
                        const callsInRoom = Object.values(this.extendedCalls).filter(call => call.roomId === session.roomId)
                        if (callsInRoom.length > 1) {
                            console.log(`[TrackEnded] Re-configuring conference for room ${session.roomId}`)
                            setTimeout(() => {
                                this.roomReconfigure(session.roomId)
                            }, 500)
                        }
                    }
                })

                // Monitor mute/unmute state changes
                track.addEventListener('mute', () => {
                    console.log(`[TrackMuted] Track ${track.id} muted for session ${session.id}`)
                })

                track.addEventListener('unmute', () => {
                    console.log(`[TrackUnmuted] Track ${track.id} unmuted for session ${session.id}`)
                })
            })*/
        }

        if (session.connection) {
            setupConnectionListeners(session.connection)
        }

        session.on('peerconnection', ({ peerconnection }: { peerconnection: RTCPeerConnection }) => {
            setupConnectionListeners(peerconnection)
        })

        await this.setupCall(event)

        if (session.direction === 'outgoing') {
            const roomId = this.getActiveCalls[session.id].roomId
            await this.setActiveRoom(roomId)
        }
    }

    public setMuteWhenJoin (value: boolean) {
        this.muteWhenJoinEnabled = value
        this.context.emit('changeMuteWhenJoin', value)
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
        this.context.emit('changeActiveInputMediaDevice', deviceId)
    }

    private setSelectedOutputDevice (deviceId: string) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_OUTPUT_DEVICE, deviceId)

        this.selectedMediaDevices.output = deviceId
        this.context.emit('changeActiveOutputMediaDevice', deviceId)
    }

    private setCallMetrics (value: any) {
        const metrics = { ...value }
        delete metrics['callId']

        this.callMetrics = {
            ...this.callMetrics,
            [value.callId]: metrics
        }

        this.context.emit('changeCallMetrics', this.callMetrics)
    }

    private removeCallMetrics (callId: string) {
        const callMetricsCopy = { ...this.callMetrics }
        delete callMetricsCopy[callId]

        this.callMetrics = {
            ...callMetricsCopy,
        }

        this.context.emit('changeCallMetrics', this.callMetrics)
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

            if (!inboundAudioMetric) {
                return
            }

            const metric: MetricAudioData = filterObjectKeys(inboundAudioMetric, METRIC_KEYS_TO_INCLUDE)
            metric.callId = call._id
            this.setCallMetrics(metric)
        }

        this.context.subscribe(CALL_EVENT_LISTENER_TYPE.CALL_ENDED, (session) => {
            if (session._id === call._id) {
                metrics.stopAllProbes()
            }
        })

        metrics.startAllProbes()
    }

    private async setupVUMeter (stream: MediaStream, deviceId: string) {
        await this.VUMeter.start(await this.managedAudioContext.getContext(), stream, deviceId)
    }

    private stopVUMeter (deviceId: string) {
        this.VUMeter.stop(deviceId)
    }

    async setupStream () {
        try {
            const streamStart = Date.now()
            const stream = await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)

            if (this.initialStreamValue) {
                const tracksToStop = this.initialStreamValue.getTracks()
                tracksToStop.forEach((track, index) => {
                    track.stop()
                })
                this.initialStreamValue = null
            }

            this.initialStreamValue = stream
        } catch (error) {
            throw error
        }
    }

    private async triggerAddStream (event: RTCTrackEvent, call: ICall) {
        console.log(`[triggerAddStream] - For ${call._id}`)
        this.context.logger?.log(`[triggerAddStream] - For ${call._id}`)
        const muteState = this.muteWhenJoin || this.isMuted
        this.setIsMuted(muteState)

        if (!this.initialStreamValue) {
            await this.setupStream()
        }

        const audioContext = await this.managedAudioContext.getContext()

        const processedStream = await processAudioVolume(audioContext, this.initialStreamValue, this.microphoneInputLevel * 2)
        const muteMicro = this.isMuted || this.muteWhenJoin

        processedStream.getTracks().forEach((track) => {
            track.enabled = !muteMicro
        })

        await this.setActiveStream(processedStream)

        const senders = call.connection.getSenders()
        const firstSender = senders[0]

        await firstSender.replaceTrack(processedStream.getTracks()[0])

        const stream = new MediaStream([ event.track ])

        const syncStreamNeeded = !Object.values(this.extendedCalls)
            .find((session) => session.audioTag && session.audioTag.id === call._id)

        if (syncStreamNeeded) {
            syncStream(stream, call, this.selectedOutputDevice, this.speakerVolume)
        }

        // IMPORTANT: Check if we should hear this call
        const shouldHearThisCall = call.roomId === this.currentActiveRoomId

        if (call.audioTag) {
            call.audioTag.muted = !shouldHearThisCall
        }

        await this.setupVUMeter(stream, call._id)
        this.getCallQuality(call)
        this.updateCall(call)

        if (call.roomId !== undefined) {
            const callsInRoom = Object.values(this.extendedCalls).filter(c => c.roomId === call.roomId)
            if (callsInRoom.length > 1) {
                console.log(`[triggerAddStream] Re-configuring conference for room ${call.roomId} - track received for call ${call._id}`)
                this.context.logger?.log(`[triggerAddStream] Re-configuring conference for room ${call.roomId} - track received for call ${call._id}`)
                // Use setTimeout to avoid blocking the track event handler
                setTimeout(() => {
                    this.roomReconfigure(call.roomId)
                }, 100)
            }
        }

        if ([ 'enabled', 'dynamic' ].includes(this.noiseReduction.mode)) {
            //this.processVAD(call, processedStream)
            this.processVADForActiveStream()
        }
    }

    //@requireInitialization()
    public initCall (target: string, addToCurrentRoom: boolean, holdOtherCalls = false) {
        /*console.log('SPECIAL CASE INIT CALL')
        if (Object.values(this.extendedCalls).length >= 2) {
            console.log('SPECIAL CASE !!!!!!!!!!!!!!!')

            navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
                const track = stream.getAudioTracks()[0]
                track.enabled = false

                Object.values(this.extendedCalls).forEach((session) => {
                    session.connection.getSenders().forEach((sender) => {
                        sender.replaceTrack(track)
                    })

                    session.connection.getReceivers().forEach((receiver) => {
                        receiver.track.enabled = false
                    })
                })
            })
        }*/
        //this.checkInitialized()

        if (target.length === 0) {
            return console.error('Target must be a valid string')
        }

        this.context.logger.log(`Calling sip:${target}@${this.context.sipDomain}...`)

        const call = this.context.call(
            `sip:${target}@${this.context.sipDomain}`,
            this.sipOptions
        )

        /*window.hangup = function () {
            session.terminate()
            session.removeAllListeners()

            session.connection.getSenders().forEach((sender) => {
                sender.track.stop()
            })

            if (session.connection) {
                session.connection.close()
            }

            session = null
        }*/



        this.callAddingInProgress = call.id

        if (addToCurrentRoom && this.currentActiveRoomId !== undefined) {
            this.processRoomChange({
                callId: call.id,
                roomId: this.currentActiveRoomId
            })

            // If holdOtherCalls is true, put all other calls in the room on hold
            if (holdOtherCalls) {
                const callsToHold = Object.values(this.extendedCalls)
                    .filter(c => c.roomId === this.currentActiveRoomId && c._id !== call.id)

                for (const otherCall of callsToHold) {
                    this.holdCall(otherCall._id, true)
                }
            }
        }

        call.connection.addEventListener('track', (event: RTCTrackEvent) => {
            this.triggerAddStream(event, call as ICall)
        })
    }

    private async processRoomChange ({ callId, roomId }: { callId: string, roomId: number }) {
        const call = this.extendedCalls[callId]
        if (!call) {
            return
        }

        const oldRoomId = call.roomId

        call.roomId = roomId

        this.updateCall(call)

        await this.roomReconfigure(oldRoomId)
        await this.roomReconfigure(roomId)
    }
}
