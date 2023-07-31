import Utils from 'jssip/lib/Utils'
import  RequestSender  from 'jssip/lib/RequestSender'
import DigestAuthentication from 'jssip/lib/DigestAuthentication'
import { MSRPMessage } from '@/lib/msrp/message'
import { UA } from 'jssip'
import URI from 'jssip/lib/URI'
import SIPMessage from 'jssip/lib/SIPMessage'

export class MSRPSession {
    _ua : UA
    _request : any
    credentials : any
    webSocket : any
    status : string
    target : string
    message : string

    constructor (ua : UA) {
        this._ua = ua
        this.credentials = {
            'username': ua._configuration.authorization_user,
            'ha1': ua._configuration.ha1,
            'realm': ua._configuration.realm,
            'msrprelay': 'msrp://sip06.voicenter.co:2856;ws',
            'msrpurl': 'ws://sip06.voicenter.co:2856'
        }
        this.status = 'new'
        this.target = ''
        this.message = ''
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
        this.webSocket.onmessage = (msg : string) => {
            this.onmessage(msg)
        }
        this.webSocket.onerror = () => {
            this.onerror()
        }
    }

    authenticate (auth : any) {
        this.status = 'auth'
        const msgObj : any = new MSRPMessage('')
        msgObj.method = 'AUTH'
        msgObj.addHeader('To-Path', this.credentials.msrprelay)
        msgObj.addHeader('From-Path', 'msrp://' + this.credentials.username + '.sip06.voicenter.co:2856/' + msgObj.ident + ';ws')
        if (auth) {
            msgObj.addHeader('Authorization', auth.toString())
        }
        this.webSocket.send(msgObj.toString())

    }

    onmessage (msg : any) {
        const msgObj = new MSRPMessage(msg.data)
        if (this.status == 'auth' && msgObj.code === '401') {
            const _challenge = this.parseAuth(msgObj.getHeader('WWW-Authenticate'))
            const digestAuthentication = new DigestAuthentication(this.credentials)
            digestAuthentication.authenticate({ method: 'AUTH', ruri: this.credentials.msrprelay, body: null }, _challenge, Utils.createRandomToken(12))
            this.authenticate(digestAuthentication)
        }
        if (this.status == 'auth' && msgObj.code === '200') {
            this.status = 'ready'
            this.inviteParty(msgObj)
            // console.log(msgObj)
        }
    }

    onclose () {
        console.log('close')
    }

    onopen () {
        this.authenticate(null)
    }
    onerror () {
    }

    stop () {
        this.webSocket.close()
    }

    inviteParty (smgObj : any) {
        const requestParams = {}
        const extraHeaders = []

        requestParams.from_uri = new URI('sip', this._ua._configuration.uri.user, this._ua.configuration.uri.host)
        requestParams.to_uri = new URI('sip', this.target, this._ua._configuration.realm)
        extraHeaders.push(`P-Preferred-Identity: ${this._ua._configuration.uri.toString()}`)

        extraHeaders.push(`Contact: ${this._ua.contact.toString({
            outbound : true
        })}`)
        extraHeaders.push('Content-Type: application/sdp')

        const request : any = new SIPMessage.InitialOutgoingInviteRequest(
            this._ua.normalizeTarget(this.target),
            this._ua,
            requestParams,
            extraHeaders,
            'v=0\n' +
            'o=- 4232740119537112802 2 IN IP4 185.138.168.169\n' +
            'c=IN IP4 185.138.168.169\n' +
            't=0 0\n' +
            'm=message 2855 TCP/TLS/MSRP *\n' +
            'a=accept-types:text/plain text/html\n' +
            'a=path:' + smgObj.getHeader('Use-Path') + '\n')
        const request_sender = new RequestSender(this._ua, request, {
            onRequestTimeout : () =>
            {
                console.log('to')
            },
            onTransportError : (err : any) =>
            {
                console.log(err)
            },
            // Update the request on authentication.
            onAuthenticated : (request : any) =>
            {
                this._request = request
            },
            onReceiveResponse : (response : any) =>
            {
                console.log(response)
            }
        })
        request_sender.send()
    }

    send (target : string, message : string) {
        this.target = target
        this.message = message
        if (this.status == 'new') {
            this.connect()
        }
    }

    parseAuth (content : string) {
        const _challenge : any = {}
        const _challengeArray = content.replace('Digest', '').split(',')
        for (const _authItem of _challengeArray) {
            const _itemArray : any = _authItem.trim().split('=')
            _challenge[_itemArray[0]] = _itemArray[1].match('^"(.+)"$')[1]
        }
        return _challenge
    }

}