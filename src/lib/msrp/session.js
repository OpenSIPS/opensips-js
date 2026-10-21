import * as Utils from 'jssip/lib/Utils'
import RequestSender from 'jssip/lib/RequestSender'
import DigestAuthentication from 'jssip/lib/DigestAuthentication'
import Message from './message'
import URI from 'jssip/lib/URI'
import * as SIPMessage from 'jssip/lib/SIPMessage'
import JsSIP_C from 'jssip/lib/Constants'
import { EventEmitter } from 'events'
import Dialog from 'jssip/lib/Dialog'
import Exceptions from 'jssip/lib/Exceptions'
import Transactions from 'jssip/lib/Transactions'
import RTCSession_Info from 'jssip/lib/RTCSession/Info'
import sdp_transform from 'sdp-transform'

const C = {
    // RTCSession states.
    STATUS_NULL: 0,
    STATUS_INVITE_SENT: 1,
    STATUS_1XX_RECEIVED: 2,
    STATUS_INVITE_RECEIVED: 3,
    STATUS_WAITING_FOR_ANSWER: 4,
    STATUS_ANSWERED: 5,
    STATUS_WAITING_FOR_ACK: 6,
    STATUS_CANCELED: 7,
    STATUS_TERMINATED: 8,
    STATUS_CONFIRMED: 9
}

export class MSRPSession extends EventEmitter{

    constructor (ua) {
        super()

        this._id = null
        this.my_ip = '127.0.0.1'
        this._ua = ua
        this.auth_id = Utils.createRandomToken(10)
        this._status = C.STATUS_NULL
        this._dialog = null
        this._earlyDialogs = {}
        this._contact = null
        this._from_tag = null
        this._to_tag = null
        this._msgHistory = []
        this.target_addr = []
        this.my_addr = []
        this.credentials = {
            username: ua._configuration.authorization_user,
            ha1: ua._configuration.ha1,
            realm: ua._configuration.realm
        }

        // MSRP-only mode: the HA1 may not be known (the SIP server did not challenge the
        // other instance yet), so the digest is computed from the password when given.
        if (ua.options && ua.options.msrpSignaling && ua._configuration.password) {
            this.credentials.password = ua._configuration.password
        }
        this._request = null

        this.status = 'new'
        this.target = ''
        this.message = ''

        this._connectionPromiseQueue = Promise.resolve()

        this._timers = {
            ackTimer: null,
            expiresTimer: null,
            invite2xxTimer: null,
            userNoAnswerTimer: null
        }

        this._direction = null
        this._local_identity = null
        this._remote_identity = null
        this._start_time = null
        this._end_time = null
        this._tones = null

        this._sessionTimers = {
            enabled: this._ua.configuration.session_timers,
            refreshMethod: this._ua.configuration.session_timers_refresh_method,
            defaultExpires: JsSIP_C.SESSION_EXPIRES,
            currentExpires: null,
            running: false,
            refresher: false,
            timer: null // A setTimeout.
        }

        this._msrpKeepAliveTimer = null

        this._reconnectScheduled = false
        this._reconnectInProgress = false
        this._reconnectTimer = null
        this._userTerminated = false
        this._reconnectInterval = (this._ua.options && this._ua.options.msrpReconnectInterval) || 12000

        this._awaitingKeepAlivePong = false
        this._keepAlivePongTimer = null
        this._keepAlivePongTimeout = (this._ua.options && this._ua.options.msrpKeepAlivePongTimeout) || 8000
        this._keepAliveInterval = (this._ua.options && this._ua.options.msrpKeepAliveInterval) || 0

        /*
         * External signaling (MSRP-only mode): the SIP part of the session
         * (INVITE/ACK/BYE) is performed by another OpenSIPSJS instance, this
         * session only owns the MSRP socket.
         */
        this._signaling = (this._ua.options && this._ua.options.msrpSignaling) || null
        this._signalingCallId = null
        this._offSignalingDialogTerminated = null

        if (this._signaling) {
            this._offSignalingDialogTerminated = this._signaling.onDialogTerminated((callId, cause) => {
                this._onSignalingDialogTerminated(callId, cause)
            })

            // Tracked so OpenSIPSJS.disconnect() can stop the session in any state
            // (connecting, authenticating, waiting for a reconnect).
            if (!this._ua._msrpSignalingSessions) {
                this._ua._msrpSignalingSessions = new Set()
            }
            this._ua._msrpSignalingSessions.add(this)
        }

        /*
         * Signaling-only mode (the counterpart of the external signaling):
         * the session performs INVITE/ACK/BYE for an MSRP socket that lives
         * elsewhere, so it never opens a socket, runs MSRP timers or reconnects.
         */
        this._signalingOnly = false
        this._terminateWhenConfirmed = false
    }

    /**
     * Expose C object.
     */
    static get C () {
        return C
    }

    get direction () {
        return this._direction
    }

    get connection () {
        return this._connection
    }

    get id () {
        return this._id
    }

    connect (target = '') {
        if (target !== '') {
            this._direction = 'outgoing'
        }
        this.target = target
        const protocolScheme = this._ua.options.msrpWs ? 'ws': 'wss'

        this._connection = new WebSocket(`${protocolScheme}://${this._ua.options.msrpDomain || this._ua._configuration.realm}`, 'msrp')
        // MSRP WebSocket connection
        this._connection.binaryType = 'arraybuffer'
        this._connection.onopen = (event) => {
            console.log('open', event)
            this.onopen()
        }
        this._connection.onclose = (event) => {
            console.log('close', event)
            this.onclose(event)
        }
        this._connection.onmessage = (msg) => {
            console.log('msg', msg)
            this.onmessage(msg)
        }
        this._connection.onerror = (event) => {
            console.log('error', event)
            this.onerror()
        }

        // this._msrpKeepAliveTimer = setInterval(() => {
        //     this._sendKeepAlive()
        // }, 10000)
    }

    _sendKeepAlive () {

        const msgObj = new Message('')
        msgObj.method = 'SEND'
        let toPath = ''
        if(this.my_addr[1]) toPath = this.my_addr[1]
        if(this.target_addr[1]) toPath += ' ' + this.target_addr[1]
        if(this.target_addr[0]) toPath += ' ' + this.target_addr[0]
        // msgObj.addHeader('To-Path', `${this.my_addr[1]}`)
        msgObj.addHeader('To-Path', toPath)
        msgObj.addHeader('From-Path', `${this.my_addr[0]}`)
        msgObj.addHeader('Message-ID', Utils.createRandomToken(10))
        msgObj.addHeader('Byte-Range', '0-0/0')
        msgObj.addHeader('Content-Type', 'text/plain')
        msgObj.body = ''
        this._connection.send(msgObj.toString())

    }

    answer () {
        if (!this._createDialog(this._request, 'UAS')) {
            this._request.reply(500, 'Error creating dialog')

            return
        }
        this._status = C.STATUS_ANSWERED
        clearTimeout(this._timers.userNoAnswerTimer)
        this.connect()
    }

