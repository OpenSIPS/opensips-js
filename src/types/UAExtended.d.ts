import { Transport } from 'jssip/lib/Transport'
import { UAExtended } from '@/helpers/UA/index'
import { AnswerOptions, MSRPSessionEventMap } from '@/lib/msrp/session'
import { Socket, WeightedSocket } from 'jssip/lib/Socket'

declare module 'jssip' {
    export class UA {
        protected _transport: Transport
        protected _sessions: any[]
        protected _msrp_sessions: any[]
        protected _registrator: any
        protected _applicants: any[]
        protected _dynConfiguration: object
        protected _status: number
        protected _closeTimer: any
        protected _configuration: any
        protected _contact: any

        _findDialog(call_id, from, to)
        _findSession(request)
        call(target, options)
    }

    export class Message {
        constructor(ua)
        init_incoming(request)
    }

    export class Options {
        constructor(ua)
        init_incoming(request)
    }

    export interface MSRPOptions extends AnswerOptions {
        eventHandlers?: Partial<MSRPSessionEventMap>;
        anonymous?: boolean;
        fromUserName?: string;
        fromDisplayName?: string;
    }
    export interface UAConfiguration {
        // mandatory parameters
        sockets: Socket | Socket[] | WeightedSocket[] ;
        uri: string;
        // optional parameters
        authorization_jwt?: string;
        authorization_user?: string;
        connection_recovery_max_interval?: number;
        connection_recovery_min_interval?: number;
        contact_uri?: string;
        display_name?: string;
        instance_id?: string;
        no_answer_timeout?: number;
        session_timers?: boolean;
        session_timers_refresh_method?: string;
        session_timers_force_refresher?: boolean;
        password?: string;
        realm?: string;
        ha1?: string;
        register?: boolean;
        register_expires?: number;
        registrar_server?: string;
        use_preloaded_route?: boolean;
        user_agent?: string;
        extra_headers?: string[];
    }
    export class RTCSessiono {
        init_incoming(request)
        constructor(ua)
    }
}

declare module 'jssip/lib/URI' {

}