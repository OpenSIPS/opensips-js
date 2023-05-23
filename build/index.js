'use strict'
var __createBinding = (this && this.__createBinding) || (Object.create ? (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k
    var desc = Object.getOwnPropertyDescriptor(m, k)
    if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function () { return m[k] } }
    }
    Object.defineProperty(o, k2, desc)
}) : (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k
    o[k2] = m[k]
}))
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function (o, v) {
    Object.defineProperty(o, 'default', { enumerable: true, value: v })
}) : function (o, v) {
    o['default'] = v
})
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod
    var result = {}
    if (mod != null) for (var k in mod) if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k)
    __setModuleDefault(result, mod)
    return result
}
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt (value) { return value instanceof P ? value : new P(function (resolve) { resolve(value) }) }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled (value) { try { step(generator.next(value)) } catch (e) { reject(e) } }
        function rejected (value) { try { step(generator['throw'](value)) } catch (e) { reject(e) } }
        function step (result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected) }
        step((generator = generator.apply(thisArg, _arguments || [])).next())
    })
}
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { 'default': mod }
}
Object.defineProperty(exports, '__esModule', { value: true })
exports.CALL_EVENT_LISTENER_TYPE = void 0
// @ts-nocheck
const jssip_1 = __importStar(require('jssip'))
const p_iteration_1 = require('p-iteration')
const time_helper_1 = require('./helpers/time.helper')
const filter_helper_1 = require('./helpers/filter.helper')
const metrics_1 = __importDefault(require('./helpers/webrtcmetrics/metrics'))
const metric_keys_to_include_1 = require('./enum/metric.keys.to.include')
const CALL_STATUS_UNANSWERED = 0
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
const CALL_KEYS_TO_INCLUDE = [
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
/* Helpers */
function simplifyCallObject (call) {
    //const simplified: { [key: string]: ICall[ICallKey] } = {}
    const simplified = {}
    CALL_KEYS_TO_INCLUDE.forEach(key => {
        if (call[key] !== undefined) {
            simplified[key] = call[key]
        }
    })
    simplified.localHold = call._localHold
    return simplified
}
function processAudioVolume (stream, volume) {
    const audioContext = new AudioContext()
    const audioSource = audioContext.createMediaStreamSource(stream)
    const audioDestination = audioContext.createMediaStreamDestination()
    const gainNode = audioContext.createGain()
    audioSource.connect(gainNode)
    gainNode.connect(audioDestination)
    gainNode.gain.value = volume
    return audioDestination.stream
}
function syncStream (event, call, outputDevice, volume) {
    const audio = document.createElement('audio')
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
exports.CALL_EVENT_LISTENER_TYPE = {
    NEW_CALL: 'new_call',
    CALL_CONFIRMED: 'confirmed',
    CALL_FAILED: 'failed',
    CALL_PROGRESS: 'progress',
    CALL_ENDED: 'ended'
}
const activeCalls = {}
class OpenSIPSJS extends jssip_1.UA {
    constructor (options) {
        const configuration = Object.assign(Object.assign({}, options.configuration), { sockets: options.socketInterfaces.map(sock => new jssip_1.default.WebSocketInterface(sock)) })
        super(configuration)
        this.initialized = false
        this.newRTCSessionEventName = 'newRTCSession'
        this.activeCalls = {}
        this.state = {
            isMuted: false,
            activeCalls: {},
            availableMediaDevices: [],
            selectedMediaDevices: {
                input: 'default',
                output: 'default' //localStorage.getItem(STORAGE_KEYS.SELECTED_OUTPUT_DEVICE) || 'default'
            },
            microphoneInputLevel: 2,
            speakerVolume: 1,
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
        this.options = options
    }
    on (type, listener) {
        return super.on(type, listener)
    }
    off (type, listener) {
        return super.off(type, listener)
    }
    emit (type, args) {
        return super.emit(type, args)
    }
    get sipDomain () {
        return this.options.sipDomain
    }
    get sipOptions () {
        const options = Object.assign(Object.assign({}, this.options.sipOptions), { mediaConstraints: this.getUserMediaConstraints })
        return options
    }
    get currentActiveRoomId () {
        return this._currentActiveRoomId
    }
    set currentActiveRoomId (roomId) {
        this._currentActiveRoomId = roomId
        this.emit('currentActiveRoomChanged', roomId)
    }
    get callAddingInProgress () {
        return this._callAddingInProgress
    }
    set callAddingInProgress (value) {
        this._callAddingInProgress = value
        this.emit('callAddingInProgressChanged', value)
    }
    get muteWhenJoin () {
        return this.state.muteWhenJoin
    }
    set muteWhenJoin (value) {
        this.state.muteWhenJoin = value
        this.emit('changeMuteWhenJoin', value)
    }
    get isDND () {
        return this.state.isDND
    }
    set isDND (value) {
        this.state.isDND = value
        this.emit('changeIsDND', value)
    }
    get speakerVolume () {
        return this.state.speakerVolume
    }
    set speakerVolume (value) {
        this.state.speakerVolume = value
        Object.values(activeCalls).forEach((call) => {
            if (call.audioTag) {
                call.audioTag.volume = value
            }
        })
    }
    get microphoneInputLevel () {
        return this.state.microphoneInputLevel
    }
    set microphoneInputLevel (value) {
        this.state.microphoneInputLevel = value
        this.roomReconfigure(this.currentActiveRoomId)
    }
    get getActiveCalls () {
        return this.state.activeCalls
    }
    get getActiveRooms () {
        return this.state.activeRooms
    }
    get isMuted () {
        return this.state.isMuted
    }
    set isMuted (value) {
        this.state.isMuted = value
        this.emit('changeIsMuted', value)
    }
    get getInputDeviceList () {
        return this.state.availableMediaDevices.filter(device => device.kind === 'audioinput')
    }
    get getOutputDeviceList () {
        return this.state.availableMediaDevices.filter(device => device.kind === 'audiooutput')
    }
    /*getInputDeviceList: (state) => {
        return state.availableMediaDevices.filter(device => device.kind === 'audioinput');
    },
    getOutputDeviceList: (state) => {
        return state.availableMediaDevices.filter(device => device.kind === 'audiooutput');
    }*/
    get getUserMediaConstraints () {
        return {
            audio: {
                deviceId: {
                    exact: this.state.selectedMediaDevices.input
                }
            },
            video: false
        }
    }
    get getInputDefaultDevice () {
        return this.getInputDeviceList.find(device => device.deviceId === 'default')
    }
    get getOutputDefaultDevice () {
        return this.getOutputDeviceList.find(device => device.deviceId === 'default')
    }
    get selectedInputDevice () {
        return this.state.selectedMediaDevices.input
    }
    set selectedInputDevice (deviceId) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_INPUT_DEVICE, deviceId)
        this.state.selectedMediaDevices.input = deviceId
        this.emit('changeActiveInputMediaDevice', deviceId)
    }
    get selectedOutputDevice () {
        return this.state.selectedMediaDevices.output
    }
    set selectedOutputDevice (deviceId) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_OUTPUT_DEVICE, deviceId)
        this.state.selectedMediaDevices.output = deviceId
        this.emit('changeActiveOutputMediaDevice', deviceId)
    }
    get originalStream () {
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
    setAvailableMediaDevices (devices) {
        this.state.availableMediaDevices = devices
        this.emit('changeAvailableDeviceList', devices)
    }
    updateDeviceList () {
        return __awaiter(this, void 0, void 0, function* () {
            yield navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
            const devices = yield navigator.mediaDevices.enumerateDevices()
            //commit(STORE_MUTATION_TYPES.SET_MEDIA_DEVICES, devices)
            //this.state.availableMediaDevices = devices
            this.setAvailableMediaDevices(devices)
        })
    }
    setMediaDevices (setDefaults = false) {
        var _a, _b
        return __awaiter(this, void 0, void 0, function* () {
            this.state.selectedMediaDevices.input = localStorage.getItem(STORAGE_KEYS.SELECTED_INPUT_DEVICE) || 'default'
            this.state.selectedMediaDevices.output = localStorage.getItem(STORAGE_KEYS.SELECTED_OUTPUT_DEVICE) || 'default'
            yield navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
            const devices = yield navigator.mediaDevices.enumerateDevices()
            //commit(STORE_MUTATION_TYPES.SET_MEDIA_DEVICES, devices)
            //this.state.availableMediaDevices = devices
            this.setAvailableMediaDevices(devices)
            const defaultMicrophone = setDefaults
                ? ((_a = this.getInputDefaultDevice) === null || _a === void 0 ? void 0 : _a.deviceId) || ''
                : ''
            const defaultSpeaker = setDefaults
                ? ((_b = this.getOutputDefaultDevice) === null || _b === void 0 ? void 0 : _b.deviceId) || ''
                : ''
            //dispatch('setMicrophone', defaultMicrophone)
            yield this.setMicrophone(defaultMicrophone)
            //dispatch('setSpeaker', defaultSpeaker)
            yield this.setSpeaker(defaultSpeaker)
        })
    }
    setCallTime (value) {
        const time = Object.assign({}, value)
        delete time.callId
        this.state.callTime = Object.assign(Object.assign({}, this.state.callTime), { [value.callId]: time })
    }
    removeCallTime (callId) {
        const callTimeCopy = Object.assign({}, this.state.callTime)
        delete callTimeCopy[callId]
        this.state.callTime = Object.assign({}, callTimeCopy)
    }
    setTimeInterval (callId, interval) {
        this.state.timeIntervals = Object.assign(Object.assign({}, this.state.timeIntervals), { [callId]: interval })
    }
    removeTimeInterval (callId) {
        const timeIntervalsCopy = Object.assign({}, this.state.timeIntervals)
        clearInterval(timeIntervalsCopy[callId])
        delete timeIntervalsCopy[callId]
        this.state.timeIntervals = Object.assign({}, timeIntervalsCopy)
    }
    _stopCallTimer (callId) {
        //commit(STORE_MUTATION_TYPES.REMOVE_TIME_INTERVAL, callId)
        //commit(STORE_MUTATION_TYPES.REMOVE_CALL_TIME, callId)
        this.removeTimeInterval(callId)
        this.removeCallTime(callId)
    }
    setMetricsConfig (config) {
        this.state.metricConfig = Object.assign(Object.assign({}, this.state.metricConfig), config)
    }
    sendDTMF (callId, value) {
        const validation_regex = /^[A-D0-9]+$/g
        if (!validation_regex.test(value)) {
            throw new Error('Not allowed character in DTMF input')
        }
        const call = activeCalls[callId]
        call.sendDTMF(value)
    }
    doMute (value) {
        const activeRoomId = this.currentActiveRoomId
        //commit(STORE_MUTATION_TYPES.SET_MUTED, muted)
        this.isMuted = value
        //dispatch('_roomReconfigure', activeRoomId)
        this.roomReconfigure(activeRoomId)
    }
    doCallHold ({ callId, toHold, automatic }) {
        const call = activeCalls[callId]
        call._automaticHold = automatic !== null && automatic !== void 0 ? automatic : false
        if (toHold) {
            call.hold()
        }
        else {
            call.unhold()
        }
    }
    _cancelAllOutgoingUnanswered () {
        Object.values(this.getActiveCalls).filter(call => {
            return call.direction === 'outgoing'
                && call.status === CALL_STATUS_UNANSWERED
        }).forEach(call => this.callTerminate(call._id))
    }
    callAnswer (callId) {
        const call = activeCalls[callId]
        //dispatch('_cancelAllOutgoingUnanswered')
        this._cancelAllOutgoingUnanswered()
        call.answer(this.sipOptions)
        //commit(STORE_MUTATION_TYPES.UPDATE_CALL, call)
        this.updateCall(call)
        //dispatch('setCurrentActiveRoom', call.roomId) //TODO: move to top
        this.setCurrentActiveRoomId(call.roomId)
        call.connection.addEventListener('addstream', (event) => __awaiter(this, void 0, void 0, function* () {
            //dispatch('_triggerAddStream', {event, call})
            this._triggerAddStream(event, call)
        }))
    }
    callMove (callId, roomId) {
        return __awaiter(this, void 0, void 0, function* () {
            // commit(STORE_MUTATION_TYPES.UPDATE_CALL_STATUS, { callId, isMoving: true });
            this._updateCallStatus({ callId, isMoving: true })
            //await dispatch('callChangeRoom', {callId, roomId})
            yield this.callChangeRoom({ callId, roomId })
            // commit(STORE_MUTATION_TYPES.UPDATE_CALL_STATUS, { callId, isMoving: false });
            this._updateCallStatus({ callId, isMoving: false })
        })
    }
    updateCall (value) {
        /*this.state.activeCalls = {
            ...this.state.activeCalls,
            [value._id]: simplifyCallObject(value)
        }*/
        this.state.activeCalls[value._id] = simplifyCallObject(value)
        this.emit('changeActiveCalls', this.state.activeCalls)
    }
    updateRoom (value) {
        const room = this.state.activeRooms[value.roomId]
        const newRoomData = Object.assign(Object.assign({}, room), value)
        this.state.activeRooms = Object.assign(Object.assign({}, this.state.activeRooms), { [value.roomId]: Object.assign({}, newRoomData) })
        this.emit('updateRoom', { room: newRoomData, roomList: this.state.activeRooms })
    }
    _addCall (value) {
        this.state.activeCalls = Object.assign(Object.assign({}, this.state.activeCalls), { [value._id]: simplifyCallObject(value) })
        activeCalls[value._id] = value
        this.emit('changeActiveCalls', this.state.activeCalls)
    }
    _addCallStatus (callId) {
        this.state.callStatus = Object.assign(Object.assign({}, this.state.callStatus), { [callId]: {
            isMoving: false,
            isTransferring: false,
            isMerging: false
        } })
    }
    _updateCallStatus (value) {
        const prevStatus = Object.assign({}, this.state.callStatus[value.callId])
        //const newStatus = { ...value }
        /*const newStatus: ICallStatus = {
            isMoving: value.isMoving,
            isTransferring: value.isTransferring,
            isMerging: value.isMerging
        }*/
        const newStatus = Object.assign({}, prevStatus)
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
        this.state.callStatus = Object.assign(Object.assign({}, this.state.callStatus), { [value.callId]: Object.assign({}, newStatus) })
    }
    _removeCallStatus (callId) {
        const callStatusCopy = Object.assign({}, this.state.callStatus)
        delete callStatusCopy[callId]
        this.state.callStatus = Object.assign({}, callStatusCopy)
    }
    _addRoom (value) {
        this.state.activeRooms = Object.assign(Object.assign({}, this.state.activeRooms), { [value.roomId]: value })
        this.emit('addRoom', { room: value, roomList: this.state.activeRooms })
    }
    setMicrophone (dId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.getInputDeviceList.find(({ deviceId }) => deviceId === dId)) {
                return
            }
            this.selectedInputDevice = dId
            let stream // = null
            try {
                stream = yield navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
            }
            catch (err) {
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
            }
            else {
                yield this._doConference(callsInCurrentRoom)
            }
        })
    }
    _setOriginalStream (value) {
        this.state.originalStream = value
        this.emit('changeOriginalStream', value)
    }
    setSpeaker (dId) {
        return __awaiter(this, void 0, void 0, function* () {
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
                    var _a;
                    (_a = call.audioTag) === null || _a === void 0 ? void 0 : _a.setSinkId(dId)
                    //commit(STORE_MUTATION_TYPES.UPDATE_CALL, call)
                    this.updateCall(call)
                })
            }
            else {
                yield this._doConference(callsInCurrentRoom)
            }
        })
    }
    /*private deleteRoom (roomId: number) {
        delete this.activeRooms[roomId]
        this.emit('roomDeleted', roomId)
    }*/
    removeRoom (roomId) {
        const activeRoomsCopy = Object.assign({}, this.state.activeRooms)
        const roomToRemove = Object.assign({}, activeRoomsCopy[roomId])
        delete activeRoomsCopy[roomId]
        this.state.activeRooms = Object.assign({}, activeRoomsCopy)
        this.emit('removeRoom', { room: roomToRemove, roomList: this.state.activeRooms })
    }
    deleteRoomIfEmpty (roomId) {
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
    checkInitialized () {
        if (!this.initialized) {
            throw new Error('[OpenSIPSJS] You must call `start` method first!')
        }
    }
    muteReconfigure (call) {
        if (this.state.isMuted) {
            call.mute({ audio: true })
        }
        else {
            call.unmute({ audio: true })
        }
    }
    roomReconfigure (roomId) {
        return __awaiter(this, void 0, void 0, function* () {
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
            }
            else {
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
            }
            else if (callsInRoom.length === 1 && this.currentActiveRoomId !== roomId) {
                if (!callsInRoom[0].isOnHold()) {
                    this.doCallHold({ callId: callsInRoom[0].id, toHold: true, automatic: true })
                }
            }
            else if (callsInRoom.length === 1 && this.currentActiveRoomId === roomId) {
                if (callsInRoom[0].isOnHold() && callsInRoom[0]._automaticHold) {
                    this.doCallHold({ callId: callsInRoom[0].id, toHold: false })
                }
                let stream
                try {
                    stream = yield navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
                }
                catch (err) {
                    console.error(err)
                }
                if (stream && callsInRoom[0].connection && callsInRoom[0].connection.getSenders()[0]) {
                    const processedStream = processAudioVolume(stream, this.microphoneInputLevel)
                    processedStream.getTracks().forEach(track => track.enabled = !this.state.isMuted)
                    //dispatch('_setOriginalStream', processedStream)
                    this._setOriginalStream(processedStream)
                    yield callsInRoom[0].connection.getSenders()[0].replaceTrack(processedStream.getTracks()[0])
                    this.muteReconfigure(callsInRoom[0])
                }
            }
            else if (callsInRoom.length > 1) {
                //await dispatch('_doConference', callsInRoom)
                yield this._doConference(callsInRoom)
            }
        })
    }
    _doConference (sessions) {
        return __awaiter(this, void 0, void 0, function* () {
            sessions.forEach(call => {
                if (call._localHold) {
                    //dispatch('doCallHold', { callId: call._id, toHold: false })
                    this.doCallHold({ callId: call._id, toHold: false })
                }
            })
            // Take all received tracks from the sessions you want to merge
            const receivedTracks = []
            sessions.forEach(session => {
                if (session !== null && session !== undefined) {
                    session.connection.getReceivers().forEach((receiver) => {
                        receivedTracks.push(receiver.track)
                    })
                }
            })
            // Use the Web Audio API to mix the received tracks
            const audioContext = new AudioContext()
            const allReceivedMediaStreams = new MediaStream()
            // For each call we will build dedicated mix for all other calls
            yield (0, p_iteration_1.forEach)(sessions, (session) => __awaiter(this, void 0, void 0, function* () {
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
                    const stream = yield navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
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
                    yield session.connection.getSenders()[0].replaceTrack(mixedOutput.stream.getTracks()[0])
                    //dispatch('_muteReconfigure', session)
                    this._muteReconfigure(session)
                }
            }))
        })
    }
    _muteReconfigure (call) {
        if (this.isMuted) {
            call.mute({ audio: true })
        }
        else {
            call.unmute({ audio: true })
        }
    }
    muteCaller (callId, value) {
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
    callTerminate (callId) {
        const call = activeCalls[callId]
        if (call._status !== 8) {
            call.terminate()
        }
    }
    callTransfer (callId, target) {
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
    callMerge (roomId) {
        const callsInRoom = Object.values(activeCalls).filter((call) => call.roomId === roomId)
        if (callsInRoom.length !== 2)
            return
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
    setDND (value) {
        this.isDND = value
    }
    _startCallTimer (callId) {
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
            const callTime = Object.assign({}, this.state.callTime[callId])
            const updatedTime = (0, time_helper_1.setupTime)(callTime)
            //commit(STORE_MUTATION_TYPES.SET_CALL_TIME, { callId, ...updatedTime })
            this.setCallTime(Object.assign({ callId }, updatedTime))
        }, 1000)
        //commit(STORE_MUTATION_TYPES.SET_TIME_INTERVAL, { callId, interval })
        this.setTimeInterval(callId, interval)
    }
    setCurrentActiveRoomId (roomId) {
        return __awaiter(this, void 0, void 0, function* () {
            const oldRoomId = this.currentActiveRoomId
            if (roomId === oldRoomId) {
                return
            }
            this.currentActiveRoomId = roomId
            yield this.roomReconfigure(oldRoomId)
            yield this.roomReconfigure(roomId)
            //await dispatch('roomReconfigure', oldRoomId)
            //await dispatch('roomReconfigure', roomId)
        })
    }
    getNewRoomId () {
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
    subscribe (type, listener) {
        const isListenerEmpty = !this.state.listeners[type] || !this.state.listeners[type].length
        const newListeners = isListenerEmpty ? [ listener ] : [ ...this.state.listeners[type], listener ]
        this.state.listeners = Object.assign(Object.assign({}, this.state.listeners), { [type]: newListeners })
    }
    removeIListener (value) {
        const listenersCopy = Object.assign({}, this.state.listeners)
        delete listenersCopy[value]
        this.state.listeners = Object.assign({}, listenersCopy)
    }
    addCall (session) {
        return __awaiter(this, void 0, void 0, function* () {
            const sessionAlreadyInActiveCalls = this.getActiveCalls[session.id]
            if (sessionAlreadyInActiveCalls !== undefined) {
                return
            }
            const roomId = this.getNewRoomId()
            const newRoomInfo = {
                started: new Date(),
                incomingInProgress: false,
                roomId
            }
            if (session.direction === 'incoming') {
                newRoomInfo.incomingInProgress = true
                //this.on('callConfirmed',)
                this.subscribe(exports.CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED, (call) => {
                    if (session.id === call.id) {
                        /*commit(STORE_MUTATION_TYPES.UPDATE_ROOM, {
                            incomingInProgress: false,
                            roomId
                        })*/
                        this.updateRoom({
                            incomingInProgress: false,
                            roomId
                        })
                        //dispatch('_startCallTimer', session.id)
                        this._startCallTimer(session.id)
                    }
                })
                this.subscribe(exports.CALL_EVENT_LISTENER_TYPE.CALL_FAILED, (call) => {
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
            }
            else if (session.direction === 'outgoing') {
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
            const call = session
            call.roomId = roomId
            call.localMuted = false
            //commit(STORE_MUTATION_TYPES.ADD_CALL, call)
            this._addCall(call)
            //commit(STORE_MUTATION_TYPES.ADD_CALL_STATUS, session.id)
            this._addCallStatus(session.id)
            //commit(STORE_MUTATION_TYPES.ADD_ROOM, newRoomInfo)
            this._addRoom(newRoomInfo)
        })
    }
    _triggerListener ({ listenerType, session, event }) {
        const listeners = this.state.listeners[listenerType]
        if (!listeners || !listeners.length) {
            return
        }
        listeners.forEach((listener) => {
            listener(session, event)
        })
    }
    _removeCall (value) {
        const stateActiveCallsCopy = Object.assign({}, this.state.activeCalls)
        delete stateActiveCallsCopy[value]
        delete activeCalls[value]
        this.state.activeCalls = Object.assign({}, stateActiveCallsCopy)
        this.emit('changeActiveCalls', this.state.activeCalls)
    }
    _activeCallListRemove (call) {
        const callRoomIdToConfigure = activeCalls[call._id].roomId
        //commit(STORE_MUTATION_TYPES.REMOVE_CALL, call._id)
        this._removeCall(call._id)
        //dispatch('_roomReconfigure', callRoomIdToConfigure)
        this.roomReconfigure(callRoomIdToConfigure)
    }
    newRTCSessionCallback (event) {
        const session = event.session
        if (this.isDND) {
            session.terminate({ status_code: 486, reason_phrase: 'Do Not Disturb' })
            return
        }
        // stop timers on ended and failed
        session.on('ended', (event) => {
            //console.log('ended', event)
            //dispatch('_triggerListener', { listenerType: CALL_EVENT_LISTENER_TYPE.CALL_ENDED, session, event })
            this._triggerListener({ listenerType: exports.CALL_EVENT_LISTENER_TYPE.CALL_ENDED, session, event })
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
        session.on('progress', (event) => {
            //console.log('progress', event)
            //dispatch('_triggerListener', { listenerType: CALL_EVENT_LISTENER_TYPE.CALL_PROGRESS, session, event })
            this._triggerListener({ listenerType: exports.CALL_EVENT_LISTENER_TYPE.CALL_PROGRESS, session, event })
        })
        session.on('failed', (event) => {
            //dispatch('_triggerListener', { listenerType: CALL_EVENT_LISTENER_TYPE.CALL_FAILED, session, event })
            this._triggerListener({ listenerType: exports.CALL_EVENT_LISTENER_TYPE.CALL_FAILED, session, event })
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
        session.on('confirmed', (event) => {
            //dispatch('_triggerListener', { listenerType: CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED, session, event })
            this._triggerListener({ listenerType: exports.CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED, session, event })
            //commit(STORE_MUTATION_TYPES.UPDATE_CALL, session)
            this.updateCall(session)
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
    setInitialized () {
        this.initialized = true
        this.emit('ready', true)
    }
    start () {
        this.on(this.newRTCSessionEventName, this.newRTCSessionCallback.bind(this))
        super.start()
        this.setInitialized()
        //this.setDefaultMediaDevices()
        this.setMediaDevices(true)
        return this
    }
    setMuteWhenJoin (value) {
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
    _setCallMetrics (value) {
        const metrics = Object.assign({}, value)
        delete metrics['callId']
        this.state.callMetrics = Object.assign(Object.assign({}, this.state.callMetrics), { [value.callId]: metrics })
    }
    _removeCallMetrics (callId) {
        const callMetricsCopy = Object.assign({}, this.state.callMetrics)
        delete callMetricsCopy[callId]
        this.state.callMetrics = Object.assign({}, callMetricsCopy)
    }
    _getCallQuality (call) {
        const metrics = new metrics_1.default(this.state.metricConfig)
        const probe = metrics.createProbe(call.connection, {
            cid: call._id
        })
        const inboundKeys = []
        let inboundAudio
        probe.onreport = (probe) => {
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
            const inboundAudioMetric = probe.audio[inboundAudio]
            const metric = (0, filter_helper_1.filterObjectKeys)(inboundAudioMetric, metric_keys_to_include_1.METRIC_KEYS_TO_INCLUDE)
            metric.callId = call._id
            //commit(STORE_MUTATION_TYPES.SET_CALL_METRICS, metrics)
            this._setCallMetrics(metrics)
        }
        this.subscribe(exports.CALL_EVENT_LISTENER_TYPE.CALL_ENDED, (session) => {
            if (session._id === call._id) {
                metrics.stopAllProbes()
            }
        })
        metrics.startAllProbes()
    }
    _triggerAddStream (event, call) {
        return __awaiter(this, void 0, void 0, function* () {
            //commit(STORE_MUTATION_TYPES.SET_MUTED, this.muteWhenJoin)
            this.isMuted = this.muteWhenJoin
            const stream = yield navigator.mediaDevices.getUserMedia(this.getUserMediaConstraints)
            const processedStream = processAudioVolume(stream, this.microphoneInputLevel)
            const muteMicro = this.isMuted || this.muteWhenJoin
            processedStream.getTracks().forEach(track => track.enabled = !muteMicro)
            //dispatch('_setOriginalStream', processedStream)
            this._setOriginalStream(processedStream)
            yield call.connection.getSenders()[0].replaceTrack(processedStream.getTracks()[0])
            syncStream(event, call, this.selectedOutputDevice, this.speakerVolume)
            //dispatch('_getCallQuality', call)
            this._getCallQuality(call)
            //commit(STORE_MUTATION_TYPES.UPDATE_CALL, call)
            this.updateCall(call)
        })
    }
    doCall ({ target, addToCurrentRoom }) {
        this.checkInitialized()
        if (target.length === 0) {
            return console.error('Target must be a valid string')
        }
        const call = this.call(`sip:${target}@${this.sipDomain}`, this.sipOptions)
        this.callAddingInProgress = call.id
        if (addToCurrentRoom && this.currentActiveRoomId !== undefined) {
            this.callChangeRoom({
                callId: call.id,
                roomId: this.currentActiveRoomId
            })
        }
        call.connection.addEventListener('addstream', (event) => {
            // dispatch('_triggerAddStream', { event, call })
            this._triggerAddStream(event, call)
        })
    }
    callChangeRoom ({ callId, roomId }) {
        return __awaiter(this, void 0, void 0, function* () {
            const oldRoomId = activeCalls[callId].roomId
            activeCalls[callId].roomId = roomId
            yield this.setCurrentActiveRoomId(roomId)
            return Promise.all([
                this.roomReconfigure(oldRoomId),
                this.roomReconfigure(roomId)
            ]).then(() => {
                this.deleteRoomIfEmpty(oldRoomId)
                this.deleteRoomIfEmpty(roomId)
            })
        })
    }
}
exports.default = OpenSIPSJS