    acceptParty (msgObj) {
        this._request.parseSDP(true)
        // this.target_addr = this._request.sdp.media[0].invalid[1].value.replaceAll('path:', '');
        this._request.reply(200, 'OK', [], 'v=0\n' +
            `o=- 4232740119537112802 2 IN IP4 ${this.my_ip}\n` +
            `c=IN IP4 ${this.my_ip}\n` +
            't=0 0\n' +
            'm=message 2856 TCP/TLS/MSRP *\n' +
            'a=accept-types:text/plain text/html\n' +
            `a=path: ${msgObj.getHeader('Use-Path')} msrp://${this._ua._configuration.authorization_user}.${this._ua._configuration.realm}:2856/${this.auth_id};ws\n`)
    }

    _buildInviteSdp (msgObj) {
        return 'v=0\n' +
            `o=- 4232740119537112802 2 IN IP4 ${this.my_ip}\n` +
            `c=IN IP4 ${this.my_ip}\n` +
            't=0 0\n' +
            'm=message 2856 TCP/TLS/MSRP *\n' +
            'a=accept-types:text/plain text/html\n' +
            `a=path:${msgObj.getHeader('Use-Path')} msrp://${this._ua._configuration.authorization_user}.${this._ua._configuration.realm}:2856/${this.auth_id};ws\n`
    }

    inviteParty (msgObj) {
        if (this._signaling) {
            this._inviteViaSignaling(this._buildInviteSdp(msgObj))

            return
        }

        const requestParams = {}
        const extraHeaders = []

        requestParams.to_uri   = new URI('sip', this.target,                      this._ua._configuration.realm)
        requestParams.from_uri = new URI('sip', this._ua._configuration.uri.user, this._ua._configuration.uri.host)
        // extraHeaders.push(`P-Preferred-Identity: ${this._ua._configuration.uri.toString()}`)

        extraHeaders.push(`Contact: ${this._ua.contact.toString({
            outbound: true
        })}`)
        extraHeaders.push('Content-Type: application/sdp')
        this._request = new SIPMessage.InitialOutgoingInviteRequest(
            new URI('sip', this.target, this._ua._configuration.realm).clone(),
            this._ua,
            requestParams,
            extraHeaders,
            this._buildInviteSdp(msgObj))
        this._newMSRPSession('local', this._request)
        if(!this._from_tag) this._from_tag= this._request.from._parameters.tag
        this._id = this._request.call_id + this._from_tag
        const request_sender = new RequestSender(this._ua, this._request, {
            onRequestTimeout: () => {
                this.onRequestTimeout()
                console.log('to')
            },
            onTransportError: (err) => {
                this.onTransportError()
                console.log(err)
            },
            // Update the request on authentication.
            onAuthenticated: (request) => {
                this._request = request
            },
            onReceiveResponse: (response) => {
                this._receiveInviteResponse(response)
                if (response.status_code === 200) {
                    response.parseSDP(true)
                    this._status = C.STATUS_CONFIRMED
                    this.target_addr = response.sdp.media[0].invalid[1].value.replaceAll('path:', '').split(' ').reverse()
                    this.status = 'active'
                    this._onReconnected()
                    this._startKeepAliveInterval()
                    this.emit('active')
                    this.emit('confirmed')
                }
            }
        })
        request_sender.send()
        this._status = C.STATUS_INVITE_SENT
    }

    /**
     * MSRP-only mode: the INVITE is sent by the external signaling (another
     * OpenSIPSJS instance that owns the SIP socket). Call-ID and From tag are
     * generated here so the session id is known before the INVITE leaves.
     */
    _inviteViaSignaling (sdp) {
        const callId = Utils.createRandomToken(22)
        const fromTag = Utils.newTag()

        this._signalingCallId = callId
        this._from_tag = fromTag
        this._id = callId + fromTag

        this._newMSRPSession('local', {
            call_id: callId,
            from_tag: fromTag,
            from: { _parameters: { tag: fromTag } }
        })

        this._status = C.STATUS_INVITE_SENT

        const onAnswer = (answer) => {
            // Session was terminated or restarted, or its socket dropped, while the INVITE was in flight.
            if (
                this._signalingCallId !== callId ||
                this._status !== C.STATUS_INVITE_SENT ||
                this._reconnectScheduled ||
                !this._connection ||
                this._connection.readyState !== WebSocket.OPEN
            ) {
                this._signaling.bye(callId).catch(() => undefined)

                return
            }

            const remoteSdp = sdp_transform.parse(answer.sdp || '')

            this._to_tag = answer.toTag
            this._status = C.STATUS_CONFIRMED
            this.target_addr = remoteSdp.media[0].invalid[1].value.replaceAll('path:', '').split(' ').reverse()
            this.status = 'active'

            this._handleSessionTimersInIncomingResponse({
                session_expires: answer.sessionExpires,
                session_expires_refresher: answer.sessionExpiresRefresher
            })
            this._accepted('remote', null)
            this._confirmed('local', null)

            this._onReconnected()
            this._startKeepAliveInterval()
            this.emit('active')
            this.emit('confirmed')
        }

        const onInviteFailed = (error) => {
            if (this._signalingCallId !== callId || this._userTerminated) {
                return
            }

            console.warn('MSRP INVITE via external signaling failed:', error)
            this._scheduleReconnect()
        }

        // Two-argument then: an exception thrown by an 'active' listener must not trigger a reconnect.
        this._signaling.invite({
            target: this.target,
            sdp,
            callId,
            fromTag,
            realm: this._ua._configuration.realm
        }).then(onAnswer, onInviteFailed)
    }

    /** The external signaling reports that the dialog was ended by the remote side (e.g. BYE). */
    _onSignalingDialogTerminated (callId, cause) {
        if (callId !== this._signalingCallId) {
            return
        }

        if (this._status === C.STATUS_CONFIRMED) {
            this._ended('remote', null, cause || JsSIP_C.causes.BYE)
        }
    }

    /**
     * MSRP-only mode: stops the session for good, whatever its state — BYE when
     * confirmed, otherwise closes the socket and cancels a pending reconnect.
     */
    stopExternalSignalingSession () {
        this._userTerminated = true
        this._reconnectScheduled = false
        clearTimeout(this._reconnectTimer)
        this._reconnectTimer = null

        if (this._ua._msrpSignalingSessions) {
            this._ua._msrpSignalingSessions.delete(this)
        }

        if (this._status === C.STATUS_TERMINATED) {
            // Already closed (e.g. waiting for a reconnect): nothing else is running.
            this._stopKeepAliveInterval()
            if (this._offSignalingDialogTerminated) {
                this._offSignalingDialogTerminated()
                this._offSignalingDialogTerminated = null
            }

            this._forgetFromUA()

            return
        }

        this.terminate({ userTerminated: true })
        this._forgetFromUA()
    }

