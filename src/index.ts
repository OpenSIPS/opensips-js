import JsSIP, { UA } from 'jssip'
import {
    ExtraHeaders,
    IncomingAckEvent,
    IncomingEvent,
    OutgoingAckEvent,
    OutgoingEvent,
    RTCSession,
    SessionDirection
} from 'jssip/lib/RTCSession'
import { RTCSessionEvent, UAConfiguration, UAEventMap } from 'jssip/lib/UA'

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
export type TestEventListener = (event: { test: string }) => void
export type ActiveRoomListener = (event: number | undefined) => void
export type CallAddingProgressListener = (callId: string | undefined) => void
export type RoomDeletedListener = (roomId: number) => void
export interface OpenSIPSEventMap extends UAEventMap {
    callConfirmed: TestEventListener
    currentActiveRoomChanged: ActiveRoomListener
    callAddingInProgressChanged: CallAddingProgressListener
    roomDeleted: RoomDeletedListener
}

export type ListenersKeyType = keyof OpenSIPSEventMap
export type ListenersCallbackFnType = OpenSIPSEventMap[ListenersKeyType]
export type ListenerCallbackFnType<T extends ListenersKeyType> = OpenSIPSEventMap[T]

export interface IDoCallParam {
    target: string
    addToCurrentRoom: boolean
}
export interface ICall extends RTCSession {
    roomId: number
    localMuted: boolean
    audioTag?: HTMLAudioElement
}
export interface IRoom {
    started: Date
    incomingInProgress: boolean
    roomId: number
}

class OpenSIPSJS extends UA {
    private initialized = false

