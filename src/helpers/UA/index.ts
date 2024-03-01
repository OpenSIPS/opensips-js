import { Options, Message, UA as UAType  } from 'jssip'

import UA, { UAConfiguration } from 'jssip/lib/UA'
import * as JsSIP_C from 'jssip/lib/Constants'
import RTCSessionConstructor, { Originator, RTCSession } from 'jssip/lib/RTCSession'
import Transactions from 'jssip/lib/Transactions'
import { IncomingRequest } from 'jssip/lib/SIPMessage'

import { MSRPSession, MSRPOptions } from '@/lib/msrp/session'

import { CallOptionsExtended } from '@/types/rtc'
import { UAExtendedInterface } from '@/lib/msrp/session'

const logger = console

const C = {
    // UA status codes.
    STATUS_INIT: 0,
    STATUS_READY: 1,
    STATUS_USER_CLOSED: 2,
    STATUS_NOT_READY: 3,

    // UA error codes.
    CONFIGURATION_ERROR: 1,
    NETWORK_ERROR: 2
}

export interface IncomingMSRPSessionEvent {
    originator: Originator.REMOTE;
    session: MSRPSession;
    request: IncomingRequest;
}

export interface OutgoingMSRPSessionEvent {
    originator: Originator.LOCAL;
    session: MSRPSession;
    request: IncomingRequest;
}

export type MSRPSessionEvent = IncomingMSRPSessionEvent | OutgoingMSRPSessionEvent;

const UAConstructor: typeof UAType = UA as unknown as typeof UAType

export default class UAExtended extends UAConstructor implements UAExtendedInterface {

    _msrp_sessions: MSRPSession[] = []
    _transactions = {
        nist: {},
        nict: {},
        ist: {},
        ict: {}
    }

    constructor (configuration: UAConfiguration) {
        console.log(configuration)
        // const _proto = configuration.uri.split(':').shift()
        // const _user = (configuration.uri.split(':').pop()).split('@').shift()
        // const _realm = (configuration.uri.split(':').pop()).split('@').pop()
        // configuration.uri = URI.parse(configuration.uri)
        super(configuration)
        // console.log(configuration.uri)
    }

    call (target: string, options?: CallOptionsExtended): RTCSession {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return super.call(target, options)
    }

    /**
     * new MSRPSession
     */
    newMSRPSession (session: MSRPSession, data: object) {
        // Listening for message history update
        session.on('msgHistoryUpdate', (obj) => {
            console.log(obj)
        })

        this._msrp_sessions[session.id] = session
        this.emit('newMSRPSession', data)
    }

    /**
     * MSRPSession destroyed.
     */
    destroyMSRPSession (session: MSRPSession) {
        delete this._msrp_sessions[session.id]
    }

    receiveRequest (request: any) {
        const method = request.method
        console.log('-----------')
        // Check that request URI points to us.
        if (request.ruri.user !== this._configuration.uri.user &&
            request.ruri.user !== this._contact.uri.user) {
            logger.debug('Request-URI does not point to us')
            if (request.method !== JsSIP_C.ACK) {
                request.reply_sl(404)
            }

            return
        }

        // Check request URI scheme.
        if (request.ruri.scheme === JsSIP_C.SIPS) {
            request.reply_sl(416)

            return
        }

        // Check transaction.
        if (Transactions.checkTransaction(this, request)) {
            return
        }

        // Create the server transaction.
        if (method === JsSIP_C.INVITE) {
            /* eslint-disable no-new */
            new Transactions.InviteServerTransaction(this, this._transport, request)
            /* eslint-enable no-new */
        } else if (method !== JsSIP_C.ACK && method !== JsSIP_C.CANCEL) {
            /* eslint-disable no-new */
            new Transactions.NonInviteServerTransaction(this, this._transport, request)
            /* eslint-enable no-new */
        }

        /* RFC3261 12.2.2
         * Requests that do not change in any way the state of a dialog may be
         * received within a dialog (for example, an OPTIONS request).
         * They are processed as if they had been received outside the dialog.
         */
        if (method === JsSIP_C.OPTIONS) {
            if (this.listeners('newOptions').length === 0) {
                request.reply(200)

                return
            }

            const message = new Options(this)

            message.init_incoming(request)
        } else if (method === JsSIP_C.MESSAGE) {
            if (this.listeners('newMessage').length === 0) {
                request.reply(405)

                return
            }
            const message = new Message(this)

            message.init_incoming(request)
        } else if (method === JsSIP_C.INVITE) {
            // Initial INVITE.
            if (!request.to_tag && this.listeners('newRTCSession').length === 0) {
                request.reply(405)

                return
            }
        }

        let dialog
        let session

        // Initial Request.
        if (!request.to_tag) {
            switch (method) {
                case JsSIP_C.INVITE:
                    if (window.RTCPeerConnection) { // TODO
                        if (request.hasHeader('replaces')) {
                            const replaces = request.replaces

                            dialog = this._findDialog(
                                replaces.call_id, replaces.from_tag, replaces.to_tag)
                            if (dialog) {
                                session = dialog.owner
                                if (!session.isEnded()) {
                                    session.receiveRequest(request)
                                } else {
                                    request.reply(603)
                                }
                            } else {
                                request.reply(481)
                            }
                        } else {
                            if(request.body.search(/MSRP/ig) > -1) {
                                session = new MSRPSession(this)
                                session.init_incoming(request)
                            } else {
                                session = new RTCSessionConstructor(this)
                                session.init_incoming(request)
                            }
                        }
                    } else {
                        logger.warn('INVITE received but WebRTC is not supported')
                        request.reply(488)
                    }
                    break
                case JsSIP_C.BYE:
                    // Out of dialog BYE received.
                    request.reply(481)
                    break
                case JsSIP_C.CANCEL:
                    session = this._findSession(request)
                    if (session) {
                        session.receiveRequest(request)
                    } else {
                        logger.debug('received CANCEL request for a non existent session')
                    }
                    break
                case JsSIP_C.ACK:
                    /* Absorb it.
                     * ACK request without a corresponding Invite Transaction
                     * and without To tag.
                     */
                    break
                case JsSIP_C.NOTIFY:
                    // Receive new sip event.
                    this.emit('sipEvent', {
                        event: request.event,
                        request
                    })
                    request.reply(200)
                    break
                default:
                    request.reply(405)
                    break
            }
        } else { // In-dialog request.
            dialog = this._findDialog(request.call_id, request.from_tag, request.to_tag)

            if (dialog) {
                dialog.receiveRequest(request)
            } else if (method === JsSIP_C.NOTIFY) {
                session = this._findSession(request)
                if (session) {
                    session.receiveRequest(request)
                } else {
                    logger.debug('received NOTIFY request for a non existent subscription')
                    request.reply(481, 'Subscription does not exist')
                }
            } else if (method !== JsSIP_C.ACK) {
                /* RFC3261 12.2.2
                 * Request with to tag, but no matching dialog found.
                 * Exception: ACK for an Invite request for which a dialog has not
                 * been created.
                 */
                request.reply(481)
            }
        }
    }

