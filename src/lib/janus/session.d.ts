import {
    AnswerOptions,
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
    UpdateListener
} from 'jssip/lib/RTCSession'

type Listener = (event: unknown) => void

export interface JanusOptions extends AnswerOptions {
    eventHandlers?: Partial<JanusSessionEventMap>
    anonymous?: boolean;
    fromUserName?: string;
    fromDisplayName?: string;
}

export interface JanusSessionEventMap {
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