    private readonly options: IOpenSIPSJSOptions
    private readonly newRTCSessionEventName: ListenersKeyType = 'newRTCSession'
    private readonly activeCalls: { [key: string]: ICall } = {}
    private readonly activeRooms: { [key: number]: IRoom } = {}
    private _currentActiveRoomId: number | undefined
    private _callAddingInProgress: string | undefined
    private state = {
        isMuted: false
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
        return this.options.sipOptions
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

    public doCallHold ({ callId, toHold, automatic }: { callId: string, toHold: boolean, automatic?: boolean }) {
        const call = this.activeCalls[callId]
        call._automaticHold = automatic ?? false

        if (toHold) {
            call.hold()
        } else {
            call.unhold()
        }
    }

    private deleteRoom (roomId: number) {
        delete this.activeRooms[roomId]
        this.emit('roomDeleted', roomId)
    }

    private deleteRoomIfEmpty (roomId: number) {
        if (Object.values(this.activeCalls).filter(call => call.roomId === roomId).length === 0) {
            this.deleteRoom(roomId)

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

        const callsInRoom = Object.values(this.activeCalls).filter(call => call.roomId === roomId)

        // Let`s take care on the audio output first and check if passed room is our selected room
        if (this.currentActiveRoomId === roomId) {
            callsInRoom.forEach(call => {
                if (call.audioTag) {
                    this.muteReconfigure(call)
                    call.audioTag.muted = false
                }
            })
        } else {
            callsInRoom.forEach(call => {
                if (call.audioTag) {
                    call.audioTag.muted = true
                }
            })
        }

        // Now let`s configure the sound we are sending for each active call on this room
        if (callsInRoom.length === 0) {
            this.deleteRoomIfEmpty(roomId)
        } else if (callsInRoom.length === 1 && this.currentActiveRoomId !== roomId) {
            if (!callsInRoom[0].isOnHold()) {
                this.doCallHold({ callId: callsInRoom[0].id, toHold: true, automatic: true })
            }
        } else if (callsInRoom.length === 1 && this.currentActiveRoomId === roomId) {
            if (callsInRoom[0].isOnHold() && callsInRoom[0]._automaticHold) {
                this.doCallHold({ callId: callsInRoom[0].id, toHold: false })
            }

            let stream: MediaStream | undefined

            try {
                stream = await navigator.mediaDevices.getUserMedia(getters.getUserMediaConstraints)
            } catch (err) {
                console.error(err)
            }

            if (stream && callsInRoom[0].connection && callsInRoom[0].connection.getSenders()[0]) {
                // const processedStream = processAudioVolume(stream, getters.microphoneInputLevel)
                // processedStream.getTracks().forEach(track => track.enabled = !this.state.isMuted)
                // dispatch('_setOriginalStream', processedStream)
                // await callsInRoom[0].connection.getSenders()[0].replaceTrack(processedStream.getTracks()[0])
                this.muteReconfigure(callsInRoom[0])
            }
        } else if (callsInRoom.length > 1) {
            await dispatch('_doConference', callsInRoom)
        }
    }

    private async setCurrentActiveRoomId (roomId: number | undefined) {
        const oldRoomId = this.currentActiveRoomId

        if (roomId === oldRoomId) {
            return
        }

        this.currentActiveRoomId = roomId

        await dispatch('roomReconfigure', oldRoomId)
        await dispatch('roomReconfigure', roomId)
    }

    private getNewRoomId () {
        const roomIdList = Object.keys(this.activeRooms)

        if (roomIdList.length === 0) {
            return 1
        }

        return (parseInt(roomIdList.sort()[roomIdList.length - 1]) + 1)
    }

    private async addCall (session: RTCSession) {
        const sessionAlreadyInActiveCalls = this.activeCalls[session.id]

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

            this.on('callConfirmed',)

            dispatch('subscribe', { type: CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED, listener: (call) => {
                if (session.id === call.id) {
                    commit(STORE_MUTATION_TYPES.UPDATE_ROOM, {
                        incomingInProgress: false,
                        roomId
                    })
                    dispatch('_startCallTimer', session.id)
                }
            } })

            dispatch('subscribe', { type: CALL_EVENT_LISTENER_TYPE.CALL_FAILED, listener: (call) => {
                if (session.id === call.id) {
                    commit(STORE_MUTATION_TYPES.UPDATE_ROOM, {
                        incomingInProgress: false,
                        roomId
                    })
                }
            } })
        } else if (session.direction === 'outgoing') {
            dispatch('_startCallTimer', session.id)
        }

        const call: ICall = {
            ...session,
            roomId,
            localMuted: false
        }

        commit(STORE_MUTATION_TYPES.ADD_CALL, call)
        commit(STORE_MUTATION_TYPES.ADD_CALL_STATUS, session.id)
        commit(STORE_MUTATION_TYPES.ADD_ROOM, newRoomInfo)
    }

    private newRTCSessionCallback (event: RTCSessionEvent) {
        const session = event.session

        // if (getters.isDND) {
        //     session.terminate({ status_code: 486, reason_phrase: 'Do Not Disturb' })
        //     return
        // }

        // stop timers on ended and failed
        session.on('ended', (event) => {
            console.log('ended', event)
            // dispatch('_triggerListener', { listenerType: CALL_EVENT_LISTENER_TYPE.CALL_ENDED, session, event })
            // dispatch('_activeCallListRemove', session)
            // dispatch('_stopCallTimer', session.id)
            // commit(STORE_MUTATION_TYPES.REMOVE_CALL_STATUS, session.id)
            // commit(STORE_MUTATION_TYPES.REMOVE_CALL_METRICS, session.id)
            //
            // if (!Object.keys(activeCalls).length) {
            //     commit(STORE_MUTATION_TYPES.SET_MUTED, false)
            // }
        })
        session.on('progress', (event: IncomingEvent | OutgoingEvent) => {
            console.log('progress', event)
            // dispatch('_triggerListener', { listenerType: CALL_EVENT_LISTENER_TYPE.CALL_PROGRESS, session, event })
        })
        session.on('failed', (event) => {
            console.log('failed', event)
            // dispatch('_triggerListener', { listenerType: CALL_EVENT_LISTENER_TYPE.CALL_FAILED, session, event })
            //
            // if (session.id === getters.callAddingInProgress) {
            //     commit(STORE_MUTATION_TYPES.CALL_ADDING_IN_PROGRESS, null)
            // }
            //
            // dispatch('_activeCallListRemove', session)
            // dispatch('_stopCallTimer', session.id)
            // commit(STORE_MUTATION_TYPES.REMOVE_CALL_STATUS, session.id)
            // commit(STORE_MUTATION_TYPES.REMOVE_CALL_METRICS, session.id)
            //
            // if (!Object.keys(activeCalls).length) {
            //     commit(STORE_MUTATION_TYPES.SET_MUTED, false)
            // }
        })
        session.on('confirmed', (event: IncomingAckEvent | OutgoingAckEvent) => {
            console.log('confirmed', event)
            // dispatch('_triggerListener', { listenerType: CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED, session, event })
            // commit(STORE_MUTATION_TYPES.UPDATE_CALL, session)
            //
            if (session.id === this.callAddingInProgress) {
                this.callAddingInProgress = undefined
            }
        })

        // dispatch('_triggerListener', { listenerType: CALL_EVENT_LISTENER_TYPE.NEW_CALL, session })
        // dispatch('_addCall', session)
        // if (session.direction === SessionDirection.OUTGOING) {
        //     console.log('Is outgoing')
        //     // dispatch('setCurrentActiveRoom', session.roomId)
        // }
    }

    public start () {
        this.on(
            this.newRTCSessionEventName,
            this.newRTCSessionCallback.bind(this)
        )

        super.start()

        this.initialized = true

        return this
    }

    public doCall ({ target, addToCurrentRoom }: IDoCallParam) {
        this.checkInitialized()

        if (target.length === 0) {
            return console.error('Target must be a valid string')
        }

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

        call.connection.addEventListener('addstream', event => {
            // dispatch('_triggerAddStream', { event, call })
        })
    }

    public async callChangeRoom ({ callId, roomId }: { callId: string, roomId: number }) {
        const oldRoomId = this.activeCalls[callId].roomId

        this.activeCalls[callId].roomId = roomId

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
