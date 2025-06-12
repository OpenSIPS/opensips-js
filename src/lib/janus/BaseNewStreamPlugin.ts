import * as Utils from 'jssip/lib/Utils'
import URI from 'jssip/lib/URI'
import * as SIPMessage from 'jssip/lib/SIPMessage'
import RequestSender from 'jssip/lib/RequestSender'
import P_TYPES from '@/enum/p.types'
import JsSIP_C from 'jssip/lib/Constants'
import { BasePlugin } from '@/lib/janus/BasePlugin'

interface ConnectOptions {
    extraHeaders?: Array<string>
    fromUserName?: string
    fromDisplayName?: string
    rtcConstraints?: object
    pcConfig?: object
}

interface RequestParameters {
    from_tag: string
    from_uri?: string
    from_display_name?: string
}

export class BaseNewStreamPlugin extends BasePlugin {
    private _candidates: Array<RTCIceCandidate>
    private _subscribeSent: boolean
    private _configureSent: boolean
    private _lastTrickleReceived: boolean
    private _publisherSubscribeSent: boolean
    private opaqueId: string
    protected handleId: number
    private readonly type: string
    protected _connection: RTCPeerConnection
    protected jsep_offer: RTCSessionDescription | void
    protected _request: unknown
    public stream: MediaStream

    constructor (name, type) {
        super(name)

        this._candidates = []
        this._subscribeSent = false
        this._configureSent = false
        this._lastTrickleReceived = false
        this.type = type
    }

    public connect (options: ConnectOptions = {}) {
        this.opaqueId = this.session.generateOpaqueId()

        const extraHeaders = Utils.cloneArray(options.extraHeaders)

        const requestParams: RequestParameters = {
            from_tag: this.session._from_tag
        }

        if (options.fromUserName) {
            requestParams.from_uri = new URI('sip', options.fromUserName, this.session._ua.configuration.uri.host)

            extraHeaders.push(`P-Preferred-Identity: ${this.session._ua.configuration.uri.toString()}`)
        }

        if (options.fromDisplayName) {
            requestParams.from_display_name = options.fromDisplayName
        }

        extraHeaders.push(`Contact: ${this.session._contact}`)
        extraHeaders.push('Content-Type: application/json')

        if (this.session._sessionTimers.enabled) {
            extraHeaders.push(`Session-Expires: ${this.session._sessionTimers.defaultExpires}${this.session._ua.configuration.session_timers_force_refresher ? ';refresher=uac' : ''}`)
        }

        this._request = new SIPMessage.InitialOutgoingInviteRequest(
            this.session.target, this.session._ua, requestParams, extraHeaders)

        this._createRTCConnection()

        this._sendInitialRequest()
    }

    public getStream () {
        return this.stream
    }

    public getConnection () {
        return this._connection
    }

    private _createRTCConnection () {
        this._connection = new RTCPeerConnection({
            iceServers: [
                {
                    urls: 'stun:turn.voicenter.co',
                    credential: 'kxsjahnsdjns3eds23esd',
                    username: 'turn2es21e'
                }
            ],
        })

        let iceCandidateTimeout

        // Send ICE events to Janus.
        this._connection.onicecandidate = (event) => {
            if (this._connection.signalingState !== 'stable' && this._connection.signalingState !== 'have-local-offer') {
                return
            }

            if (!event.candidate) {
                return
            }

            this._candidates.push(event.candidate)

            clearTimeout(iceCandidateTimeout)

            // Debounce calling configure request with trickles till the last trickle
            iceCandidateTimeout = setTimeout(() => {
                this._lastTrickleReceived = true

                if (this._subscribeSent && !this._configureSent) {
                    this._sendConfigureMessage({
                        audio: true,
                        video: true,
                    })
                }
            }, 500)
        }
    }

    private addTracks (tracks) {
        tracks.forEach((track) => {
            this._connection.addTrack(track)
        })
    }

    private async _sendInitialRequest () {
        const request_sender = new RequestSender(this.session._ua, this._request, {
            onRequestTimeout: () => {
                this.session.onRequestTimeout()
            },
            onTransportError: () => {
                this.session.onTransportError()
            },
            // Update the request on authentication.
            onAuthenticated: (request) => {
                this._request = request
            },
            onReceiveResponse: (response) => {
                this._receiveInviteResponse(response)
            }
        })

        await this.generateStream()

        if (!this.stream || !this.stream.getTracks().length) {
            return
        }

        this.addTracks(this.stream.getTracks())

        const options = {
            audio: false,
            video: true,
        }
        this.jsep_offer = await this._connection.createOffer(options)

        await this._connection.setLocalDescription(this.jsep_offer as unknown as RTCSessionDescription)

        const inviteData = {
            janus: 'attach',
            plugin: 'janus.plugin.videoroom',
            opaque_id: this.opaqueId
        }

        const bodyStringified = JSON.stringify(inviteData)

        this._request.body = bodyStringified

        request_sender.send()
    }

