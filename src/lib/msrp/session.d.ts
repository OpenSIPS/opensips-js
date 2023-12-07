import { UA } from 'jssip'
import { EventEmitter } from 'events'
import {
    CallListener,
    ConfirmedListener,
    ConnectingListener,
    DTMFListener,
    EndListener,
    HoldListener,
    IceCandidateListener,
    InfoListener,
    MuteListener,
    PeerConnectionListener,
    ReferListener,
    ReInviteListener,
    SDPListener,
    SendingListener,
    UpdateListener,
    SessionDirection,
    RTCPeerConnectionDeprecated,
    OnHoldResult,
    MediaConstraints
} from 'jssip/lib/RTCSession'

type UAType = typeof UA
type Listener = (event: unknown) => void

export interface MSRPSessionEventMap {
    'peerconnection': PeerConnectionListener;
    'connecting': ConnectingListener;
    'sending': SendingListener;
    'progress': CallListener;
    'accepted': CallListener;
    'confirmed': ConfirmedListener;
    'ended': EndListener;
    'failed': EndListener;
    'newDTMF': DTMFListener;
    'newInfo': InfoListener;
    'hold': HoldListener;
    'unhold': HoldListener;
    'muted': MuteListener;
    'unmuted': MuteListener;
    'reinvite': ReInviteListener;
    'update': UpdateListener;
    'refer': ReferListener;
    'replaces': ReferListener;
    'sdp': SDPListener;
    'icecandidate': IceCandidateListener;
    'getusermediafailed': Listener;
    'active' : Listener;
    'msgHistoryUpdate' : Listener;
    'newMessage' : Listener;
    'peerconnection:createofferfailed': Listener;
    'peerconnection:createanswerfailed': Listener;
    'peerconnection:setlocaldescriptionfailed': Listener;
    'peerconnection:setremotedescriptionfailed': Listener;
}

declare enum SessionStatus {
    STATUS_NULL = 0,
    STATUS_INVITE_SENT = 1,
    STATUS_1XX_RECEIVED = 2,
    STATUS_INVITE_RECEIVED = 3,
    STATUS_WAITING_FOR_ANSWER = 4,
    STATUS_ANSWERED = 5,
    STATUS_WAITING_FOR_ACK = 6,
    STATUS_CANCELED = 7,
    STATUS_TERMINATED = 8,
    STATUS_CONFIRMED = 9
}

export class MSRPSession extends EventEmitter {
    _ua: UAType
    id: any
    credentials: any
    status: string
    target: string
    message: string

    constructor(ua: UAType)

    get direction(): SessionDirection;

    get connection(): RTCPeerConnectionDeprecated;

    get start_time(): Date;

    isOnHold(): OnHoldResult;

    mute(options?: MediaConstraints): void;

    unmute(options?: MediaConstraints): void;

    init_incoming(request: any): void;

    isEnded(): boolean;

    connect(target?:string): void

    sendMSRP(message: string): void

    _sendOk(message: string): void

    _sendReport(message: string): void

    terminate(options?: any): void

    on<T extends keyof MSRPSessionEventMap>(type: T, listener: MSRPSessionEventMap[T]): this;
}