    startMSRP (target: string, options: MSRPOptions): MSRPSession {
        logger.debug('startMSRP()', options)

        const session = new MSRPSession(this)
        session.connect(target)
        return session
    }


    terminateMSRPSessions (options: object) {
        logger.debug('terminateSessions()')

        for (const idx in this._msrp_sessions) {
            if (!this._msrp_sessions[idx].isEnded()) {
                this._msrp_sessions[idx].terminate(options)
            }
        }
    }

    stop () {
        logger.debug('stop()')

        // Remove dynamic settings.
        this._dynConfiguration = {}

        if (this._status === C.STATUS_USER_CLOSED) {
            logger.debug('UA already closed')

            return
        }

        // Close registrator.
        this._registrator.close()

        // If there are session wait a bit so CANCEL/BYE can be sent and their responses received.
        const num_sessions = Object.keys(this._sessions).length

        // Run  _terminate_ on every Session.
        for (const session in this._sessions) {
            if (Object.prototype.hasOwnProperty.call(this._sessions, session)) {
                logger.debug(`closing session ${session}`)

                try {
                    this._sessions[session].terminate()
                } catch (error) {
                    console.error(error)
                }
            }
        }

        // If there are session wait a bit so CANCEL/BYE can be sent and their responses received.
        // const num_msrp_sessions = Object.keys(this._msrp_sessions).length

        // Run  _terminate_ on every Session.
        for (const msrp_session in this._msrp_sessions) {
            if (Object.prototype.hasOwnProperty.call(this._msrp_sessions, msrp_session)) {
                logger.debug(`closing session ${msrp_session}`)

                try {
                    this._msrp_sessions[msrp_session].terminate()
                } catch (error) {
                    console.error(error)
                }
            }
        }

        // Run  _close_ on every applicant.
        for (const applicant in this._applicants) {
            if (Object.prototype.hasOwnProperty.call(this._applicants, applicant)) {
                try {
                    this._applicants[applicant].close()
                } catch (error) {
                    console.error(error)
                }
            }
        }

        this._status = C.STATUS_USER_CLOSED

        const num_transactions =
            Object.keys(this._transactions.nict).length +
            Object.keys(this._transactions.nist).length +
            Object.keys(this._transactions.ict).length +
            Object.keys(this._transactions.ist).length

        if (num_transactions === 0 && num_sessions === 0) {
            this._transport.disconnect()
        } else {
            this._closeTimer = setTimeout(
                () => {
                    this._closeTimer = null
                    this._transport.disconnect()
                },
                2000
            )
        }
    }

    // sendMSRPMessage (target: string, options: string): MSRPSession {
    //     const session = new MSRPSession(this)
    //
    //     session.send(target, options)
    //
    //     return session
    // }
}