    private _receiveInviteResponse (response) {
        if (this._publisherSubscribeSent || !response.body) {
            return
        }

        const parsedBody = JSON.parse(response.body)

        this.handleId = parsedBody.data.id

        const registerBody = {
            janus: 'message',
            body: {
                request: 'join',
                room: this.session.room_id,
                ptype: 'publisher',
                display: this.session.display_name + ' (Screen Share)',
                //clientID: this.client_id,
                opaque_id: this.opaqueId,
            },
            handle_id: this.handleId
        }

        const registerExtraHeaders = [ this.session.getPTypeHeader(P_TYPES.PUBLISHER) ]

        this.session.sendRequest(JsSIP_C.SUBSCRIBE, {
            extraHeaders: registerExtraHeaders,
            body: JSON.stringify(registerBody),
            eventHandlers: {
                onSuccessResponse: async (response) => {
                    if (response.status_code === 200) {
                        this._subscribeSent = true

                        if (response.body) {
                            try {
                                const bodyParsed = JSON.parse(response.body) || {}

                                if (bodyParsed.plugindata?.data?.videoroom === 'joined') {
                                    this.session.myFeedList.push(bodyParsed.plugindata.data.id)
                                }

                                if (bodyParsed.plugindata?.data?.publishers){
                                    this.session.receivePublishers(bodyParsed)
                                }
                            } catch (e) {
                                console.error(e)
                            }
                        }

                        if (this._lastTrickleReceived && !this._configureSent) {
                            this._sendConfigureMessage({
                                audio: true,
                                video: true,
                            })
                        }
                    }
                },
            }
        })

        this._publisherSubscribeSent = true
    }

    private async _sendConfigureMessage (options) {
        const candidatesArray = this._candidates.map((candidate) => ({
            janus: 'trickle',
            candidate,
            handle_id: this.handleId,
            session_id: this.session.session_id
        }))

        const configureBody = {
            janus: 'message',
            body: {
                request: 'configure',
                record: true,
                filename: this.session.getRecordFileName(),
                ...options
            },
            jsep: this.jsep_offer,
            handle_id: this.handleId,
            session_id: this.session.session_id
        }

        const body = {
            configure: configureBody,
            trickles: [ ...candidatesArray ]
        }

        const extraHeaders = [
            'Content-Type: application/json',
            this.session.getPTypeHeader(P_TYPES.ICE)
        ]

        this.session.sendRequest(JsSIP_C.INFO, {
            extraHeaders,
            body: JSON.stringify(body),
            eventHandlers: {
                onSuccessResponse: async (response) => {
                    this._configureSent = true
                    const messageData = response.data
                    const messageBody = messageData.split('\r\n')
                    const data = messageBody[messageBody.length - 1]
                    const parsed = JSON.parse(data)
                    await this._connection.setRemoteDescription(parsed.jsep)
                    this._candidates = []
                },
            }
        })
    }

    private _sendDetach () {
        const body = {
            janus: 'detach',
            handle_id: this.handleId,
            session_id: this.session.session_id
        }

        const registerExtraHeaders = [ this.session.getPTypeHeader(P_TYPES.DETACH) ]

        this.session.sendRequest(JsSIP_C.INFO, {
            extraHeaders: registerExtraHeaders,
            body: JSON.stringify(body)
        })

        this.session._ua.emit('pluginDetach', this.name)
    }

    protected async stopMedia () {
        if (this._connection) {
            this._connection.close()
            this._connection = null
        }

        if (this.stream) {
            this.stream = null
        }
    }

    public async stop () {
        await this.session.stopProcessPlugins(this.type)

        const senders = this._connection.getSenders()

        // Iterate through the senders and stop the tracks
        senders.forEach(sender => {
            const track = sender.track
            if (track) {
                track.stop()
            }
        })

        // Optionally, remove the tracks from _connection (if needed)
        senders.forEach(sender => {
            this._connection.removeTrack(sender)
        })

        await this.stopMedia()

        this._sendDetach()
    }

    public async generateStream () {
        throw new Error('generateStream method is not implemented')
    }
}