    /**
     * After a reconnect the session id changes while UA._msrp_sessions keeps the old
     * key: drop every entry of this session so UA.stop() does not terminate it again.
     */
    _forgetFromUA () {
        const sessions = this._ua._msrp_sessions

        if (!sessions) {
            return
        }

        Object.keys(sessions).forEach((key) => {
            if (sessions[key] === this) {
                delete sessions[key]
            }
        })
    }

    _terminateViaSignaling (options) {
        const cause = options.cause || JsSIP_C.causes.BYE

        if (this._status === C.STATUS_TERMINATED) {
            throw new Exceptions.InvalidStateError(this._status)
        }

        this.status = 'terminated'

        const callId = this._signalingCallId
        const wasConfirmed = this._status === C.STATUS_CONFIRMED

        if (callId && (wasConfirmed || this._status === C.STATUS_INVITE_SENT)) {
            this._signaling.bye(callId).catch((error) => {
                console.warn('MSRP BYE via external signaling failed:', error)
            })
        }

        if (this._userTerminated) {
            if (this._offSignalingDialogTerminated) {
                this._offSignalingDialogTerminated()
                this._offSignalingDialogTerminated = null
            }
            if (this._ua._msrpSignalingSessions) {
                this._ua._msrpSignalingSessions.delete(this)
            }
        }

        if (wasConfirmed) {
            this._ended('local', null, cause)
        } else {
            this._status = C.STATUS_CANCELED
            this._failed('local', null, JsSIP_C.causes.CANCELED)
        }
    }

    _startKeepAliveInterval () {
        this._stopKeepAliveInterval()

        if (!this._keepAliveInterval || this._signalingOnly) {
            return
        }

        this._msrpKeepAliveTimer = setInterval(() => {
            if (this._userTerminated || this._reconnectScheduled || this.status !== 'active') {
                return
            }

            if (!this._connection || this._connection.readyState !== WebSocket.OPEN) {
                return
            }

            try {
                this._sendKeepAlive()
                this._startKeepAlivePongTimer()
            } catch (err) {
                console.error('Failed to send keep-alive:', err)
                this._onKeepAliveFailure('keep-alive send threw')
            }
        }, this._keepAliveInterval)
    }

    _stopKeepAliveInterval () {
        clearInterval(this._msrpKeepAliveTimer)
        this._msrpKeepAliveTimer = null
    }

    /**
     * Signaling-only mode: performs the SIP part (INVITE/ACK, later BYE) of an
     * MSRP session whose socket lives in another OpenSIPSJS instance. No MSRP
     * socket is opened here. Resolves with the remote SDP answer.
     */
    inviteForExternalSession ({ target, sdp, callId, fromTag, realm }) {
        this._signalingOnly = true
        this._direction = 'outgoing'
        this.target = target

        return new Promise((resolve, reject) => {
            const requestParams = {
                call_id: callId,
                from_tag: fromTag
            }
            const extraHeaders = []
            // The realm learned by the MSRP side, else ours (known only after a digest
            // challenge, which the server may skip for REGISTER), else the SIP domain.
            const domain = realm || this._ua._configuration.realm || this._ua._configuration.uri.host

            requestParams.to_uri   = new URI('sip', target,                           domain)
            requestParams.from_uri = new URI('sip', this._ua._configuration.uri.user, this._ua._configuration.uri.host)

            extraHeaders.push(`Contact: ${this._ua.contact.toString({
                outbound: true
            })}`)
            extraHeaders.push('Content-Type: application/sdp')

            this._localSdp = sdp
            this._request = new SIPMessage.InitialOutgoingInviteRequest(
                new URI('sip', target, domain).clone(),
                this._ua,
                requestParams,
                extraHeaders,
                sdp)
            this._from_tag = this._request.from._parameters.tag
            this._id = this._request.call_id + this._from_tag

            let settled = false
            let answer = null

            const fail = (cause) => {
                if (settled) return
                settled = true
                reject(new Error(cause))
            }

            this.once('failed', (event) => fail((event && event.cause) || 'failed'))

            // Emitted by _receiveInviteResponse() once the ACK for the 2xx was sent.
            this.once('confirmed', () => {
                if (settled || !answer) return

                if (this._terminateWhenConfirmed) {
                    this.terminate()
                    fail(JsSIP_C.causes.CANCELED)

                    return
                }

                settled = true
                this.status = 'active'
                resolve({
                    toTag: answer.to_tag,
                    sdp: answer.body,
                    sessionExpires: answer.session_expires,
                    sessionExpiresRefresher: answer.session_expires_refresher
                })
            })

            const request_sender = new RequestSender(this._ua, this._request, {
                onRequestTimeout: () => {
                    this.onRequestTimeout()
                    fail(JsSIP_C.causes.REQUEST_TIMEOUT)
                },
                onTransportError: () => {
                    this.onTransportError()
                    fail(JsSIP_C.causes.CONNECTION_ERROR)
                },
                onAuthenticated: (request) => {
                    this._request = request
                },
                onReceiveResponse: (response) => {
                    if (!answer && response.status_code >= 200 && response.status_code < 300) {
                        answer = response
                    }

                    this._receiveInviteResponse(response)
                }
            })
            request_sender.send()
            this._status = C.STATUS_INVITE_SENT
        })
    }

    /** Signaling-only mode: sends BYE for the dialog (or ends it once the pending INVITE is answered). */
    terminateExternalSession () {
        if (this._status === C.STATUS_CONFIRMED) {
            this.terminate()
        } else if (this._status === C.STATUS_INVITE_SENT || this._status === C.STATUS_1XX_RECEIVED) {
            this._terminateWhenConfirmed = true
        }
    }

    /**
     * Signaling-only mode: forgets a confirmed dialog locally without sending BYE
     * (same as an MSRP reconnect does). A dialog still being set up is ended
     * once its INVITE is answered.
     */
    dropExternalSession () {
        if (this._status !== C.STATUS_CONFIRMED) {
            this._terminateWhenConfirmed = true

            return
        }

        if (this._dialog) {
            try {
                this._dialog.terminate()
            } catch (error) {
                console.log('drop | error terminating dialog:', error)
            }
            this._dialog = null
        }

        this._status = C.STATUS_TERMINATED
        this.status = 'terminated'
    }

