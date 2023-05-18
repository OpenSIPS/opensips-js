export function getLibName(): string;
export function getVersion(): string;
export namespace DIRECTION {
    const INBOUND: string;
    const OUTBOUND: string;
}
export namespace COLLECTOR_STATE {
    const IDLE: string;
    const RUNNING: string;
    const MUTED: string;
}
export namespace ENGINE_STATE {
    const IDLE_1: string;
    export { IDLE_1 as IDLE };
    export const COLLECTING: string;
    export const ENDED: string;
}
export namespace ICE_CONNECTION_STATE {
    const NEW: string;
    const CHECKING: string;
    const CONNECTED: string;
    const COMPLETED: string;
    const DISCONNECTED: string;
    const FAILED: string;
    const CLOSED: string;
}
export namespace ICE_GATHERING_STATE {
    const NEW_1: string;
    export { NEW_1 as NEW };
    export const GATHERING: string;
    export const COMPLETE: string;
}
export function getDefaultGlobalMetric(): {
    delta_time_to_measure_probes_ms: number;
    delta_time_consumed_to_measure_ms: number;
    delta_KBytes_in: number;
    delta_KBytes_out: number;
    delta_kbs_in: number;
    delta_kbs_out: number;
    total_time_decoded_in: number;
    total_time_encoded_out: number;
    probes: never[];
};
export namespace defaultAudioMetricIn {
    export const level_in: number;
    export const codec_id_in: string;
    export namespace codec_in {
        const mime_type: null;
        const clock_rate: null;
        const sdp_fmtp_line: null;
    }
    export const delta_jitter_ms_in: number;
    export const percent_packets_lost_in: number;
    export const delta_packets_in: number;
    export const delta_packets_lost_in: number;
    export const total_packets_in: number;
    export const total_packets_lost_in: number;
    export const total_KBytes_in: number;
    export const delta_KBytes_in: number;
    export const delta_kbs_in: number;
    export const mos_in: number;
    export const mos_emodel_in: number;
    export const ssrc: string;
    import direction = DIRECTION.INBOUND;
    export { direction };
}
export namespace defaultAudioMetricOut {
    export const level_out: number;
    export const codec_id_out: string;
    export namespace codec_out {
        const mime_type_1: null;
        export { mime_type_1 as mime_type };
        const clock_rate_1: null;
        export { clock_rate_1 as clock_rate };
        const sdp_fmtp_line_1: null;
        export { sdp_fmtp_line_1 as sdp_fmtp_line };
    }
    export const delta_jitter_ms_out: number;
    export const delta_rtt_ms_out: null;
    export const total_rtt_ms_out: number;
    export const total_rtt_measure_out: number;
    export const percent_packets_lost_out: number;
    export const delta_packets_out: number;
    export const delta_packets_lost_out: number;
    export const total_packets_out: number;
    export const total_packets_lost_out: number;
    export const total_KBytes_out: number;
    export const delta_KBytes_out: number;
    export const delta_kbs_out: number;
    export const timestamp_out: null;
    export const mos_out: number;
    export const mos_emodel_out: number;
    const ssrc_1: string;
    export { ssrc_1 as ssrc };
    import direction_1 = DIRECTION.OUTBOUND;
    export { direction_1 as direction };
}
export namespace defaultVideoMetricIn {
    const codec_id_in_1: string;
    export { codec_id_in_1 as codec_id_in };
    export namespace size_in {
        const width: null;
        const height: null;
        const framerate: null;
    }
    export namespace codec_in_1 {
        const mime_type_2: null;
        export { mime_type_2 as mime_type };
        const clock_rate_2: null;
        export { clock_rate_2 as clock_rate };
    }
    export { codec_in_1 as codec_in };
    const delta_jitter_ms_in_1: number;
    export { delta_jitter_ms_in_1 as delta_jitter_ms_in };
    const percent_packets_lost_in_1: number;
    export { percent_packets_lost_in_1 as percent_packets_lost_in };
    const delta_packets_in_1: number;
    export { delta_packets_in_1 as delta_packets_in };
    const delta_packets_lost_in_1: number;
    export { delta_packets_lost_in_1 as delta_packets_lost_in };
    const total_packets_in_1: number;
    export { total_packets_in_1 as total_packets_in };
    const total_packets_lost_in_1: number;
    export { total_packets_lost_in_1 as total_packets_lost_in };
    const total_KBytes_in_1: number;
    export { total_KBytes_in_1 as total_KBytes_in };
    const delta_KBytes_in_1: number;
    export { delta_KBytes_in_1 as delta_KBytes_in };
    const delta_kbs_in_1: number;
    export { delta_kbs_in_1 as delta_kbs_in };
    export const decoder_in: null;
    export const delta_ms_decode_frame_in: number;
    export const total_frames_decoded_in: number;
    export const total_time_decoded_in: number;
    export const delta_nack_sent_in: number;
    export const delta_pli_sent_in: number;
    export const total_nack_sent_in: number;
    export const total_pli_sent_in: number;
    const ssrc_2: string;
    export { ssrc_2 as ssrc };
    import direction_2 = DIRECTION.INBOUND;
    export { direction_2 as direction };
}
export namespace defaultVideoMetricOut {
    const codec_id_out_1: string;
    export { codec_id_out_1 as codec_id_out };
    export namespace size_out {
        const width_1: null;
        export { width_1 as width };
        const height_1: null;
        export { height_1 as height };
        const framerate_1: null;
        export { framerate_1 as framerate };
    }
    export namespace codec_out_1 {
        const mime_type_3: null;
        export { mime_type_3 as mime_type };
        const clock_rate_3: null;
        export { clock_rate_3 as clock_rate };
    }
    export { codec_out_1 as codec_out };
    const delta_jitter_ms_out_1: number;
    export { delta_jitter_ms_out_1 as delta_jitter_ms_out };
    const delta_rtt_ms_out_1: null;
    export { delta_rtt_ms_out_1 as delta_rtt_ms_out };
    const total_rtt_ms_out_1: number;
    export { total_rtt_ms_out_1 as total_rtt_ms_out };
    const total_rtt_measure_out_1: number;
    export { total_rtt_measure_out_1 as total_rtt_measure_out };
    const percent_packets_lost_out_1: number;
    export { percent_packets_lost_out_1 as percent_packets_lost_out };
    const delta_packets_out_1: number;
    export { delta_packets_out_1 as delta_packets_out };
    const delta_packets_lost_out_1: number;
    export { delta_packets_lost_out_1 as delta_packets_lost_out };
    const total_packets_out_1: number;
    export { total_packets_out_1 as total_packets_out };
    const total_packets_lost_out_1: number;
    export { total_packets_lost_out_1 as total_packets_lost_out };
    const total_KBytes_out_1: number;
    export { total_KBytes_out_1 as total_KBytes_out };
    const delta_KBytes_out_1: number;
    export { delta_KBytes_out_1 as delta_KBytes_out };
    const delta_kbs_out_1: number;
    export { delta_kbs_out_1 as delta_kbs_out };
    export const encoder_out: null;
    export const delta_ms_encode_frame_out: number;
    export const total_time_encoded_out: number;
    export const total_frames_encoded_out: number;
    export const delta_nack_received_out: number;
    export const delta_pli_received_out: number;
    export const total_nack_received_out: number;
    export const total_pli_received_out: number;
    export namespace limitation_out {
        const reason: null;
        const durations: null;
        const resolutionChanges: number;
    }
    const timestamp_out_1: null;
    export { timestamp_out_1 as timestamp_out };
    const ssrc_3: string;
    export { ssrc_3 as ssrc };
    import direction_3 = DIRECTION.OUTBOUND;
    export { direction_3 as direction };
}
export function getDefaultMetric(previousStats: any): any;
export namespace defaultConfig {
    const refreshEvery: number;
    const startAfter: number;
    const stopAfter: number;
    const verbose: boolean;
    const pname: string;
    const cid: string;
    const uid: string;
    const record: boolean;
    const ticket: boolean;
}
export namespace TYPE {
    const CANDIDATE_PAIR: string;
    const CODEC: string;
    const INBOUND_RTP: string;
    const LOCAL_CANDIDATE: string;
    const MEDIA_SOURCE: string;
    const OUTBOUND_RTP: string;
    const REMOTE_CANDIDATE: string;
    const REMOTE_INBOUND_RTP: string;
    const TRACK: string;
}
export namespace PROPERTY {
    const AUDIO_LEVEL: string;
    const AVAILABLE_OUTGOING_BITRATE: string;
    const AVAILABLE_INCOMING_BITRATE: string;
    const BYTES_RECEIVED: string;
    const BYTES_SENT: string;
    const CANDIDATE_TYPE: string;
    const CHANNELS: string;
    const CLOCK_RATE: string;
    const CODEC_ID: string;
    const CURRENT_ROUND_TRIP_TIME: string;
    const ROUND_TRIP_TIME: string;
    const FRACTION_LOST: string;
    const FRAME_HEIGHT: string;
    const FRAME_WIDTH: string;
    const QUALITY_LIMITATION_REASON: string;
    const QUALITY_LIMITATION_DURATIONS: string;
    const QUALITY_LIMITATION_RESOLUTION_CHANGES: string;
    const ID: string;
    const JITTER: string;
    const KIND: string;
    const MEDIA_TYPE: string;
    const MIME_TYPE: string;
    const LOCAL_CANDIDATE_ID: string;
    const NETWORK_TYPE: string;
    const RELAY_PROTOCOL: string;
    const NOMINATED: string;
    const PACKETS_LOST: string;
    const PACKETS_RECEIVED: string;
    const PACKETS_SENT: string;
    const PROTOCOL: string;
    const PORT: string;
    const REMOTE_CANDIDATE_ID: string;
    const REMOTE_SOURCE: string;
    const RESPONSES_RECEIVED: string;
    const SDP_FMTP_LINE: string;
    const SSRC: string;
    const SELECTED: string;
    const STATE: string;
    const TIMESTAMP: string;
    const TOTAL_ROUND_TRIP_TIME: string;
    const TOTAL_ROUND_TRIP_TIME_MEASUREMENTS: string;
    const TYPE: string;
    const DECODER_IMPLEMENTATION: string;
    const ENCODER_IMPLEMENTATION: string;
    const FRAMES_DECODED: string;
    const FRAMES_ENCODED: string;
    const FRAMES_PER_SECOND: string;
    const TOTAL_DECODE_TIME: string;
    const TOTAL_ENCODE_TIME: string;
    const PLI: string;
    const NACK: string;
}
export namespace VALUE {
    const SUCCEEDED: string;
    const AUDIO: string;
    const VIDEO: string;
}
export namespace INFRASTRUCTURE_VALUE {
    const ETHERNET: number;
    const CELLULAR_5G: number;
    const WIFI: number;
    const CELLULAR_4G: number;
    const CELLULAR: number;
}
export namespace INFRASTRUCTURE_LABEL {
    const ETHERNET_1: string;
    export { ETHERNET_1 as ETHERNET };
    const CELLULAR_4G_1: string;
    export { CELLULAR_4G_1 as CELLULAR_4G };
    const WIFI_1: string;
    export { WIFI_1 as WIFI };
}
export namespace STAT_TYPE {
    const AUDIO_1: string;
    export { AUDIO_1 as AUDIO };
    const VIDEO_1: string;
    export { VIDEO_1 as VIDEO };
    export const NETWORK: string;
    export const DATA: string;
}
