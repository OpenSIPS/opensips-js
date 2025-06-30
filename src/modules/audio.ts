import {
    ICall,
    ICallStatus,
    ICallStatusUpdate,
    IntervalType,
    IRoom,
    IRoomUpdate,
    RTCSessionExtended
} from '@/types/rtc'
import { CallTime, ITimeData, TempTimeData } from '@/types/timer'
import { setupTime } from '@/helpers/time.helper'
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
import { IncomingAckEvent, IncomingEvent, OutgoingAckEvent, OutgoingEvent } from 'jssip/lib/RTCSession'
import WebRTCMetrics from '@/helpers/webrtcmetrics/metrics'
import { filterObjectKeys } from '@/helpers/filter.helper'
import { METRIC_KEYS_TO_INCLUDE } from '@/enum/metric.keys.to.include'
import VUMeter from '@/helpers/VUMeter'
import OpenSIPSJS from '@/index'
import ManagedAudioContext from '@/helpers/audioContext'

const STORAGE_KEYS = {
    SELECTED_INPUT_DEVICE: 'OpensipsJSInputDevice',
    SELECTED_OUTPUT_DEVICE: 'OpensipsJSOutputDevice'
}
const CALL_STATUS_UNANSWERED = 0

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

    private VUMeter: VUMeter

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
        console.log(`[cleanupConferenceNodes] Cleaning up conference nodes for room ${roomId}`)
        const nodes = this.conferenceNodes[roomId]
        
        if (!nodes) {
            console.log(`[cleanupConferenceNodes] No conference nodes found for room ${roomId}, skipping cleanup`)
            return
        }
        
        console.log(`[cleanupConferenceNodes] Found nodes to cleanup:`, {
            sources: nodes.sources.size,
            destinations: nodes.destinations.size,
            gains: nodes.gains.size
        })

        // Disconnect all nodes with error handling
        let disconnectedSources = 0
        nodes.sources.forEach((source, key) => {
            try {
                source.disconnect()
                disconnectedSources++
            } catch (error) {
                console.error(`[cleanupConferenceNodes] Error disconnecting source ${key}:`, error)
            }
        })
        
        let disconnectedDestinations = 0
        nodes.destinations.forEach((dest, key) => {
            try {
                dest.disconnect()
                disconnectedDestinations++
            } catch (error) {
                console.error(`[cleanupConferenceNodes] Error disconnecting destination ${key}:`, error)
            }
        })
        
        let disconnectedGains = 0
        nodes.gains.forEach((gain, key) => {
            try {
                gain.disconnect()
                disconnectedGains++
            } catch (error) {
                console.error(`[cleanupConferenceNodes] Error disconnecting gain ${key}:`, error)
            }
        })

        delete this.conferenceNodes[roomId]
        
        console.log(`[cleanupConferenceNodes] ✓ Cleanup completed for room ${roomId}:`, {
            sourcesDisconnected: disconnectedSources,
            destinationsDisconnected: disconnectedDestinations,
            gainsDisconnected: disconnectedGains
        })
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
        console.log('[moveCall], will move call:', {
            callId,
            roomId
        })
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
                const processedStream = await this.getActiveStream()
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

    private async roomReconfigure (roomId: number | undefined) {
        const startTime = Date.now()
        console.log(`[roomReconfigure_${roomId}] === STARTING ROOM RECONFIGURATION ===`)
        console.log(`[roomReconfigure_${roomId}] Target room: ${roomId}, current active room: ${this.currentActiveRoomId}`)
        
        if (roomId === undefined) {
            console.log(`[roomReconfigure_${roomId}] Room ID is undefined, aborting reconfiguration`)
            return
        }

        const callsInRoom = Object.values(this.extendedCalls).filter(call => call.roomId === roomId)
        const allRooms = Object.keys(this.activeRooms)
        const totalActiveCalls = Object.keys(this.extendedCalls).length
        
        console.log(`[roomReconfigure_${roomId}] Room analysis:`, {
            roomId,
            callsInRoom: callsInRoom.length,
            totalActiveCalls,
            activeRoomsCount: allRooms.length,
            allActiveRooms: allRooms,
            callIds: callsInRoom.map(c => c._id)
        })

        const isHostRoom = this.currentActiveRoomId === roomId
        console.log(`[roomReconfigure_${roomId}] Host status: isHostRoom=${isHostRoom} (current=${this.currentActiveRoomId})`)
        
        // Log detailed call states
        callsInRoom.forEach((call, index) => {
            console.log(`[roomReconfigure_${roomId}] Call ${index + 1}/${callsInRoom.length} details:`, {
                callId: call._id,
                connectionState: call.connection?.connectionState,
                isOnHoldLocal: call.isOnHold()?.local,
                isOnHoldRemote: call.isOnHold()?.remote,
                automaticHold: call._automaticHold,
                hasAudioTag: !!call.audioTag,
                audioTagMuted: call.audioTag?.muted,
                localMuted: call.localMuted
            })
        })

        console.log(`[roomReconfigure_${roomId}] >>> CONFIGURING CALL AUDIO STATES <<<`)
        callsInRoom.forEach((call, index) => {
            console.log(`[roomReconfigure_${roomId}] Processing call ${index + 1}/${callsInRoom.length}: ${call._id}`)
            
            if (call.audioTag) {
                const beforeState = {
                    audioTagMuted: call.audioTag.muted,
                    localMuted: call.localMuted,
                    volume: call.audioTag.volume
                }
                
                // Only unmute if this is the host's current room
                if (isHostRoom) {
                    console.log(`[roomReconfigure_${roomId}] Applying mute reconfigure for call ${call._id} (host room)`)
                    this.muteReconfigure(call)
                } else {
                    console.log(`[roomReconfigure_${roomId}] Skipping mute reconfigure for call ${call._id} (not host room)`)
                }

                const shouldMute = !isHostRoom
                console.log(`[roomReconfigure_${roomId}] Setting audioTag.muted=${shouldMute} for call ${call._id}`)
                call.audioTag.muted = shouldMute
                
                const afterState = {
                    audioTagMuted: call.audioTag.muted,
                    localMuted: call.localMuted,
                    volume: call.audioTag.volume
                }
                
                console.log(`[roomReconfigure_${roomId}] Call ${call._id} audio state change:`, {
                    before: beforeState,
                    after: afterState,
                    changed: JSON.stringify(beforeState) !== JSON.stringify(afterState)
                })
                
                this.updateCall(call)
            } else {
                console.log(`[roomReconfigure_${roomId}] Call ${call._id} has no audioTag, skipping audio configuration`)
            }
        })

        console.log(`[roomReconfigure_${roomId}] ✓ Audio states configured for all calls in room`)

        // Clean up empty rooms
        if (callsInRoom.length === 0) {
            console.log(`[roomReconfigure_${roomId}] >>> EMPTY ROOM CLEANUP <<<`)
            console.log(`[roomReconfigure_${roomId}] Room ${roomId} has no calls, initiating cleanup`)

            const hasConferenceNodes = !!this.conferenceNodes[roomId]
            console.log(`[roomReconfigure_${roomId}] Conference nodes exist: ${hasConferenceNodes}`)
            
            if (hasConferenceNodes) {
                await this.cleanupConferenceNodes(roomId)
                console.log(`[roomReconfigure_${roomId}] ✓ Conference nodes cleaned up`)
            }
            
            console.log(`[roomReconfigure_${roomId}] Deleting empty room ${roomId}`)
            this.deleteRoomIfEmpty(roomId)
            console.log(`[roomReconfigure_${roomId}] === ROOM RECONFIGURATION COMPLETED (EMPTY ROOM) === (${Date.now() - startTime}ms)`)
            return
        }

        // Single call in non-active room - put on hold
        if (callsInRoom.length === 1 && !isHostRoom) {
            const call = callsInRoom[0]
            console.log(`[roomReconfigure_${roomId}] >>> SINGLE CALL IN NON-HOST ROOM <<<`)
            console.log(`[roomReconfigure_${roomId}] Single call ${call._id} in non-host room ${roomId}, will put on hold`)
            
            const holdState = call.isOnHold()
            console.log(`[roomReconfigure_${roomId}] Current hold state for call ${call._id}:`, holdState)

            if (!holdState.local) {
                console.log(`[roomReconfigure_${roomId}] Putting call ${call._id} on hold (automatic=true)`)
                await this.holdCall(call._id, true)
                console.log(`[roomReconfigure_${roomId}] ✓ Call ${call._id} put on hold`)
            } else {
                console.log(`[roomReconfigure_${roomId}] Call ${call._id} already on local hold, skipping`)
            }
            
            // Clean up any conference nodes
            const hasConferenceNodes = !!this.conferenceNodes[roomId]
            if (hasConferenceNodes) {
                console.log(`[roomReconfigure_${roomId}] Cleaning up conference nodes for single-call room ${roomId}`)
                await this.cleanupConferenceNodes(roomId)
                console.log(`[roomReconfigure_${roomId}] ✓ Conference nodes cleaned up`)
            }
            
            console.log(`[roomReconfigure_${roomId}] === ROOM RECONFIGURATION COMPLETED (SINGLE HOLD) === (${Date.now() - startTime}ms)`)
            return
        }

        // Single call in active room - unhold if needed and set up direct audio
        if (callsInRoom.length === 1 && isHostRoom) {
            const call = callsInRoom[0]
            console.log(`[roomReconfigure_${roomId}] >>> SINGLE CALL IN HOST ROOM <<<`)
            console.log(`[roomReconfigure_${roomId}] Single call ${call._id} in host room ${roomId}, setting up direct audio`)
            
            const holdState = call.isOnHold()
            console.log(`[roomReconfigure_${roomId}] Hold state for call ${call._id}:`, {
                local: holdState.local,
                remote: holdState.remote,
                automaticHold: call._automaticHold
            })

            if (holdState.local && call._automaticHold) {
                console.log(`[roomReconfigure_${roomId}] Unholding call ${call._id} (was on automatic hold)`)
                await this.unholdCall(call._id)
                console.log(`[roomReconfigure_${roomId}] ✓ Call ${call._id} unheld`)
            } else {
                console.log(`[roomReconfigure_${roomId}] Call ${call._id} hold state - no unhold needed`)
            }

            const senders = call.connection?.getSenders() || []
            const firstSender = senders[0]
            console.log(`[roomReconfigure_${roomId}] Setting up direct audio for call ${call._id}:`, {
                hasConnection: !!call.connection,
                senderCount: senders.length,
                hasFirstSender: !!firstSender
            })
            
            if (call.connection && firstSender) {
                try {
                    const processedStream = await this.getActiveStream()
                    const tracks = processedStream.getTracks()
                    console.log(`[roomReconfigure_${roomId}] Got processed stream:`, {
                        hasStream: !!processedStream,
                        trackCount: tracks.length,
                        firstTrackId: tracks[0]?.id
                    })
                    
                    console.log(`[roomReconfigure_${roomId}] Replacing track for call ${call._id}`)
                    await firstSender.replaceTrack(tracks[0])
                    console.log(`[roomReconfigure_${roomId}] ✓ Track replaced for call ${call._id}`)
                    
                    console.log(`[roomReconfigure_${roomId}] Applying mute reconfigure for call ${call._id}`)
                    this.muteReconfigure(call)
                    console.log(`[roomReconfigure_${roomId}] ✓ Mute reconfigure applied for call ${call._id}`)
                } catch (error) {
                    console.error(`[roomReconfigure_${roomId}] ERROR setting up direct audio for call ${call._id}:`, error)
                }
            } else {
                console.error(`[roomReconfigure_${roomId}] ERROR: Cannot set up direct audio for call ${call._id} - missing connection or sender`)
            }

            // Clean up any conference nodes for single participant
            const hasConferenceNodes = !!this.conferenceNodes[roomId]
            if (hasConferenceNodes) {
                console.log(`[roomReconfigure_${roomId}] Cleaning up conference nodes for single-participant room ${roomId}`)
                await this.cleanupConferenceNodes(roomId)
                console.log(`[roomReconfigure_${roomId}] ✓ Conference nodes cleaned up`)
            }
            
            console.log(`[roomReconfigure_${roomId}] === ROOM RECONFIGURATION COMPLETED (SINGLE DIRECT) === (${Date.now() - startTime}ms)`)
            return
        }

        // Multiple calls - set up conference
        if (callsInRoom.length > 1) {
            console.log(`[roomReconfigure_${roomId}] >>> MULTIPLE CALLS - CONFERENCE SETUP <<<`)
            console.log(`[roomReconfigure_${roomId}] Room ${roomId} has ${callsInRoom.length} calls, setting up conference`)
            
            // Log all participants before conference
            callsInRoom.forEach((call, index) => {
                console.log(`[roomReconfigure_${roomId}] Conference participant ${index + 1}: ${call._id}`, {
                    connectionState: call.connection?.connectionState,
                    isOnHold: call.isOnHold(),
                    hasAudioTag: !!call.audioTag
                })
            })
            
            const conferenceStart = Date.now()
            await this.doConference(callsInRoom)
            console.log(`[roomReconfigure_${roomId}] ✓ Conference setup completed in ${Date.now() - conferenceStart}ms`)
        } else {
            console.log(`[roomReconfigure_${roomId}] Unexpected call count: ${callsInRoom.length} (should be handled by previous conditions)`)
        }
        
        console.log(`[roomReconfigure_${roomId}] === ROOM RECONFIGURATION COMPLETED === (${Date.now() - startTime}ms)`)
    }

    private async doConference (sessions: Array<ICall>) {
        console.log(`[doConference] === STARTING CONFERENCE SETUP ===`)
        
        if (sessions.length === 0) {
            console.log(`[doConference] WARNING: No sessions provided, aborting conference`)
            return
        }
        
        const roomId = sessions[0].roomId
        const isHostRoom = this.currentActiveRoomId === roomId
        
        console.log(`[doConference] Conference parameters:`, {
            roomId,
            sessionCount: sessions.length,
            isHostRoom,
            currentActiveRoom: this.currentActiveRoomId,
            sessionIds: sessions.map(s => s._id)
        })
        
        // Validate all sessions have same room ID
        const roomMismatch = sessions.find(s => s.roomId !== roomId)
        if (roomMismatch) {
            console.error(`[doConference] ERROR: Room ID mismatch! Expected ${roomId}, found session ${roomMismatch._id} in room ${roomMismatch.roomId}`)
            return
        }
        
        // Check AudioContext state before proceeding
        console.log(`[doConference] AudioContext state before getContext: ${this.managedAudioContext.rawContext.state}`)
        const audioContextStart = Date.now()
        const audioContext = await this.managedAudioContext.getContext()
        console.log(`[doConference] AudioContext obtained in ${Date.now() - audioContextStart}ms, final state: ${audioContext.state}`)
        
        if (audioContext.state !== 'running') {
            console.error(`[doConference] ERROR: AudioContext is not running! State: ${audioContext.state}`)
            return
        }

        // Clean up existing conference nodes for this room
        console.log(`[doConference] Cleaning up existing conference nodes for room ${roomId}`)
        await this.cleanupConferenceNodes(roomId)
        console.log(`[doConference] ✓ Conference nodes cleanup completed`)

        // Initialize new conference nodes
        console.log(`[doConference] Initializing new conference nodes for room ${roomId}`)
        this.conferenceNodes[roomId] = {
            sources: new Map(),
            destinations: new Map(),
            gains: new Map()
        }
        const nodes = this.conferenceNodes[roomId]
        console.log(`[doConference] ✓ Conference nodes initialized`)

        // Create a map of all receiver tracks
        const receiverTracks = new Map<string, MediaStreamTrack>()
        console.log(`[doConference] >>> COLLECTING RECEIVER TRACKS <<<`)

        sessions.forEach((session, sessionIndex) => {
            console.log(`[doConference] Processing session ${sessionIndex + 1}/${sessions.length}: ${session._id}`)
            console.log(`[doConference] Session details:`, {
                sessionId: session._id,
                hasConnection: !!session.connection,
                connectionState: session.connection?.connectionState,
                receiverCount: session.connection?.getReceivers().length || 0
            })
            
            if (session && session.connection) {
                const receivers = session.connection.getReceivers()
                console.log(`[doConference] Found ${receivers.length} receivers for session ${session._id}`)
                
                receivers.forEach((receiver: RTCRtpReceiver, receiverIndex) => {
                    const trackId = receiver.track?.id
                    const readyState = receiver.track?.readyState
                    const kind = receiver.track?.kind
                    const trackKey = `${session._id}-${trackId}`
                    
                    console.log(`[doConference] Receiver ${receiverIndex + 1}/${receivers.length} for session ${session._id}:`, {
                        hasTrack: !!receiver.track,
                        trackId,
                        readyState,
                        kind,
                        trackKey,
                        isLive: receiver.track && receiver.track.readyState === 'live'
                    })

                    if (receiver.track && receiver.track.readyState === 'live') {
                        receiverTracks.set(trackKey, receiver.track)
                        console.log(`[doConference] ✓ Added track ${trackKey} to receiver tracks map`)
                    } else {
                        console.log(`[doConference] ✗ Skipped track ${trackKey} - not live or missing`)
                    }
                })
            } else {
                console.log(`[doConference] ✗ Session ${session._id} has no connection, skipping`)
            }
        })
        
        console.log(`[doConference] Total receiver tracks collected: ${receiverTracks.size}`)
        console.log(`[doConference] Receiver track keys:`, Array.from(receiverTracks.keys()))

        // For each session, create a custom mix excluding their own audio
        console.log(`[doConference] >>> CREATING CUSTOM MIX FOR EACH SESSION <<<`)
        await forEach(sessions, async (session: ICall, sessionIndex) => {
            console.log(`[doConference] Creating mix for session ${sessionIndex + 1}/${sessions.length}: ${session._id}`)
            
            if (!session || !session.connection) {
                console.log(`[doConference] ✗ Skipping session ${session._id} - no session or connection`)
                return
            }
            
            console.log(`[doConference] Session ${session._id} connection state: ${session.connection.connectionState}`)
            const mixedOutput = audioContext.createMediaStreamDestination()
            nodes.destinations.set(session._id, mixedOutput)
            console.log(`[doConference] ✓ Created destination node for session ${session._id}`)

            // Add all other participants' audio to this session's mix
            console.log(`[doConference] Adding other participants' audio to mix for session ${session._id}`)
            let tracksAddedToMix = 0
            
            receiverTracks.forEach((track, trackKey) => {
                console.log(`[doConference] Evaluating track ${trackKey} for session ${session._id} mix`)
                
                // Don't include the session's own received audio
                if (!trackKey.startsWith(session._id)) {
                    console.log(`[doConference] ✓ Adding track ${trackKey} to mix for session ${session._id}`)
                    
                    try {
                        const source = audioContext.createMediaStreamSource(new MediaStream([ track ]))
                        const gainNode = audioContext.createGain()
                        const sourceKey = `${session._id}-${trackKey}`

                        source.connect(gainNode)
                        gainNode.connect(mixedOutput)

                        // Store references for cleanup
                        nodes.sources.set(sourceKey, source)
                        nodes.gains.set(sourceKey, gainNode)
                        
                        tracksAddedToMix++
                        console.log(`[doConference] ✓ Successfully connected track ${trackKey} to mix for session ${session._id}`)
                    } catch (error) {
                        console.error(`[doConference] ERROR: Failed to add track ${trackKey} to mix for session ${session._id}:`, error)
                    }
                } else {
                    console.log(`[doConference] ✗ Skipping own track ${trackKey} for session ${session._id}`)
                }
            })
            
            console.log(`[doConference] Added ${tracksAddedToMix} tracks to mix for session ${session._id}`)

            // Only add host's microphone if this is the room where host currently is
            if (isHostRoom && this.activeStreamValue) {
                console.log(`[doConference] Adding host microphone to mix for session ${session._id} (host room)`)
                
                try {
                    const processedStream = await this.getActiveStream()
                    console.log(`[doConference] Got active stream for host microphone:`, {
                        hasStream: !!processedStream,
                        trackCount: processedStream?.getTracks().length,
                        audioTracks: processedStream?.getAudioTracks().length
                    })
                    
                    const localSource = audioContext.createMediaStreamSource(processedStream)
                    const localGain = audioContext.createGain()
                    const localKey = `${session._id}-local`

                    localSource.connect(localGain)
                    localGain.connect(mixedOutput)

                    nodes.sources.set(localKey, localSource)
                    nodes.gains.set(localKey, localGain)
                    
                    console.log(`[doConference] ✓ Host microphone added to mix for session ${session._id}`)
                } catch (error) {
                    console.error(`[doConference] ERROR: Failed to add host microphone to mix for session ${session._id}:`, error)
                }
            } else if (isHostRoom) {
                console.log(`[doConference] Host room but no activeStreamValue - skipping host microphone for session ${session._id}`)
            } else {
                console.log(`[doConference] Not host room - skipping host microphone for session ${session._id}`)
            }

            // Replace the track for this session
            const senders = session.connection.getSenders()
            const sender = senders[0]
            const mixedTracks = mixedOutput.stream.getTracks()
            
            console.log(`[doConference] Replacing track for session ${session._id}:`, {
                senderCount: senders.length,
                hasSender: !!sender,
                mixedTrackCount: mixedTracks.length,
                hasFirstMixedTrack: !!mixedTracks[0],
                mixedTrackIds: mixedTracks.map(t => t.id)
            })
            
            if (sender && mixedTracks[0]) {
                try {
                    console.log(`[doConference] Attempting to replace track for session ${session._id}`)
                    await sender.replaceTrack(mixedTracks[0])
                    console.log(`[doConference] ✓ Track replaced successfully for session ${session._id}`)

                    // IMPORTANT: Only unmute if host is in this room
                    if (isHostRoom) {
                        console.log(`[doConference] Applying mute reconfigure for session ${session._id} (host room)`)
                        this.muteReconfigure(session)
                    } else {
                        console.log(`[doConference] Muting session ${session._id} (not host room)`)
                        // Mute the outgoing audio for rooms where host is not present
                        session.mute({ audio: true })
                    }
                    
                    console.log(`[doConference] ✓ Session ${session._id} conference setup completed`)
                } catch (error) {
                    console.error(`[doConference] ERROR: Failed to replace track for session ${session._id}:`, error)
                }
            } else {
                console.error(`[doConference] ERROR: Cannot replace track for session ${session._id} - missing sender or mixed track`, {
                    hasSender: !!sender,
                    hasTrack: !!mixedTracks[0]
                })
            }
        })
        
        console.log(`[doConference] === CONFERENCE SETUP COMPLETED ===`)
        console.log(`[doConference] Final conference state for room ${roomId}:`, {
            totalSessions: sessions.length,
            sourceNodes: nodes.sources.size,
            destinationNodes: nodes.destinations.size,
            gainNodes: nodes.gains.size,
            isHostRoom
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
        console.log('[setActiveRoom] will set active room to be:', roomId)

        const oldRoomId = this.currentActiveRoomId

        if (roomId === oldRoomId) {
            console.log('[setActiveRoom] changing to same room so will ignore')
            return
        }

        this.currentActiveRoomId = roomId

        console.log('[setActiveRoom] changed active room, now will reconfigure old room')
        await this.roomReconfigure(oldRoomId)
        console.log('[setActiveRoom] reconfigured old room, now will reconfigure new room')
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
            session.once('confirmed', () => {
                this.startCallTimer(session.id)
            })

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

            if (session.id === this.callAddingInProgress) {
                this.callAddingInProgress = undefined
            }
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
        console.log(`[setupStream] Setting up new media stream`)
        console.log(`[setupStream] Media constraints:`, this.getUserMediaConstraints)
        
        try {
            const streamStart = Date.now()
            const stream = await navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
            console.log(`[setupStream] Stream obtained in ${Date.now() - streamStart}ms:`, {
                trackCount: stream.getTracks().length,
                audioTracks: stream.getAudioTracks().length,
                videoTracks: stream.getVideoTracks().length,
                trackIds: stream.getTracks().map(t => `${t.kind}:${t.id}`)
            })

            if (this.initialStreamValue) {
                console.log(`[setupStream] Stopping existing initial stream tracks`)
                const tracksToStop = this.initialStreamValue.getTracks()
                tracksToStop.forEach((track, index) => {
                    console.log(`[setupStream] Stopping track ${index + 1}/${tracksToStop.length}: ${track.kind}:${track.id}`)
                    track.stop()
                })
                this.initialStreamValue = null
                console.log(`[setupStream] ✓ Previous stream cleaned up`)
            }
            
            this.initialStreamValue = stream
            console.log(`[setupStream] ✓ New initial stream set`)
        } catch (error) {
            console.error(`[setupStream] ERROR: Failed to get user media:`, error)
            throw error
        }
    }

    private async triggerAddStream (event: RTCTrackEvent, call: ICall) {
        console.log(`[triggerAddStream] === STARTING ADD STREAM FOR CALL ${call._id} ===`)
        console.log(`[triggerAddStream] AudioContext debug info:`, this.managedAudioContext.getDebugInfo())
        
        const muteState = this.muteWhenJoin || this.isMuted
        console.log(`[triggerAddStream] Setting muted state: ${muteState} (muteWhenJoin=${this.muteWhenJoin}, isMuted=${this.isMuted})`)
        this.setIsMuted(muteState)

        if (!this.initialStreamValue) {
            console.log(`[triggerAddStream] No initial stream, setting up new stream`)
            await this.setupStream()
            console.log(`[triggerAddStream] Initial stream setup completed`)
        } else {
            console.log(`[triggerAddStream] Using existing initial stream:`, {
                trackCount: this.initialStreamValue.getTracks().length,
                audioTracks: this.initialStreamValue.getAudioTracks().length,
                trackIds: this.initialStreamValue.getTracks().map(t => t.id)
            })
        }

        console.log(`[triggerAddStream] Processing audio volume with level: ${this.microphoneInputLevel}`)
        const audioContextStart = Date.now()
        const audioContext = await this.managedAudioContext.getContext()
        console.log(`[triggerAddStream] AudioContext obtained in ${Date.now() - audioContextStart}ms, state: ${audioContext.state}`)
        
        const processedStream = await processAudioVolume(audioContext, this.initialStreamValue, this.microphoneInputLevel * 2)
        const muteMicro = this.isMuted || this.muteWhenJoin
        
        console.log(`[triggerAddStream] Processed stream details:`, {
            hasStream: !!processedStream,
            trackCount: processedStream?.getTracks().length,
            audioTracks: processedStream?.getAudioTracks().length,
            muteMicro
        })

        processedStream.getTracks().forEach((track, index) => {
            const wasEnabled = track.enabled
            track.enabled = !muteMicro
            console.log(`[triggerAddStream] Track ${index + 1} (${track.id}): enabled ${wasEnabled} → ${track.enabled}`)
        })
        
        await this.setActiveStream(processedStream)
        console.log(`[triggerAddStream] Active stream set`)
        
        const senders = call.connection.getSenders()
        const firstSender = senders[0]
        console.log(`[triggerAddStream] Replacing track for call ${call._id}:`, {
            senderCount: senders.length,
            hasFirstSender: !!firstSender,
            trackToReplace: processedStream.getTracks()[0]?.id
        })
        
        await firstSender.replaceTrack(processedStream.getTracks()[0])
        console.log(`[triggerAddStream] ✓ Track replaced for call ${call._id}`)

        const stream = new MediaStream([ event.track ])

        syncStream(stream, call, this.selectedOutputDevice, this.speakerVolume)

        // IMPORTANT: Check if we should hear this call
        const shouldHearThisCall = call.roomId === this.currentActiveRoomId

        if (call.audioTag) {
            call.audioTag.muted = !shouldHearThisCall
        }

        await this.setupVUMeter(stream, call._id)
        this.getCallQuality(call)
        this.updateCall(call)
    }

    //@requireInitialization()
    public initCall (target: string, addToCurrentRoom: boolean, holdOtherCalls = false) {
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
        console.log(`[processRoomChange] === STARTING ROOM CHANGE PROCESS ===`)
        console.log(`[processRoomChange] Target: callId=${callId}, roomId=${roomId}`)
        
        const call = this.extendedCalls[callId]
        if (!call) {
            console.error(`[processRoomChange] ERROR: Call not found in extendedCalls: ${callId}`)
            return
        }

        const oldRoomId = call.roomId
        const connectionState = call.connection?.connectionState
        const audioTag = call.audioTag
        
        console.log(`[processRoomChange] Call details:`, {
            callId,
            oldRoomId,
            newRoomId: roomId,
            connectionState,
            hasAudioTag: !!audioTag,
            audioTagMuted: audioTag?.muted,
            isOnHold: call.isOnHold(),
            currentActiveRoom: this.currentActiveRoomId
        })

        // Count calls in both rooms before change
        const oldRoomCalls = Object.values(this.extendedCalls).filter(c => c.roomId === oldRoomId)
        const newRoomCalls = Object.values(this.extendedCalls).filter(c => c.roomId === roomId)
        console.log(`[processRoomChange] Room populations BEFORE change: oldRoom(${oldRoomId})=${oldRoomCalls.length} calls, newRoom(${roomId})=${newRoomCalls.length} calls`)

        call.roomId = roomId
        console.log(`[processRoomChange] ✓ Room ID updated for call ${callId}: ${oldRoomId} → ${roomId}`)

        this.updateCall(call)
        console.log(`[processRoomChange] ✓ Call state updated and emitted`)

        // Count calls after change
        const oldRoomCallsAfter = Object.values(this.extendedCalls).filter(c => c.roomId === oldRoomId)
        const newRoomCallsAfter = Object.values(this.extendedCalls).filter(c => c.roomId === roomId)
        console.log(`[processRoomChange] Room populations AFTER change: oldRoom(${oldRoomId})=${oldRoomCallsAfter.length} calls, newRoom(${roomId})=${newRoomCallsAfter.length} calls`)

        console.log(`[processRoomChange] >>> RECONFIGURING OLD ROOM ${oldRoomId} <<<`)
        const oldRoomStart = Date.now()
        await this.roomReconfigure(oldRoomId)
        console.log(`[processRoomChange] ✓ Old room ${oldRoomId} reconfigured in ${Date.now() - oldRoomStart}ms`)
        
        console.log(`[processRoomChange] >>> RECONFIGURING NEW ROOM ${roomId} <<<`) 
        const newRoomStart = Date.now()
        await this.roomReconfigure(roomId)
        console.log(`[processRoomChange] ✓ New room ${roomId} reconfigured in ${Date.now() - newRoomStart}ms`)

        // Commented out because roomReconfigure for old and current room also called in setActiveRoom and deleteRoomIfEmpty is called in each roomReconfigure method when room has no calls
        // return Promise.all([
        //     this.roomReconfigure(oldRoomId),
        //     this.roomReconfigure(roomId)
        // ]).then(() => {
        //     this.deleteRoomIfEmpty(oldRoomId)
        //     this.deleteRoomIfEmpty(roomId)
        // })
    }
}