    terminate (options = {}) {
        // clearInterval(this._msrpKeepAliveTimer)

        const isPermanentClose =
            options.userTerminated === true ||
            (!options.status_code && this._ua && this._ua.activeConnection === false)

        if (isPermanentClose) {
            this._userTerminated = true
            this._reconnectScheduled = false
            clearTimeout(this._reconnectTimer)
            this._reconnectTimer = null
        }

        if (this._signaling) {
            this._terminateViaSignaling(options)

            return
        }

        const cause = options.cause || JsSIP_C.causes.BYE
        const extraHeaders = Utils.cloneArray(options.extraHeaders)
        const body = options.body

        let cancel_reason
        let status_code = options.status_code
        let reason_phrase = options.reason_phrase

        // Check Session Status.
        if (this._status === C.STATUS_TERMINATED) {
            throw new Exceptions.InvalidStateError(this._status)
        }

        this.status = 'terminated'

        switch (this._status) {
            // - UAC -
            case C.STATUS_NULL:
            case C.STATUS_INVITE_SENT:
            case C.STATUS_1XX_RECEIVED:

                if (status_code && (status_code < 200 || status_code >= 700)) {
                    throw new TypeError(`Invalid status_code: ${status_code}`)
                } else if (status_code) {
                    reason_phrase = reason_phrase || JsSIP_C.REASON_PHRASE[status_code] || ''
                    cancel_reason = `SIP ;cause=${status_code} ;text="${reason_phrase}"`
                }

                // Check Session Status.
                if (this._status === C.STATUS_NULL || this._status === C.STATUS_INVITE_SENT) {
                    this._is_canceled = true
                    this._cancel_reason = cancel_reason
                } else if (this._status === C.STATUS_1XX_RECEIVED) {
                    this._request.cancel(cancel_reason)
                }

                this._status = C.STATUS_CANCELED
                this._failed('local', null, JsSIP_C.causes.CANCELED)
                break

            // - UAS -
            case C.STATUS_WAITING_FOR_ANSWER:
            case C.STATUS_ANSWERED:
                status_code = status_code || 480

                if (status_code < 300 || status_code >= 700) {
                    throw new TypeError(`Invalid status_code: ${status_code}`)
                }

                this._request.reply(status_code, reason_phrase, extraHeaders, body)
                this._failed('local', null, JsSIP_C.causes.REJECTED)
                break

            case C.STATUS_WAITING_FOR_ACK:
            case C.STATUS_CONFIRMED:
                reason_phrase = options.reason_phrase || JsSIP_C.REASON_PHRASE[status_code] || ''

                if (status_code && (status_code < 200 || status_code >= 700)) {
                    throw new TypeError(`Invalid status_code: ${status_code}`)
                } else if (status_code) {
                    extraHeaders.push(`Reason: SIP ;cause=${status_code}; text="${reason_phrase}"`)
                }

                /* RFC 3261 section 15 (Terminating a session):
                  *
                  * "...the callee's UA MUST NOT send a BYE on a confirmed dialog
                  * until it has received an ACK for its 2xx response or until the server
                  * transaction times out."
                  */
                if (this._status === C.STATUS_WAITING_FOR_ACK &&
                    this._direction === 'incoming' &&
                    this._request.server_transaction.state !== Transactions.C.STATUS_TERMINATED) {

                    // Save the dialog for later restoration.
                    const dialog = this._dialog

                    // Send the BYE as soon as the ACK is received...
                    this.receiveRequest = ({ method }) => {
                        if (method === JsSIP_C.ACK) {
                            this.sendRequest(JsSIP_C.BYE, {
                                extraHeaders,
                                body
                            })
                            dialog.terminate()
                        }
                    }

                    // .., or when the INVITE transaction times out
                    this._request.server_transaction.on('stateChanged', () => {
                        if (this._request.server_transaction.state ===
                            Transactions.C.STATUS_TERMINATED) {
                            this.sendRequest(JsSIP_C.BYE, {
                                extraHeaders,
                                body
                            })
                            dialog.terminate()
                        }
                    })

                    this._ended('local', null, cause)

                    // Restore the dialog into 'this' in order to be able to send the in-dialog BYE :-).
                    this._dialog = dialog

                    // Restore the dialog into 'ua' so the ACK can reach 'this' session.
                    this._ua.newDialog(dialog)
                } else {
                    this.sendRequest(JsSIP_C.BYE, {
                        extraHeaders,
                        body
                    })

                    this._ended('local', null, cause)
                }
        }
    }

    sendRequest (method, options) {
        return this._dialog.sendRequest(method, options)
    }

    authenticate (auth) {
        this.status = 'auth'
        let msgObj = new Message('')
        msgObj.method = 'AUTH'
        msgObj.addHeader('To-Path', `msrp://${this._ua._configuration.realm}:2856;ws`)
        msgObj.addHeader('From-Path',
            `msrp://${this.credentials.username}.${this.credentials.realm}:2856/${this.auth_id};ws`)
        if (auth) {
            msgObj.addHeader('Authorization', auth.toString())
        }

        //--------------------------------
        let str = msgObj.toString()
        let result = []
        for (var i=0; i<str.length; i++) {
            result.push(str.charCodeAt(i).toString(16))
        }
        //-----------------------------------

        this._connection.send(msgObj.toString())
    }

    onmessage (msg) {
        this._markSocketAlive()

        const msgObj = new Message(msg.data)
        if (this.status === 'auth' && msgObj.code === 401) {
            const _challenge = this.parseAuth(msgObj.getHeader('WWW-Authenticate'))
            this._adoptChallengeRealm(_challenge.realm)
            const digestAuthentication = new DigestAuthentication(this.credentials)
            digestAuthentication.authenticate({
                method: 'AUTH',
                ruri: `msrp://${this._ua._configuration.realm}:2856;ws`,
                body: null
            }, _challenge, Utils.createRandomToken(12))
            this.authenticate(digestAuthentication)
        }
        if (this.status === 'auth' && msgObj.code === 200 && this._direction === 'outgoing') {
            this.my_addr.push(msgObj.getHeader('To-Path'))
            this.my_addr.push(msgObj.getHeader('Use-Path'))
            this.status = 'active'
            this.inviteParty(msgObj)
        } else if (this.status === 'auth' && msgObj.code === 200 && this._direction === 'incoming') {
            this.my_addr.push(msgObj.getHeader('To-Path'))
            this.my_addr.push(msgObj.getHeader('Use-Path'))
            this.status = 'active'
            this.acceptParty(msgObj)
            this.emit('confirmed')
        } else if (msgObj.method === 'SEND') {
            this._sendOk(msgObj)

            this._sendReport(msgObj)

            msgObj.direction = 'incoming'
            this.emit('newMessage', msgObj)

            this._msgHistory.push(msgObj)
            this.emit('msgHistoryUpdate', this._msgHistory)
        }
        if (msgObj.code === 480) {
            this._close()
        }
    }

    onclose (event) {
        console.log('close', event && event.code)

        if (this._userTerminated) {
            return
        }

        if (this._reconnectScheduled) {
            return
        }

        this._scheduleReconnect()
    }

    _scheduleReconnect () {
        if (this._userTerminated || this._reconnectScheduled || this._signalingOnly) {
            return
        }

        this._reconnectScheduled = true
        clearTimeout(this._reconnectTimer)
        this._reconnectTimer = setTimeout(() => {
            this._reconnectAttempt()
        }, this._reconnectInterval)

        this.emit('reconnecting')
    }

    _reconnectAttempt () {
        if (this._userTerminated) {
            return
        }

        this._reconnectScheduled = false

        console.log('MSRP socket: attempting to reconnect...')

        this._resetForReconnect()
        this._reconnectInProgress = true
        this.connect(this.target)
    }

