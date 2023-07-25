import { createRandomToken } from 'jssip/lib/Utils'
import RequestSender from 'jssip/lib/RequestSender'
import DigestAuthentication from 'jssip/lib/DigestAuthentication'
import { MSRPMessage } from '@/lib/msrp/message'
import JsSIP_C from 'jssip/lib/Constants'
import URI from 'jssip/lib/URI'
import SIPMessage from 'jssip/lib/SIPMessage'

export class MSRPSession {
    constructor (UA) {
        this._ua = UA
        this.credentials = {
            'username': UA._configuration.authorization_user,
            'ha1': UA._configuration.ha1,
            'realm': UA._configuration.realm,
            'msrprelay': 'msrp://sip06.voicenter.co:2856;ws',
            'msrpurl': 'ws://sip06.voicenter.co:2856'
        }
        this.connection = null
        this.webSocket = null
        this.status = 'new'
    }

    connect () {
        this.webSocket = new WebSocket(this.credentials.msrpurl, 'msrp')
        this.webSocket.binaryType = 'arraybuffer'
        this.webSocket.onopen = () => {
            this.onopen()
        }
        this.webSocket.onclose = () => {
            this.onclose()
        }
        this.webSocket.onmessage = (msg) => {
            this.onmessage(msg)
        }
        this.webSocket.onerror = () => {
            this.onerror()
        }
    }

    authenticate (auth) {
        this.status = 'auth'
        const msgObj = new MSRPMessage()
        msgObj.method = 'AUTH'
        msgObj.addHeader('To-Path', this.credentials.msrprelay)
        msgObj.addHeader('From-Path', 'msrp://' + this.credentials.username + '.sip06.voicenter.co:2856/' + msgObj.ident + ';ws')
        if (auth) {
            msgObj.addHeader('Authorization', auth.toString())
        }
        this.webSocket.send(msgObj.toString())

    }

    onmessage (msg) {
        const msgObj = new MSRPMessage(msg.data)
        if (this.status == 'auth' && msgObj.code === '401') {
            const _challenge = this.parseAuth(msgObj.getHeader('WWW-Authenticate'))
            const digestAuthentication = new DigestAuthentication(this.credentials)
            digestAuthentication.authenticate({ method: 'AUTH', ruri: this.credentials.msrprelay, body: null }, _challenge, createRandomToken(12))
            this.authenticate(digestAuthentication)
        }
        if (this.status == 'auth' && msgObj.code === '200') {
            this.status = 'ready'
            this.inviteParty(msgObj)
            console.log(msgObj)
        }
    }

    onclose (evt) {
    }

    onopen () {
        this.authenticate()
    }
    onerror () {
    }

    stop () {
        this.webSocket.close()
    }

    inviteParty (smgObj) {
        const request = new SIPMessage.OutgoingRequest(
            JsSIP_C.INVITE,
            this.target,
            this._ua,
            {
                to_uri: new URI('SIP', this.target, this._ua._configuration.realm),
                from_uri: new URI('SIP', this.target, this._ua._configuration.realm)
            },
            [],
            'v=0\n' +
            'o=- 4232740119537112802 2 IN IP4 185.138.168.169\n' +
            'c=IN IP4 185.138.168.169\n' +
            't=0 0\n' +
            'm=message 2855 WS/MSRP *\n' +
            'a=accept-types:text/plain text/html\n' +
            'a=path:' + smgObj.getHeader('Use-Path') + '\n')
        const request_sender = new RequestSender(this._ua, request, {
            onRequestTimeout : () =>
            {
                this.onRequestTimeout()
            },
            onTransportError : () =>
            {
                this.onTransportError()
            },
            // Update the request on authentication.
            onAuthenticated : (request) =>
            {
                this._request = request
            },
            onReceiveResponse : (response) =>
            {
                this._receiveInviteResponse(response)
            }
        })
        request_sender.send()
    }

    send (target, message) {
        this.target = target
        this.message = message
        if (this.status == 'new') {
            this.connect()
        }
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

}