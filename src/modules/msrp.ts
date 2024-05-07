import { simplifyMessageObject } from '@/helpers/audio.helper'
import { CALL_EVENT_LISTENER_TYPE } from '@/enum/call.event.listener.type'
import { EndEvent, IncomingAckEvent, OutgoingAckEvent } from 'jssip/lib/RTCSession'
import { IMessage, MSRPSessionExtended, TriggerMSRPListenerOptions } from '@/types/msrp'
import MSRPMessage from '@/lib/msrp/message'
import { MSRPSessionEvent } from '@/helpers/UA'

export class MSRPModule {
    private context: any

    private activeMessages: { [key: string]: IMessage } = {}
    private extendedMessages: { [key: string]: IMessage } = {}
    private msrpHistory: { [key: string]: Array<MSRPMessage> } = {}

    private isMSRPInitializingValue: boolean | undefined

    constructor (context) {
        this.context = context

        this.context.on(
            this.context.newMSRPSessionEventName,
            this.newMSRPSessionCallback.bind(this.context)
        )
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
            this.newMSRPSessionCallback.bind(this.context)
        )

        this.context.logger.log('Connecting to', this.context.options.socketInterfaces[0])
        this.context.start()

        return this.context
    }*/

    public get isMSRPInitializing () {
        return this.isMSRPInitializingValue
    }

    public get getActiveMessages () {
        return this.activeMessages
    }

    public msrpAnswer (callId: string) {
        const call = this.extendedMessages[callId]

        // TODO: uncomment
        //call.answer(this.sipOptions)
        this.updateMSRPSession(call)
    }

    public updateMSRPSession (value: IMessage) {
        this.activeMessages[value._id] = simplifyMessageObject(value) as IMessage
        this.context.emit('changeActiveMessages', this.activeMessages)
    }

    private addMMSRPSession (value: IMessage) {
        this.activeMessages = {
            ...this.activeMessages,
            [value._id]: simplifyMessageObject(value) as IMessage
        }

        this.extendedMessages[value._id] = value
        this.context.emit('changeActiveMessages', this.activeMessages)
    }

    private addMSRPMessage (value: MSRPMessage, session: MSRPSessionExtended) {
        const sessionMessages = this.msrpHistory[session.id] || []
        sessionMessages.push(value)

        this.msrpHistory = {
            ...this.msrpHistory,
            [session.id]: [ ...sessionMessages ]
        }
        this.context.emit('newMSRPMessage', {
            message: value,
            session: session
        })
    }

    public messageTerminate (callId: string) {
        const call = this.extendedMessages[callId]

        if (call._status !== 8) {
            call.terminate()
            //this.removeMMSRPSession(call._id)
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

        const MSRPSession = session as IMessage

        this.addMMSRPSession(MSRPSession)
    }

    private triggerMSRPListener ({ listenerType, session, event }: TriggerMSRPListenerOptions) {
        const listeners = this.context.listenersList[listenerType]

        if (!listeners || !listeners.length) {
            return
        }

        listeners.forEach((listener) => {
            listener(session, event)
        })
    }

    private removeMMSRPSession (value: string) {
        const stateActiveMessagesCopy = { ...this.activeMessages }
        delete stateActiveMessagesCopy[value]

        this.activeMessages = {
            ...stateActiveMessagesCopy,
        }

        const stateExtendedMessagesCopy = { ...this.extendedMessages }
        delete stateExtendedMessagesCopy[value]
        this.extendedMessages = {
            ...stateExtendedMessagesCopy,
        }

        this.context.emit('changeActiveMessages', this.activeMessages)
    }

    private activeMessageListRemove (call: IMessage) {
        this.removeMMSRPSession(call._id)
    }

    private newMSRPSessionCallback (event: MSRPSessionEvent) {
        const session = event.session as MSRPSessionExtended

        /*if (this.isDND) {
            session.terminate({ status_code: 486, reason_phrase: 'Do Not Disturb' })
            return
        }*/

        // stop timers on ended and failed
        session.on('ended', (event: EndEvent) => {
            this.triggerMSRPListener({
                listenerType: CALL_EVENT_LISTENER_TYPE.CALL_ENDED,
                session,
                event
            })
            const s = this.getActiveMessages[session.id]
            this.activeMessageListRemove(s)
        })

        session.on('failed', (event: EndEvent) => {
            this.triggerMSRPListener({
                listenerType: CALL_EVENT_LISTENER_TYPE.CALL_FAILED,
                session,
                event
            })

            const s = this.getActiveMessages[session.id]
            this.activeMessageListRemove(s)
        })
        session.on('confirmed', (event: IncomingAckEvent | OutgoingAckEvent) => {
            this.triggerMSRPListener({
                listenerType: CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED,
                session,
                event
            })
            this.updateMSRPSession(session as IMessage)
        })

        session.on('newMessage', (msg: unknown) => {
            this.addMSRPMessage(msg as MSRPMessage, session)
        })

        this.addMessageSession(session)
    }

    private setIsMSRPInitializing (value: boolean) {
        this.isMSRPInitializingValue = value
        this.context.emit('isMSRPInitializingChanged', value)
    }

    public initMSRP (target: string, body: string, options: any) {
        //this.checkInitialized()

        if (target.length === 0) {
            return console.error('Target must be a valid string')
        }

        const session = this.context.startMSRP(target, options) as MSRPSessionExtended
        session.on('active', () => {
            this.addMessageSession(session)
            session.sendMSRP(body)
            this.setIsMSRPInitializing(false)
        })

        this.setIsMSRPInitializing(true)
    }

    public sendMSRP (msrpSessionId: string, body: string) {
        const msrpSession = this.extendedMessages[msrpSessionId]
        if (!msrpSession) {
            throw new Error(`MSRP session with id ${msrpSessionId} doesn't exist!`)
        }

        msrpSession.sendMSRP(body)
    }

}