    _resetForReconnect () {
        if (this._connection) {
            this._connection.onopen = null
            this._connection.onclose = null
            this._connection.onmessage = null
            this._connection.onerror = null
            try {
                this._connection.close()
            } catch (error) {
                console.log('reset | error closing old MSRP socket:', error)
            }
        }

        for (const timer in this._timers) {
            if (Object.prototype.hasOwnProperty.call(this._timers, timer)) {
                clearTimeout(this._timers[timer])
            }
        }

        clearTimeout(this._sessionTimers.timer)
        this._sessionTimers.running = false
        clearTimeout(this._keepAlivePongTimer)
        this._keepAlivePongTimer = null
        this._awaitingKeepAlivePong = false
        this._stopKeepAliveInterval()
        this._signalingCallId = null

        if (this._dialog) {
            try {
                this._dialog.terminate()
            } catch (error) {
                console.log('reset | error terminating dialog:', error)
            }
            this._dialog = null
        }

        for (const dialog in this._earlyDialogs) {
            if (Object.prototype.hasOwnProperty.call(this._earlyDialogs, dialog)) {
                try {
                    this._earlyDialogs[dialog].terminate()
                } catch (error) {
                    console.log('reset | error terminating early dialog:', error)
                }
                delete this._earlyDialogs[dialog]
            }
        }

        this.my_addr = []
        this.target_addr = []

        this._request = null
        this._from_tag = null
        this._to_tag = null

        this.status = 'new'
        this._status = C.STATUS_NULL
    }

    /**
     * MSRP-only mode without an HA1: the realm was only a guess (the SIP domain),
     * so take the real one from the relay challenge. It is the SIP realm too and
     * ends up in From-Path, the digest URI, the SDP path and the INVITE R-URI —
     * the same values as when the realm comes from a SIP REGISTER challenge.
     */
    _adoptChallengeRealm (realm) {
        if (!this._signaling || this.credentials.ha1 || !realm || realm === this.credentials.realm) {
            return
        }

        this.credentials.realm = realm
        this._ua._configuration.realm = realm
    }

    _onReconnected () {
        this._reconnectScheduled = false
        this._reconnectInProgress = false
        clearTimeout(this._reconnectTimer)
        this._reconnectTimer = null
    }

    _markSocketAlive () {
        this._awaitingKeepAlivePong = false
        clearTimeout(this._keepAlivePongTimer)
        this._keepAlivePongTimer = null
    }

    _startKeepAlivePongTimer () {
        this._awaitingKeepAlivePong = true
        clearTimeout(this._keepAlivePongTimer)
        this._keepAlivePongTimer = setTimeout(() => {
            if (this._awaitingKeepAlivePong) {
                this._onKeepAliveFailure('no keep-alive reply within timeout')
            }
        }, this._keepAlivePongTimeout)
    }

    _onKeepAliveFailure (reason) {
        this._markSocketAlive()

        if (this._userTerminated || this._reconnectScheduled) {
            return
        }

        console.warn('MSRP keep-alive failure detected:', reason)
        this._scheduleReconnect()
    }

    onopen () {
        // No WebRTC in this context (e.g. extension service worker): the local IP
        // is only informative in the SDP, so authenticate with the default one.
        if (typeof RTCPeerConnection === 'undefined') {
            this.authenticate(null)

            return
        }

        const pc = new RTCPeerConnection({ iceServers: [] })
        pc.createDataChannel('')
        pc.createOffer().then(pc.setLocalDescription.bind(pc))
        pc.onicecandidate = (ice) => {
            if (!ice || !ice.candidate || !ice.candidate.candidate) return
            const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/
            const ipMatch = ice.candidate.candidate.match(ipRegex)
            this.my_ip = ipMatch && ipMatch[1]
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            pc.onicecandidate = () => {}
            this.authenticate(null)
        }
    }

    onerror (e) {
        console.log(e)
    }

    _receiveInviteResponse (response) {
        console.log('resp0000000000000', response)
        // Handle 2XX retransmissions and responses from forked requests.
        if (this._dialog && (response.status_code >=200 && response.status_code <=299)) {
            console.log('200000000000000')
            /*
             * If it is a retransmission from the endpoint that established
             * the dialog, send an ACK
             */
            if (this._dialog.id.call_id === response.call_id &&
                this._dialog.id.local_tag === response.from_tag &&
                this._dialog.id.remote_tag === response.to_tag) {
                this.sendRequest(JsSIP_C.ACK)

                return
            } else {
                // If not, send an ACK  and terminate.
                const dialog = new Dialog(this, response, 'UAC')

                if (dialog.error !== undefined) {
                    console.log(dialog.error)

                    return
                }

                this.sendRequest(JsSIP_C.ACK)
                this.sendRequest(JsSIP_C.BYE)

                return
            }

        }

        // Proceed to cancellation if the user requested.
        if (this._is_canceled) {
            if (response.status_code >= 100 && response.status_code < 200) {
                this._request.cancel(this._cancel_reason)
            } else if (response.status_code >= 200 && response.status_code < 299) {
                this._acceptAndTerminate(response)
            }

            return
        }

        if (this._status !== C.STATUS_INVITE_SENT && this._status !== C.STATUS_1XX_RECEIVED) {
            return
        }
        console.log('start Switch')
        switch (true) {
            case /^100$/.test(response.status_code):
                this._status = C.STATUS_1XX_RECEIVED
                break

            case /^1[0-9]{2}$/.test(response.status_code):
            {
                // Do nothing with 1xx responses without To tag.
                if (!response.to_tag) {
                    console.log('1xx response received without to tag')
                    break
                }

                // Create Early Dialog if 1XX comes with contact.
                if (response.hasHeader('contact')) {
                    // An error on dialog creation will fire 'failed' event.
                    if (!this._createDialog(response, 'UAC', true)) {
                        break
                    }
                }

                this._status = C.STATUS_1XX_RECEIVED

                if (!response.body) {
                    this._progress('remote', response)
                    break
                }

                const e = {
                    originator: 'remote',
                    type: 'answer',
                    sdp: response.body
                }

                console.log('emit "sdp"')
                this.emit('sdp', e)

                const answer = new RTCSessionDescription({
                    type: 'answer',
                    sdp: e.sdp
                })

                this._connectionPromiseQueue = this._connectionPromiseQueue
                    .then(() => this._connection.setRemoteDescription(answer))
                    .then(() => this._progress('remote', response))
                    .catch((error) => {
                        console.log('emit "peerconnection:setremotedescriptionfailed" [error:%o]', error)

                        this.emit('peerconnection:setremotedescriptionfailed', error)
                    })
                break
            }

            case /^2[0-9]{2}$/.test(response.status_code):
            { console.log('maybe here???')
                this._status = C.STATUS_CONFIRMED

                if (!response.body) {
                    this._acceptAndTerminate(response, 400, JsSIP_C.causes.MISSING_SDP)
                    console.log('failed 3')
                    this._failed('remote', response, JsSIP_C.causes.BAD_MEDIA_DESCRIPTION)
                    break
                }

                // An error on dialog creation will fire 'failed' event.
                if (!this._createDialog(response, 'UAC')) {
                    break
                }

                const e = {
                    originator: 'remote',
                    type: 'answer',
                    sdp: response.body
                }

                console.log('emit "sdp"')
                this.emit('sdp', e)

                /*
                 * Leftover from JsSIP RTCSession: the result is never used (MSRP has no
                 * RTCPeerConnection to apply it to) and RTCSessionDescription does not
                 * exist outside a window (e.g. extension service worker).
                 */
                // new RTCSessionDescription({
                //     type: 'answer',
                //     sdp: e.sdp
                // })

                this._connectionPromiseQueue = this._connectionPromiseQueue
                    .then(() => {
                        // Be ready for 200 with SDP after a 180/183 with SDP.
                        // We created a SDP 'answer' for it, so check the current signaling state.
                        // `_connection` is the MSRP WebSocket (no signalingState) and is absent
                        // in signaling-only sessions, which would otherwise break the ACK below.
                        if (this._connection && this._connection.signalingState === 'stable') {
                            return this._connection.createOffer(this._rtcOfferConstraints)
                                .then((offer) => this._connection.setLocalDescription(offer))
                                .catch((error) => {
                                    this._acceptAndTerminate(response, 500, error.toString())
                                    console.log('failed 4')
                                    this._failed('local', response, JsSIP_C.causes.WEBRTC_ERROR)
                                })
                        }
                    })
                    .then(() => {
                        // console.log(this._connection)
                        // this._connection.setRemoteDescription(answer)
                        //     .then(() =>
                        //     {
                        // Handle Session Timers.
                        this._handleSessionTimersInIncomingResponse(response)

                        this._accepted('remote', response)
                        this.sendRequest(JsSIP_C.ACK)
                        this._confirmed('local', null)
                        // })
                        // .catch((error) =>
                        // {
                        //     this._acceptAndTerminate(response, 488, 'Not Acceptable Here')
                        //     this._failed('remote', response, JsSIP_C.causes.BAD_MEDIA_DESCRIPTION)
                        //
                        //     console.log('emit "peerconnection:setremotedescriptionfailed" [error:%o]', error)
                        //
                        //     this.emit('peerconnection:setremotedescriptionfailed', error)
                        // })
                    })
                break
            }

            default:
            {
                const cause = Utils.sipErrorCause(response.status_code)
                console.log('failed 5')
                this._failed('remote', response, cause)
            }
        }
    }

