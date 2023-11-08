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

let _j = 0

const C = {
    // RTCSession states.
    STATUS_NULL               : 0,
    STATUS_INVITE_SENT        : 1,
    STATUS_1XX_RECEIVED       : 2,
    STATUS_INVITE_RECEIVED    : 3,
    STATUS_WAITING_FOR_ANSWER : 4,
    STATUS_ANSWERED           : 5,
    STATUS_WAITING_FOR_ACK    : 6,
    STATUS_CANCELED           : 7,
    STATUS_TERMINATED         : 8,
    STATUS_CONFIRMED          : 9
}

export class MSRPSession extends EventEmitter
{

    constructor (ua)
    {
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
            'username' : ua._configuration.authorization_user,
            'ha1'      : ua._configuration.ha1,
            'realm'    : ua._configuration.realm
        }
        this._request = null

        this.status = 'new'
        this.target = ''
        this.message = ''

        this._timers = {
            ackTimer          : null,
            expiresTimer      : null,
            invite2xxTimer    : null,
            userNoAnswerTimer : null
        }

        this._direction = null
        this._local_identity = null
        this._remote_identity = null
        this._start_time = null
        this._end_time = null
        this._tones = null

        this._sessionTimers = {
            enabled        : this._ua.configuration.session_timers,
            refreshMethod  : this._ua.configuration.session_timers_refresh_method,
            defaultExpires : JsSIP_C.SESSION_EXPIRES,
            currentExpires : null,
            running        : false,
            refresher      : false,
            timer          : null // A setTimeout.
        }
    }

    /**
     * Expose C object.
     */
    static get C ()
    {
        return C
    }

    get direction ()
    {
        return this._direction
    }

    get connection ()
    {
        return this._connection
    }

    get id ()
    {
        return this._id
    }

    connect (target = '')
    {
        if (target !== '')
        {
            this._direction = 'outgoing'
        }
        this.target = target
        this._connection = new WebSocket(`ws://${this._ua._configuration.realm}:2856`, 'msrp')
        this._connection.binaryType = 'arraybuffer'
        this._connection.onopen = (event) =>
        {
            console.log('open')
            this.onopen()
        }
        this._connection.onclose = () =>
        {
            console.log('close')
            this.onclose()
        }
        this._connection.onmessage = (msg) =>
        {
            console.log('msg')
            this.onmessage(msg)
        }
        this._connection.onerror = () =>
        {
            console.log('error')
            this.onerror()
        }
    }

    answer ()
    {
        this.connect()
    }

    acceptParty (msgObj)
    {
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

    terminate (options = {})
    {
        const cause = options.cause || JsSIP_C.causes.BYE
        const extraHeaders = Utils.cloneArray(options.extraHeaders)
        const body = options.body

        let cancel_reason
        let status_code = options.status_code
        let reason_phrase = options.reason_phrase

        // Check Session Status.
        if (this._status === C.STATUS_TERMINATED)
        {
            throw new Exceptions.InvalidStateError(this._status)
        }

        switch (this._status)
        {
            // - UAC -
            case C.STATUS_NULL:
            case C.STATUS_INVITE_SENT:
            case C.STATUS_1XX_RECEIVED:

                if (status_code && (status_code < 200 || status_code >= 700))
                {
                    throw new TypeError(`Invalid status_code: ${status_code}`)
                }
                else if (status_code)
                {
                    reason_phrase = reason_phrase || JsSIP_C.REASON_PHRASE[status_code] || ''
                    cancel_reason = `SIP ;cause=${status_code} ;text="${reason_phrase}"`
                }

                // Check Session Status.
                if (this._status === C.STATUS_NULL || this._status === C.STATUS_INVITE_SENT)
                {
                    this._is_canceled = true
                    this._cancel_reason = cancel_reason
                }
                else if (this._status === C.STATUS_1XX_RECEIVED)
                {
                    this._request.cancel(cancel_reason)
                }

                this._status = C.STATUS_CANCELED

                this._failed('local', null, JsSIP_C.causes.CANCELED)
                break

            // - UAS -
            case C.STATUS_WAITING_FOR_ANSWER:
            case C.STATUS_ANSWERED:
                status_code = status_code || 480

                if (status_code < 300 || status_code >= 700)
                {
                    throw new TypeError(`Invalid status_code: ${status_code}`)
                }

                this._request.reply(status_code, reason_phrase, extraHeaders, body)
                this._failed('local', null, JsSIP_C.causes.REJECTED)
                break

            case C.STATUS_WAITING_FOR_ACK:
            case C.STATUS_CONFIRMED:
                reason_phrase = options.reason_phrase || JsSIP_C.REASON_PHRASE[status_code] || ''

                if (status_code && (status_code < 200 || status_code >= 700))
                {
                    throw new TypeError(`Invalid status_code: ${status_code}`)
                }
                else if (status_code)
                {
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
                    this._request.server_transaction.state !== Transactions.C.STATUS_TERMINATED)
                {

                    // Save the dialog for later restoration.
                    const dialog = this._dialog

                    // Send the BYE as soon as the ACK is received...
                    this.receiveRequest = ({ method }) =>
                    {
                        if (method === JsSIP_C.ACK)
                        {
                            this.sendRequest(JsSIP_C.BYE, {
                                extraHeaders,
                                body
                            })
                            dialog.terminate()
                        }
                    }

                    // .., or when the INVITE transaction times out
                    this._request.server_transaction.on('stateChanged', () =>
                    {
                        if (this._request.server_transaction.state ===
                            Transactions.C.STATUS_TERMINATED)
                        {
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
                }
                else
                {
                    this.sendRequest(JsSIP_C.BYE, {
                        extraHeaders,
                        body
                    })

                    this._ended('local', null, cause)
                }
        }
    }

    sendRequest (method, options)
    {
        return this._dialog.sendRequest(method, options)
    }

    authenticate (auth)
    {
        this.status = 'auth'
        let msgObj = new Message('')
        msgObj.method = 'AUTH'
        msgObj.addHeader('To-Path', `msrp://${this._ua._configuration.realm}:2856;ws`)
        msgObj.addHeader('From-Path',
            `msrp://${this.credentials.username}.${this.credentials.realm}:2856/${this.auth_id};ws`)
        if (auth)
        {
            msgObj.addHeader('Authorization', auth.toString())
        }

        this._connection.send(msgObj.toString())
    }

    onmessage (msg)
    {
        const msgObj = new Message(msg.data)
        if (this.status === 'auth' && msgObj.code === 401)
        {
            const _challenge = this.parseAuth(msgObj.getHeader('WWW-Authenticate'))
            const digestAuthentication = new DigestAuthentication(this.credentials)
            digestAuthentication.authenticate({ method: 'AUTH', ruri: `msrp://${this._ua._configuration.realm}:2856;ws`, body: null }, _challenge, Utils.createRandomToken(12))
            this.authenticate(digestAuthentication)
        }
        if (this.status === 'auth' && msgObj.code === 200 && this._direction === 'outgoing')
        {
            this.my_addr.push(msgObj.getHeader('To-Path'))
            this.my_addr.push(msgObj.getHeader('Use-Path'))
            this.status = 'ready'
            this.inviteParty(msgObj)
        }
        else if (this.status === 'auth' && msgObj.code === 200 && this._direction === 'incoming')
        {
            this.my_addr.push(msgObj.getHeader('To-Path'))
            this.my_addr.push(msgObj.getHeader('Use-Path'))
            this.status = 'ready'
            this.acceptParty(msgObj)
        }
        else if (msgObj.method === 'SEND')
        {
            let _i = msgObj.ident
            let _mId = msgObj.getHeader('Message-ID')
            let _ok = new Message('')
            _ok.method = '200 OK'
            _ok.addHeader('To-Path', `${this.my_addr[1]}`)
            _ok.addHeader('From-Path', `${this.my_addr[0]}`)
            _ok.addHeader('Message-ID', _mId)
            _ok.ident = _i
            this._connection.send(_ok.toString())

            let _report = new Message('')
            _report.method = 'REPORT'
            _report.addHeader('To-Path', `${msgObj.getHeader('From-Path')}`)
            _report.addHeader('From-Path', `${this.my_addr[0]}`)
            _report.addHeader('Message-ID', _mId)
            _report.addHeader('Byte-Range', '1-25/25')
            _report.addHeader('Status', '000 200 OK')
            _report.ident = _i
            this._connection.send(_report.toString())
            this.emit('newMessage', msgObj)
            this._msgHistory.push(msgObj)
            this.emit('msgHistoryUpdate', this._msgHistory)
        }
        if (msgObj.code === 480) {
            console.log('---------------------------------')
            this._close()
        }
    }

    onclose ()
    {
        console.log('close')
    }

    onopen ()
    {
        const pc = new RTCPeerConnection({ iceServers: [] })
        pc.createDataChannel('')
        pc.createOffer().then(pc.setLocalDescription.bind(pc))
        pc.onicecandidate = (ice) => {
            if (!ice || !ice.candidate || !ice.candidate.candidate) return
            const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/
            const ipMatch = ice.candidate.candidate.match(ipRegex)
            this.my_ip = ipMatch && ipMatch[1]
            pc.onicecandidate = () => {}
            this.authenticate(null)
        }
    }
    onerror (e)
    {
        console.log(e)
    }

    inviteParty (msgObj)
    {
        const requestParams = {}
        const extraHeaders = []

        requestParams.to_uri   = new URI('sip', this.target,                      this._ua._configuration.realm)
        requestParams.from_uri = new URI('sip', this._ua._configuration.uri.user, this._ua._configuration.uri.host)
        // extraHeaders.push(`P-Preferred-Identity: ${this._ua._configuration.uri.toString()}`)

        extraHeaders.push(`Contact: ${this._ua.contact.toString({
            outbound : true
        })}`)
        extraHeaders.push('Content-Type: application/sdp')
        this._request = new SIPMessage.InitialOutgoingInviteRequest(
            new URI('sip', this.target, this._ua._configuration.realm).clone(),
            this._ua,
            requestParams,
            extraHeaders,
            'v=0\n' +
            `o=- 4232740119537112802 2 IN IP4 ${this.my_ip}\n` +
            `c=IN IP4 ${this.my_ip}\n` +
            't=0 0\n' +
            'm=message 2856 TCP/TLS/MSRP *\n' +
            'a=accept-types:text/plain text/html\n' +
            `a=path:${msgObj.getHeader('Use-Path')} msrp://${this._ua._configuration.authorization_user}.${this._ua._configuration.realm}:2856/${this.auth_id};ws\n`)
        this._newMSRPSession('local', this._request)

        this._id = this._request.call_id + this._from_tag
        const request_sender = new RequestSender(this._ua, this._request, {
            onRequestTimeout : () =>
            {
                console.log('to')
            },
            onTransportError : (err) =>
            {
                console.log(err)
            },
            // Update the request on authentication.
            onAuthenticated : (request) =>
            {
                this._request = request
            },
            onReceiveResponse : (response) =>
            {
                if (response.status_code === 200)
                {
                    console.log(response, '99999999999999999999999999999999')
                    response.parseSDP(true)
                    this._status = C.STATUS_CONFIRMED
                    this.target_addr = response.sdp.media[0].invalid[1].value.replaceAll('path:', '').split(' ').reverse()
                    this.status = 'active'
                    this.emit('active')
                    this.emit('confirmed')
                }
            }
        })
        request_sender.send()
    }

    sendMSRP (message)
    {
        _j = 0
        const msgObj = new Message('')
        msgObj.method = 'SEND'
        msgObj.addHeader('To-Path', `${this.my_addr[1]} ${this.target_addr[1]} ${this.target_addr[0]}`)
        msgObj.addHeader('From-Path', `${this.my_addr[0]}`)
        msgObj.addHeader('Message-ID', '1')
        msgObj.addHeader('Byte-Range', '1-25/25')
        msgObj.addHeader('Content-Type', 'text/plain')
        msgObj.addHeader('Success-Report', 'yes')
        msgObj.addHeader('Failure-Report', 'yes')
        msgObj.body = message
        this._msgHistory.push(msgObj)
        this.emit('msgHistoryUpdate', this._msgHistory)
        this._connection.send(msgObj.toString())
    }

    parseAuth (content)
    {
        const _challenge = {}
        const _challengeArray = content.replace('Digest', '').split(',')
        for (const _authItem of _challengeArray)
        {
            const _itemArray = _authItem.trim().split('=')
            _challenge[_itemArray[0]] = _itemArray[1].match('^"(.+)"$')[1]
        }

        return _challenge
    }

    init_incoming (request, initCallback)
    {

        let expires
        const contentType = request.hasHeader('Content-Type') ?
            request.getHeader('Content-Type').toLowerCase() : undefined

        // Check body and content type.
        if (request.body && (contentType !== 'application/sdp'))
        {
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
        if (request.hasHeader('expires'))
        {
            expires = request.getHeader('expires') * 1000
        }

        /* Set the to_tag before
         * replying a response code that will create a dialog.
         */
        request.to_tag = Utils.newTag()

        // An error on dialog creation will fire 'failed' event.
        if (!this._createDialog(request, 'UAS', true))
        {
            request.reply(500, 'Missing Contact header field')

            return
        }

        if (request.body)
        {
            this._late_sdp = false
        }
        else
        {
            this._late_sdp = true
        }

        this._status = C.STATUS_WAITING_FOR_ANSWER

        // Set userNoAnswerTimer.
        this._timers.userNoAnswerTimer = setTimeout(() =>
        {
            request.reply(408)
            this._failed('local', null, JsSIP_C.causes.NO_ANSWER)
        }, this._ua.configuration.no_answer_timeout
        )

        /* Set expiresTimer
         * RFC3261 13.3.1
         */
        if (expires)
        {
            this._timers.expiresTimer = setTimeout(() =>
            {
                if (this._status === C.STATUS_WAITING_FOR_ANSWER)
                {
                    request.reply(487)
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
        if (initCallback)
        {
            initCallback(this)
        }

        request.parseSDP(true)
        console.log(request, '888888888888888888888888888888888')
        this.target_addr = request.sdp.media[0].invalid[1].value.replaceAll('path:', '').split(' ')
        console.log(this.target_addr)

        // Fire 'newMSRPSession' event.
        this._newMSRPSession('remote', request)

        // The user may have rejected the call in the 'newRTCSession' event.
        if (this._status === C.STATUS_TERMINATED)
        {
            return
        }

        // Reply 180.
        request.reply(180, null, [ `Contact: ${this._ua._contact}` ])

        // Fire 'progress' event.
        // TODO: Document that 'response' field in 'progress' event is null for incoming calls.
        this._progress('local', null)
    }

    _failed (originator, message, cause)
    {
        this.emit('_failed', {
            originator,
            message : message || null,
            cause
        })

        this._close()

        this.emit('failed', {
            originator,
            message : message || null,
            cause
        })
    }

    _close ()
    {

        if (this._status === C.STATUS_TERMINATED)
        {
            return
        }

        this._status = C.STATUS_TERMINATED

        // Terminate RTC.
        if (this._connection)
        {
            try
            {
                this._connection.close()
            }
            catch (error)
            {
                console.log('close() | error closing the RTCPeerConnection: %o', error)
            }
        }

        // Terminate signaling.

        // Clear SIP timers.
        for (const timer in this._timers)
        {
            if (Object.prototype.hasOwnProperty.call(this._timers, timer))
            {
                clearTimeout(this._timers[timer])
            }
        }

        // Clear Session Timers.
        clearTimeout(this._sessionTimers.timer)

        // Terminate confirmed dialog.
        if (this._dialog)
        {
            this._dialog.terminate()
            delete this._dialog
        }

        // Terminate early dialogs.
        for (const dialog in this._earlyDialogs)
        {
            if (Object.prototype.hasOwnProperty.call(this._earlyDialogs, dialog))
            {
                this._earlyDialogs[dialog].terminate()
                delete this._earlyDialogs[dialog]
            }
        }

        // Terminate REFER subscribers.
        for (const subscriber in this._referSubscribers)
        {
            if (Object.prototype.hasOwnProperty.call(this._referSubscribers, subscriber))
            {
                delete this._referSubscribers[subscriber]
            }
        }

        this._ua.destroyMSRPSession(this)
    }

    _createDialog (message, type, early)
    {
        const local_tag = (type === 'UAS') ? message.to_tag : message.from_tag
        const remote_tag = (type === 'UAS') ? message.from_tag : message.to_tag
        const id = message.call_id + local_tag + remote_tag

        let early_dialog = this._earlyDialogs[id]

        // Early Dialog.
        if (early)
        {
            if (early_dialog)
            {
                return true
            }
            else
            {
                early_dialog = new Dialog(this, message, type, Dialog.C.STATUS_EARLY)

                // Dialog has been successfully created.
                if (early_dialog.error)
                {
                    this._failed('remote', message, JsSIP_C.causes.INTERNAL_ERROR)

                    return false
                }
                else
                {
                    this._earlyDialogs[id] = early_dialog

                    return true
                }
            }
        }

        // Confirmed Dialog.
        else
        {
            this._from_tag = message.from_tag
            this._to_tag = message.to_tag

            // In case the dialog is in _early_ state, update it.
            if (early_dialog)
            {
                early_dialog.update(message, type)
                this._dialog = early_dialog
                delete this._earlyDialogs[id]

                return true
            }

            // Otherwise, create a _confirmed_ dialog.
            const dialog = new Dialog(this, message, type)

            if (dialog.error)
            {
                this._failed('remote', message, JsSIP_C.causes.INTERNAL_ERROR)

                return false
            }
            else
            {
                this._dialog = dialog

                return true
            }
        }
    }

    _newMSRPSession (originator, request)
    {
        this._ua.newMSRPSession(this, {
            originator,
            session : this,
            request
        })
    }

    _progress (originator, response)
    {
        this.emit('progress', {
            originator,
            response : response || null
        })
    }

    isEnded ()
    {
        switch (this._status)
        {
            case C.STATUS_CANCELED:
            case C.STATUS_TERMINATED:
                return true
            default:
                return false
        }
    }

}

