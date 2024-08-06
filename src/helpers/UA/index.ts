import {Options, Message, UA as UAType} from 'jssip'

import UA, {UAConfiguration} from 'jssip/lib/UA'
import * as JsSIP_C from 'jssip/lib/Constants'
import RTCSessionConstructor, {Originator, RTCSession} from 'jssip/lib/RTCSession'
import Transactions from 'jssip/lib/Transactions'
import {IncomingRequest} from 'jssip/lib/SIPMessage'
import JanusSession from '@/lib/janus/session'
import config from 'jssip/lib/Config'
import Parser from 'jssip/lib/Parser'
import sanityCheck from 'jssip/lib/sanityCheck'

import Utils from 'jssip/lib/Utils'
import Transport from 'jssip/lib/Transport'
import Exceptions from 'jssip/lib/Exceptions'
import URI from 'jssip/lib/URI'
import SIPMessage from 'jssip/lib/SIPMessage'

import TestSession from '@/lib/janus/testSession'

import { MSRPSession, MSRPOptions } from '@/lib/msrp/session'
import { /*MSRPSession, */JanusOptions } from '@/lib/janus/session' // TODO: import JanusSession from here
//import Parser from '@/lib/janus/Parser' // TODO: import JanusSession from here

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

    _janus_sessions: any[] = []

    //_janus_session: any = null

    constructor(configuration: UAConfiguration) {
        super(configuration)

        /*configuration.sockets[0].ondata = (data) => {
            console.log('ON DATA', data)
        }*/

        /*this.registrator().setExtraContactParams({
            'pn-provider': 'acme',
            'pn-param': 'acme-param',
            'pn-prid': 'ZTY4ZDJlMzODE1NmUgKi0K>'
        })*/
    }

    call(target: string, options?: CallOptionsExtended): RTCSession {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return super.call(target, options)
    }

    joinVideoCall(target, displayName, options) {
        logger.debug('call()')

        const session = new JanusSession(this)

        session.connect(target, displayName, options)

        return session
    }

    _loadConfig(configuration) {
        // Check and load the given configuration.
        try {
            config.load(this._configuration, configuration);
        } catch (e) {
            throw e;
        }

        // Post Configuration Process.

        // Allow passing 0 number as display_name.
        if (this._configuration.display_name === 0) {
            this._configuration.display_name = '0';
        }

        // Instance-id for GRUU.
        if (!this._configuration.instance_id) {
            this._configuration.instance_id = Utils.newUUID();
        }

        // Jssip_id instance parameter. Static random tag of length 5.
        this._configuration.jssip_id = Utils.createRandomToken(5);

        // String containing this._configuration.uri without scheme and user.
        const hostport_params = this._configuration.uri.clone();

        hostport_params.user = null;
        this._configuration.hostport_params = hostport_params.toString().replace(/^sip:/i, '');

        // Transport.
        try {
            this._transport = new Transport(this._configuration.sockets, {
                // Recovery options.
                max_interval: this._configuration.connection_recovery_max_interval,
                min_interval: this._configuration.connection_recovery_min_interval
            });

            // Transport event callbacks.
            this._transport.onconnecting = onTransportConnecting.bind(this);
            this._transport.onconnect = onTransportConnect.bind(this);
            this._transport.ondisconnect = onTransportDisconnect.bind(this);
            this._transport.ondata = onTransportData.bind(this);
        } catch (e) {
            logger.warn(e);
            throw new Exceptions.ConfigurationError('sockets', this._configuration.sockets);
        }

        // Remove sockets instance from configuration object.
        delete this._configuration.sockets;

        // Check whether authorization_user is explicitly defined.
        // Take 'this._configuration.uri.user' value if not.
        if (!this._configuration.authorization_user) {
            this._configuration.authorization_user = this._configuration.uri.user;
        }

        // If no 'registrar_server' is set use the 'uri' value without user portion and
        // without URI params/headers.
        if (!this._configuration.registrar_server) {
            const registrar_server = this._configuration.uri.clone();

            registrar_server.user = null;
            registrar_server.clearParams();
            registrar_server.clearHeaders();
            this._configuration.registrar_server = registrar_server;
        }

        // User no_answer_timeout.
        this._configuration.no_answer_timeout *= 1000;

        // Via Host.
        if (this._configuration.contact_uri) {
            this._configuration.via_host = this._configuration.contact_uri.host;
        }

        // Contact URI.
        else {
            this._configuration.contact_uri = new URI('sip', Utils.createRandomToken(8), this._configuration.via_host, null, {transport: 'ws'});
        }

        this._contact = {
            pub_gruu: null,
            temp_gruu: null,
            uri: this._configuration.contact_uri,
            toString(options = {}) {
                const anonymous = options.anonymous || null;
                const outbound = options.outbound || null;
                let contact = '<';

                if (anonymous) {
                    contact += this.temp_gruu || 'sip:anonymous@anonymous.invalid;transport=ws';
                } else {
                    contact += this.pub_gruu || this.uri.toString();
                }

                if (outbound && (anonymous ? !this.temp_gruu : !this.pub_gruu)) {
                    contact += ';ob';
                }

                contact += '>';

                return contact;
            }
        };

        // Seal the configuration.
        const writable_parameters = [
            'authorization_user', 'password', 'realm', 'ha1', 'authorization_jwt', 'display_name', 'register'
        ];

        for (const parameter in this._configuration) {
            if (Object.prototype.hasOwnProperty.call(this._configuration, parameter)) {
                if (writable_parameters.indexOf(parameter) !== -1) {
                    Object.defineProperty(this._configuration, parameter, {
                        writable: true,
                        configurable: false
                    });
                } else {
                    Object.defineProperty(this._configuration, parameter, {
                        writable: false,
                        configurable: false
                    });
                }
            }
        }

        logger.debug('configuration parameters after validation:');
        for (const parameter in this._configuration) {
            // Only show the user user configurable parameters.
            if (Object.prototype.hasOwnProperty.call(config.settings, parameter)) {
                switch (parameter) {
                    case 'uri':
                    case 'registrar_server':
                        logger.debug(`- ${parameter}: ${this._configuration[parameter]}`);
                        break;
                    case 'password':
                    case 'ha1':
                    case 'authorization_jwt':
                        logger.debug(`- ${parameter}: NOT SHOWN`);
                        break;
                    default:
                        logger.debug(`- ${parameter}: ${JSON.stringify(this._configuration[parameter])}`);
                }
            }
        }

        return;
    }

    /*call (target, options) {
        logger.debug('call()')

        const session = new TestSession(this)

        session.connect(target, options)

        return session
    }*/

    /**
     * new MSRPSession
     */
    newMSRPSession(session: MSRPSession, data: object) {
        // Listening for message history update
        session.on('msgHistoryUpdate', (obj) => {
            console.log(obj)
        })

        this._msrp_sessions[session.id] = session
        this.emit('newMSRPSession', data)
    }

    newJanusSession(session, data) {
        this._janus_sessions[session.id] = session
        this.emit('newJanusSession', data)
    }

    /**
     * MSRPSession destroyed.
     */
    destroyMSRPSession(session: MSRPSession) {
        delete this._msrp_sessions[session.id]
    }

    destroyJanusSession(session) {
        delete this._janus_sessions[session.id]
    }

    receiveRequest(request: any) {
        console.log('receiveRequest', request)
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

        const bodyParsed = JSON.parse(request.body) || {}
        if (bodyParsed.plugindata?.data?.publishers){
            // TODO: Implement getting the right session by some header parameter
            const session = Object.values(this._janus_sessions)[0]
            session.receivePublishers(bodyParsed)
        }

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
                            if (request.body.search(/MSRP/ig) > -1) {
                                session = new MSRPSession(this)
                                session.init_incoming(request)
                            } else if (request.body.search(/JANUS/ig) > -1) {
                                // TODO: use new JanusSession(this) when implemented
                                //_janus_session = new MSRPSession(this)
                                //session = new MSRPSession(this)
                                //this._janus_session.init_incoming(request)
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
                    console.log('FFF in notify')
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

            console.log('FFF in else')
            if (dialog) {
                console.log('FFF in else dialog')
                dialog.receiveRequest(request)
            } else if (method === JsSIP_C.NOTIFY) {
                console.log('FFF in else no dialog')
                session = this._findSession(request)
                if (session) {
                    console.log('FFF in else session')
                    session.receiveRequest(request)
                } else {
                    console.log('FFF in else no session')
                    logger.debug('received NOTIFY request for a non existent subscription')
                    request.reply(200)
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

    startMSRP(target: string, options: MSRPOptions): MSRPSession {
        logger.debug('startMSRP()', options)

        const session = new MSRPSession(this)
        session.connect(target)
        return session
    }

    startJanus(target: string, options: JanusOptions): MSRPSession {
        logger.debug('startJanus()', options)

        const session = new MSRPSession(this) // TODO: use new JanusSession(this)
        session.connect(target)
        return session
    }


    terminateMSRPSessions(options: object) {
        logger.debug('terminateSessions()')

        for (const idx in this._msrp_sessions) {
            if (!this._msrp_sessions[idx].isEnded()) {
                this._msrp_sessions[idx].terminate(options)
            }
        }
    }

    terminateJanusSessions(options) {
        logger.debug('terminateSessions()')

        for (const idx in this._janus_sessions) {
            if (!this._janus_sessions[idx].isEnded()) {
                this._janus_sessions[idx].terminate(options)
            }
        }
    }

    stop() {
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

        for (const janus_session in this._janus_sessions) {
            if (Object.prototype.hasOwnProperty.call(this._janus_sessions, janus_session)) {
                logger.debug(`closing session ${janus_session}`)

                try {
                    this._janus_sessions[janus_session].terminate()
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


/**
 * Transport event handlers
 */

// Transport connecting event.
function onTransportConnecting (data) {
    this.emit('connecting', data)
}

// Transport connected event.
function onTransportConnect (data) {
    if (this._status === C.STATUS_USER_CLOSED) {
        return
    }

    this._status = C.STATUS_READY
    this._error = null

    this.emit('connected', data)

    if (this._dynConfiguration.register) {
        this._registrator.register()
    }
}

// Transport disconnected event.
function onTransportDisconnect (data) {
    // Run _onTransportError_ callback on every client transaction using _transport_.
    const client_transactions = ['nict', 'ict', 'nist', 'ist']

    for (const type of client_transactions) {
        for (const id in this._transactions[type]) {
            if (Object.prototype.hasOwnProperty.call(this._transactions[type], id)) {
                this._transactions[type][id].onTransportError()
            }
        }
    }

    this.emit('disconnected', data);

    // Call registrator _onTransportClosed_.
    this._registrator.onTransportClosed()

    if (this._status !== C.STATUS_USER_CLOSED) {
        this._status = C.STATUS_NOT_READY
        this._error = C.NETWORK_ERROR
    }
}

// Transport data event.
function onTransportData (data) {
    console.log('onTransportData', data)
    const transport = data.transport
    let message = data.message

    message = Parser.parseMessage(message, this)
    //console.log('onTransportData method', message.method)

    if (!message) {
        console.log('if 1 return')
        return
    }

    if (this._status === C.STATUS_USER_CLOSED &&
        message instanceof SIPMessage.IncomingRequest) {
        console.log('if 2 return')
        return
    }

    // Do some sanity check.
    if (!sanityCheck(message, this, transport)) {
        console.log('if 3 return')
        return
    }

    console.log('onTransportData message', message)
    console.log('onTransportData instanceof', message instanceof SIPMessage.IncomingRequest)
    if (message instanceof SIPMessage.IncomingRequest) {
        message.transport = transport
        console.log('onTransportData receiveRequest')
        this.receiveRequest(message)
    } else if (message instanceof SIPMessage.IncomingResponse) {
        /* Unike stated in 18.1.2, if a response does not match
        * any transaction, it is discarded here and no passed to the core
        * in order to be discarded there.
        */

        let transaction

        switch (message.method) {
            case JsSIP_C.INVITE:
                transaction = this._transactions.ict[message.via_branch]
                if (transaction) {
                    transaction.receiveResponse(message)
                }
                break;
            case JsSIP_C.ACK:
                // Just in case ;-).
                break
            default:
                transaction = this._transactions.nict[message.via_branch]
                if (transaction) {
                    transaction.receiveResponse(message)
                }
                break
        }
    }
}