    sendMSRP (message) {
        const msgObj = new Message('')
        let toPath = ''
        if(this.my_addr[1]) toPath = this.my_addr[1]
        if(this.target_addr[1]) toPath += ' ' + this.target_addr[1]
        if(this.target_addr[0]) toPath += ' ' + this.target_addr[0]
        msgObj.method = 'SEND'
        // msgObj.addHeader('To-Path', `${this.my_addr[1]} ${this.target_addr[1]} ${this.target_addr[0]}`)
        msgObj.addHeader('To-Path', toPath)
        msgObj.addHeader('From-Path', `${this.my_addr[0]}`)
        msgObj.addHeader('Message-ID', Utils.createRandomToken(10))
        msgObj.addHeader('Byte-Range', '1-25/25')
        msgObj.addHeader('Content-Type', 'text/plain')
        msgObj.addHeader('Success-Report', 'yes')
        msgObj.addHeader('Failure-Report', 'yes')
        // msgObj.addHeader('To', this._to_tag)
        // msgObj.addHeader('From', this._from_tag)
        msgObj.body = message

        //--------------------------------
        let str = msgObj.toString()
        console.log(str)
        let result = []
        for (var i=0; i<str.length; i++) {
            result.push(str.charCodeAt(i).toString(16))
        }
        console.log(result)
        //-----------------------------------

        this._connection.send(msgObj.toString())

        msgObj.direction = 'outgoing'

        this.emit('newMessage', msgObj)
        this._msgHistory.push(msgObj)

        this.emit('msgHistoryUpdate', this._msgHistory)
    }

    _sendOk (msgObj) {

        let _i = msgObj.ident
        let _mId = msgObj.getHeader('Message-ID')
        let _ok = new Message('')
        _ok.method = '200 OK'
        _ok.addHeader('To-Path', `${this.my_addr[1]}`)
        _ok.addHeader('From-Path', `${this.my_addr[0]}`)
        _ok.addHeader('Message-ID', _mId)
        _ok.ident = _i

        //--------------------------------
        let str = _ok.toString()
        console.log(str)
        let result = []
        for (var i=0; i<str.length; i++) {
            result.push(str.charCodeAt(i).toString(16))
        }
        console.log(result)
        //-----------------------------------

        this._connection.send(_ok.toString())

    }

    _sendReport (msgObj) {

        let _i = msgObj.ident
        let _mId = msgObj.getHeader('Message-ID')
        let _report = new Message('')
        _report.method = 'REPORT'
        _report.addHeader('To-Path', `${msgObj.getHeader('From-Path')}`)
        _report.addHeader('From-Path', `${this.my_addr[0]}`)
        _report.addHeader('Message-ID', _mId)
        _report.addHeader('Byte-Range', '1-25/25')
        _report.addHeader('Status', '000 200 OK')
        _report.ident = _i

        //--------------------------------
        let str = _report.toString()
        console.log(str)
        let result = []
        for (var i=0; i<str.length; i++) {
            result.push(str.charCodeAt(i).toString(16))
        }
        console.log(result)
        //-----------------------------------

        this._connection.send(_report.toString())

    }

    parseAuth (content) {
        const _challenge = {}
        const _challengeArray = content.replace('Digest', '').split(',')
        for (const _authItem of _challengeArray) {
            const _itemArray = _authItem.trim().split('=')
            _challenge[_itemArray[0]] = _itemArray[1].match('^"(.+)"$')[1]
        }

        return _challenge
    }

    init_incoming (request, initCallback) {

        let expires
        const contentType = request.hasHeader('Content-Type') ?
            request.getHeader('Content-Type').toLowerCase() : undefined

        // Check body and content type.
        if (request.body && (contentType !== 'application/sdp')) {
            request.reply(415)

            return
        }

        // Session parameter initialization.
        this._status = C.STATUS_INVITE_RECEIVED
        this._from_tag = request.from_tag
        this._id = request.call_id + this._from_tag
        this._request = request
        this._contact = this._ua.contact.toString()

        // Get the Expires header value if exists.
        if (request.hasHeader('expires')) {
            expires = request.getHeader('expires') * 1000
        }

        /* Set the to_tag before
         * replying a response code that will create a dialog.
         */
        request.to_tag = Utils.newTag()

        // An error on dialog creation will fire 'failed' event.
        if (!this._createDialog(request, 'UAS', true)) {
            request.reply(500, 'Missing Contact header field')

            return
        }

        if (request.body) {
            this._late_sdp = false
        } else {
            this._late_sdp = true
        }

        this._status = C.STATUS_WAITING_FOR_ANSWER

        // Set userNoAnswerTimer.
        this._timers.userNoAnswerTimer = setTimeout(() => {
            request.reply(408)
            console.log('failed 6')
            this._failed('local', null, JsSIP_C.causes.NO_ANSWER)
        }, this._ua.configuration.no_answer_timeout
        )

        /* Set expiresTimer
         * RFC3261 13.3.1
         */
        if (expires) {
            this._timers.expiresTimer = setTimeout(() => {
                if (this._status === C.STATUS_WAITING_FOR_ANSWER) {
                    request.reply(487)
                    console.log('failed 7')
                    this._failed('system', null, JsSIP_C.causes.EXPIRES)
                }
            }, expires
            )
        }

        // Set internal properties.
        this._direction = 'incoming'
        this._local_identity = request.to
        this._remote_identity = request.from

        // A init callback was specifically defined.
        if (initCallback) {
            initCallback(this)
        }

        request.parseSDP(true)
        this.target_addr = request.sdp.media[0].invalid[1].value.replaceAll('path:', '').split(' ').reverse()

        // Fire 'newMSRPSession' event.
        this._newMSRPSession('remote', request)

        // The user may have rejected the call in the 'newRTCSession' event.
        if (this._status === C.STATUS_TERMINATED) {
            return
        }

        // Reply 180.
        request.reply(180, null, [ `Contact: ${this._ua._contact}` ])

        // Fire 'progress' event.
        // TODO: Document that 'response' field in 'progress' event is null for incoming calls.
        this._progress('local', null)
    }

    _failed (originator, message, cause) {
        this.emit('_failed', {
            originator,
            message: message || null,
            cause
        })
        this._close()

        this.emit('failed', {
            originator,
            message: message || null,
            cause
        })
    }

    _close () {
        console.log('CLOSE SESSION')
        if (this._status === C.STATUS_TERMINATED) {
            return
        }

        this._status = C.STATUS_TERMINATED

        this._stopKeepAliveInterval()

        // Terminate RTC.
        if (this._connection) {
            try {
                this._connection.close()
            } catch (error) {
                console.log('close() | error closing the RTCPeerConnection: %o', error)
            }
        }

        // Terminate signaling.

        // Clear SIP timers.
        for (const timer in this._timers) {
            if (Object.prototype.hasOwnProperty.call(this._timers, timer)) {
                clearTimeout(this._timers[timer])
            }
        }

        // Clear Session Timers.
        clearTimeout(this._sessionTimers.timer)

        // Terminate confirmed dialog.
        if (this._dialog) {
            this._dialog.terminate()
            delete this._dialog
        }

        // Terminate early dialogs.
        for (const dialog in this._earlyDialogs) {
            if (Object.prototype.hasOwnProperty.call(this._earlyDialogs, dialog)) {
                this._earlyDialogs[dialog].terminate()
                delete this._earlyDialogs[dialog]
            }
        }

        // Terminate REFER subscribers.
        for (const subscriber in this._referSubscribers) {
            if (Object.prototype.hasOwnProperty.call(this._referSubscribers, subscriber)) {
                delete this._referSubscribers[subscriber]
            }
        }

        this._ua.destroyMSRPSession(this)
    }

    _createDialog (message, type, early) {
        const local_tag = (type === 'UAS') ? message.to_tag : message.from_tag
        const remote_tag = (type === 'UAS') ? message.from_tag : message.to_tag
        const id = message.call_id + local_tag + remote_tag

        let early_dialog = this._earlyDialogs[id]

        // Early Dialog.
        if (early) {
            if (early_dialog) {
                return true
            } else {
                early_dialog = new Dialog(this, message, type, Dialog.C.STATUS_EARLY)

                // Dialog has been successfully created.
                if (early_dialog.error) {
                    console.log('failed 8')
                    this._failed('remote', message, JsSIP_C.causes.INTERNAL_ERROR)

                    return false
                } else {
                    this._earlyDialogs[id] = early_dialog

                    return true
                }
            }
        } else {
            // Confirmed Dialog.
            this._from_tag = message.from_tag
            this._to_tag = message.to_tag

            // In case the dialog is in _early_ state, update it.
            if (early_dialog) {
                early_dialog.update(message, type)
                this._dialog = early_dialog
                delete this._earlyDialogs[id]

                return true
            }

            // Otherwise, create a _confirmed_ dialog.
            const dialog = new Dialog(this, message, type)

            if (dialog.error) {
                console.log('failed 9')
                this._failed('remote', message, JsSIP_C.causes.INTERNAL_ERROR)

                return false
            } else {
                this._dialog = dialog

                return true
            }
        }
    }

    _newMSRPSession (originator, request) {
        if (this._reconnectInProgress) {
            return
        }

        this._ua.newMSRPSession(this, {
            originator,
            session: this,
            request
        })
    }

    _progress (originator, response) {
        this.emit('progress', {
            originator,
            response: response || null
        })
    }

    isEnded () {
        switch (this._status) {
            case C.STATUS_CANCELED:
            case C.STATUS_TERMINATED:
                return true
            default:
                return false
        }
    }

    _accepted (originator, message) {
        console.log('session accepted')

        this._start_time = new Date()

        console.log('emit "accepted"')

        this.emit('accepted', {
            originator,
            response: message || null
        })
    }

    _confirmed (originator, ack) {
        console.log('session confirmed')

        this._is_confirmed = true

        console.log('emit "confirmed"')

        this.emit('confirmed', {
            originator,
            ack: ack || null
        })
    }

    _ended (originator, message, cause) {
        console.log('session ended')

        this._end_time = new Date()

        this._close()

        console.log('emit "ended"')

        this.emit('ended', {
            originator,
            message: message || null,
            cause
        })
    }

    _runKeepAliveTimer () {
        // Keep-alive is sent over the MSRP socket, which a signaling-only session does not own.
        if (this._signalingOnly) {
            return
        }

        if (!this._sessionTimers || !this._sessionTimers.enabled || this._sessionTimers.running) {
            return
        }

        if (!this._sessionTimers.currentExpires) {
            this._sessionTimers.currentExpires = this._sessionTimers.defaultExpires || 30
        }

        if (!this._sessionTimers.refresher) {
            console.log('Not the refresher; waiting for remote keep-alive')
            return
        }

        const t = this._sessionTimers.currentExpires
        this._sessionTimers.running = true
        clearTimeout(this._sessionTimers.timer)

        this._sessionTimers.timer = setTimeout(() => {
            if (this._userTerminated || this._reconnectScheduled) {
                return
            }

            if (this._connection && this._connection.readyState === WebSocket.OPEN) {
                try {
                    this._sendKeepAlive()
                    console.log('Session timer: sending MSRP keep-alive')
                    this._startKeepAlivePongTimer()
                } catch (err) {
                    console.error('Failed to send keep-alive:', err)
                    this._onKeepAliveFailure('keep-alive send threw')
                    return
                }
            } else {
                this._onKeepAliveFailure('socket not open on keep-alive tick')
                return
            }

            this._sessionTimers.running = false
            this._runKeepAliveTimer()
        }, t * 1000 * 0.5)
    }

    _handleSessionTimersInIncomingResponse (response) {
        if (!this._sessionTimers.enabled) { return }

        let session_expires_refresher

        if (response.session_expires &&
            response.session_expires >= JsSIP_C.MIN_SESSION_EXPIRES) {
            this._sessionTimers.currentExpires = response.session_expires
            session_expires_refresher = response.session_expires_refresher || 'uac'
        } else {
            this._sessionTimers.currentExpires = this._sessionTimers.defaultExpires
            session_expires_refresher = 'uac'
        }

        this._sessionTimers.refresher = (session_expires_refresher === 'uac')
        // this._runSessionTimer()
        this._runKeepAliveTimer()
    }

    receiveRequest (request) {
        console.log('receiveRequest()')

        if (request.method === JsSIP_C.CANCEL) {
            /* RFC3261 15 States that a UAS may have accepted an invitation while a CANCEL
            * was in progress and that the UAC MAY continue with the session established by
            * any 2xx response, or MAY terminate with BYE. JsSIP does continue with the
            * established session. So the CANCEL is processed only if the session is not yet
            * established.
            */

            /*
            * Terminate the whole session in case the user didn't accept (or yet send the answer)
            * nor reject the request opening the session.
            */
            if (this._status === C.STATUS_WAITING_FOR_ANSWER ||
                this._status === C.STATUS_ANSWERED) {
                this._status = C.STATUS_CANCELED
                this._request.reply(487)
                console.log('failed 10')
                this._failed('remote', request, JsSIP_C.causes.CANCELED)
            }
        } else {
            // Requests arriving here are in-dialog requests.
            switch (request.method) {
                case JsSIP_C.ACK:
                    if (this._status !== C.STATUS_WAITING_FOR_ACK) {
                        return
                    }

                    // Update signaling status.
                    this._status = C.STATUS_CONFIRMED

                    clearTimeout(this._timers.ackTimer)
                    clearTimeout(this._timers.invite2xxTimer)

                    if (this._late_sdp) {
                        if (!request.body) {
                            this.terminate({
                                cause: JsSIP_C.causes.MISSING_SDP,
                                status_code: 400
                            })
                            break
                        }

                        const e = {
                            originator: 'remote',
                            type: 'answer',
                            sdp: request.body
                        }

                        console.log('emit "sdp"')
                        this.emit('sdp', e)

                        const answer = new RTCSessionDescription({
                            type: 'answer',
                            sdp: e.sdp
                        })

                        this._connectionPromiseQueue = this._connectionPromiseQueue
                            .then(() => this._connection.setRemoteDescription(answer))
                            .then(() => {
                                if (!this._is_confirmed) {
                                    this._confirmed('remote', request)
                                }
                            })
                            .catch((error) => {
                                this.terminate({
                                    cause: JsSIP_C.causes.BAD_MEDIA_DESCRIPTION,
                                    status_code: 488
                                })

                                console.log('emit "peerconnection:setremotedescriptionfailed" [error:%o]', error)
                                this.emit('peerconnection:setremotedescriptionfailed', error)
                            })
                    } else
                    if (!this._is_confirmed) {
                        this._confirmed('remote', request)
                    }

                    break
                case JsSIP_C.BYE:
                    if (this._status === C.STATUS_CONFIRMED ||
                        this._status === C.STATUS_WAITING_FOR_ACK) {
                        request.reply(200)
                        this._ended('remote', request, JsSIP_C.causes.BYE)
                    } else if (this._status === C.STATUS_INVITE_RECEIVED ||
                        this._status === C.STATUS_WAITING_FOR_ANSWER) {
                        request.reply(200)
                        this._request.reply(487, 'BYE Received')
                        this._ended('remote', request, JsSIP_C.causes.BYE)
                    } else {
                        request.reply(403, 'Wrong Status')
                    }
                    break
                case JsSIP_C.INVITE:
                    if (this._signalingOnly && this._status === C.STATUS_CONFIRMED) {
                        // Session refresh: keep the same MSRP path.
                        request.reply(200, null, [
                            `Contact: ${this._ua.contact.toString({ outbound: true })}`,
                            'Content-Type: application/sdp'
                        ], this._localSdp)
                    } else if (this._status === C.STATUS_CONFIRMED) {
                        if (request.hasHeader('replaces')) {
                            this._receiveReplaces(request)
                        } else {
                            this._receiveReinvite(request)
                        }
                    } else {
                        request.reply(403, 'Wrong Status')
                    }
                    break
                case JsSIP_C.INFO:
                    if (this._status === C.STATUS_1XX_RECEIVED ||
                        this._status === C.STATUS_WAITING_FOR_ANSWER ||
                        this._status === C.STATUS_ANSWERED ||
                        this._status === C.STATUS_WAITING_FOR_ACK ||
                        this._status === C.STATUS_CONFIRMED) {
                        const contentType = request.hasHeader('Content-Type') ?
                            request.getHeader('Content-Type').toLowerCase() : undefined

                        if (contentType !== undefined) {
                            new RTCSession_Info(this).init_incoming(request)
                        } else {
                            request.reply(415)
                        }
                    } else {
                        request.reply(403, 'Wrong Status')
                    }
                    break
                case JsSIP_C.UPDATE:
                    if (this._signalingOnly && this._status === C.STATUS_CONFIRMED) {
                        // Session refresh without SDP change.
                        request.reply(200)
                    } else if (this._status === C.STATUS_CONFIRMED) {
                        this._receiveUpdate(request)
                    } else {
                        request.reply(403, 'Wrong Status')
                    }
                    break
                case JsSIP_C.REFER:
                    if (this._status === C.STATUS_CONFIRMED) {
                        this._receiveRefer(request)
                    } else {
                        request.reply(403, 'Wrong Status')
                    }
                    break
                case JsSIP_C.NOTIFY:
                    if (this._status === C.STATUS_CONFIRMED) {
                        this._receiveNotify(request)
                    } else {
                        request.reply(403, 'Wrong Status')
                    }
                    break
                default:
                    request.reply(501)
            }
        }
    }

    onTransportError () {
        console.log('onTransportError()')

        if (this._status !== C.STATUS_TERMINATED) {
            this.terminate({
                status_code: 500,
                reason_phrase: JsSIP_C.causes.CONNECTION_ERROR,
                cause: JsSIP_C.causes.CONNECTION_ERROR
            })
        }
    }

    onRequestTimeout () {
        console.log('onRequestTimeout()')

        if (this._status !== C.STATUS_TERMINATED) {
            this.terminate({
                status_code: 408,
                reason_phrase: JsSIP_C.causes.REQUEST_TIMEOUT,
                cause: JsSIP_C.causes.REQUEST_TIMEOUT
            })
        }
    }

    onDialogError () {
        console.log('onDialogError()')

        if (this._status !== C.STATUS_TERMINATED) {
            this.terminate({
                status_code: 500,
                reason_phrase: JsSIP_C.causes.DIALOG_ERROR,
                cause: JsSIP_C.causes.DIALOG_ERROR
            })
        }
    }

}
