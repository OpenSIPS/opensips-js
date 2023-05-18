"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAT_TYPE = exports.INFRASTRUCTURE_LABEL = exports.INFRASTRUCTURE_VALUE = exports.VALUE = exports.PROPERTY = exports.TYPE = exports.defaultConfig = exports.getDefaultMetric = exports.defaultVideoMetricOut = exports.defaultVideoMetricIn = exports.defaultAudioMetricOut = exports.defaultAudioMetricIn = exports.getDefaultGlobalMetric = exports.ICE_GATHERING_STATE = exports.ICE_CONNECTION_STATE = exports.ENGINE_STATE = exports.COLLECTOR_STATE = exports.DIRECTION = exports.getVersion = exports.getLibName = void 0;
//import shortUUID from "./shortUUId";
const generate_unique_id_1 = __importDefault(require("generate-unique-id"));
const getLibName = () => ("WebRTCMetrics");
exports.getLibName = getLibName;
const getVersion = () => ("5.0.3");
exports.getVersion = getVersion;
exports.DIRECTION = {
    INBOUND: "inbound",
    OUTBOUND: "outbound",
};
exports.COLLECTOR_STATE = {
    IDLE: "idle",
    RUNNING: "running",
    MUTED: "muted",
};
exports.ENGINE_STATE = {
    IDLE: "idle",
    COLLECTING: "collecting",
    ENDED: "ended",
};
exports.ICE_CONNECTION_STATE = {
    NEW: "new",
    CHECKING: "checking",
    CONNECTED: "connected",
    COMPLETED: "completed",
    DISCONNECTED: "disconnected",
    FAILED: "failed",
    CLOSED: "closed",
};
exports.ICE_GATHERING_STATE = {
    NEW: "new",
    GATHERING: "gathering",
    COMPLETE: "complete",
};
const getDefaultGlobalMetric = () => {
    const defaultMetrics = {
        delta_time_to_measure_probes_ms: 0,
        delta_time_consumed_to_measure_ms: 0,
        delta_KBytes_in: 0,
        delta_KBytes_out: 0,
        delta_kbs_in: 0,
        delta_kbs_out: 0,
        total_time_decoded_in: 0,
        total_time_encoded_out: 0,
        probes: [],
    };
    const metrics = Object.assign({}, defaultMetrics);
    return metrics;
};
exports.getDefaultGlobalMetric = getDefaultGlobalMetric;
exports.defaultAudioMetricIn = {
    level_in: 0,
    codec_id_in: "",
    codec_in: { mime_type: null, clock_rate: null, sdp_fmtp_line: null },
    delta_jitter_ms_in: 0,
    percent_packets_lost_in: 0,
    delta_packets_in: 0,
    delta_packets_lost_in: 0,
    total_packets_in: 0,
    total_packets_lost_in: 0,
    total_KBytes_in: 0,
    delta_KBytes_in: 0,
    delta_kbs_in: 0,
    mos_in: 0,
    mos_emodel_in: 0,
    ssrc: "",
    direction: exports.DIRECTION.INBOUND,
};
exports.defaultAudioMetricOut = {
    level_out: 0,
    codec_id_out: "",
    codec_out: { mime_type: null, clock_rate: null, sdp_fmtp_line: null },
    delta_jitter_ms_out: 0,
    delta_rtt_ms_out: null,
    total_rtt_ms_out: 0,
    total_rtt_measure_out: 0,
    percent_packets_lost_out: 0,
    delta_packets_out: 0,
    delta_packets_lost_out: 0,
    total_packets_out: 0,
    total_packets_lost_out: 0,
    total_KBytes_out: 0,
    delta_KBytes_out: 0,
    delta_kbs_out: 0,
    timestamp_out: null,
    mos_out: 0,
    mos_emodel_out: 0,
    ssrc: "",
    direction: exports.DIRECTION.OUTBOUND,
};
exports.defaultVideoMetricIn = {
    codec_id_in: "",
    size_in: { width: null, height: null, framerate: null },
    codec_in: { mime_type: null, clock_rate: null },
    delta_jitter_ms_in: 0,
    percent_packets_lost_in: 0,
    delta_packets_in: 0,
    delta_packets_lost_in: 0,
    total_packets_in: 0,
    total_packets_lost_in: 0,
    total_KBytes_in: 0,
    delta_KBytes_in: 0,
    delta_kbs_in: 0,
    decoder_in: null,
    delta_ms_decode_frame_in: 0,
    total_frames_decoded_in: 0,
    total_time_decoded_in: 0,
    delta_nack_sent_in: 0,
    delta_pli_sent_in: 0,
    total_nack_sent_in: 0,
    total_pli_sent_in: 0,
    ssrc: "",
    direction: exports.DIRECTION.INBOUND,
};
exports.defaultVideoMetricOut = {
    codec_id_out: "",
    size_out: { width: null, height: null, framerate: null },
    codec_out: { mime_type: null, clock_rate: null },
    delta_jitter_ms_out: 0,
    delta_rtt_ms_out: null,
    total_rtt_ms_out: 0,
    total_rtt_measure_out: 0,
    percent_packets_lost_out: 0,
    delta_packets_out: 0,
    delta_packets_lost_out: 0,
    total_packets_out: 0,
    total_packets_lost_out: 0,
    total_KBytes_out: 0,
    delta_KBytes_out: 0,
    delta_kbs_out: 0,
    encoder_out: null,
    delta_ms_encode_frame_out: 0,
    total_time_encoded_out: 0,
    total_frames_encoded_out: 0,
    delta_nack_received_out: 0,
    delta_pli_received_out: 0,
    total_nack_received_out: 0,
    total_pli_received_out: 0,
    limitation_out: { reason: null, durations: null, resolutionChanges: 0 },
    timestamp_out: null,
    ssrc: "",
    direction: exports.DIRECTION.OUTBOUND,
};
const getDefaultMetric = (previousStats) => {
    const defaultMetrics = {
        pname: "",
        call_id: "",
        user_id: "",
        timestamp: null,
        count: 0,
        audio: {},
        video: {},
        network: {
            infrastructure: 3,
            local_candidate_id: "",
            local_candidate_type: "",
            local_candidate_protocol: "",
            local_candidate_relay_protocol: "",
            remote_candidate_id: "",
            remote_candidate_type: "",
            remote_candidate_protocol: "",
        },
        data: {
            total_KBytes_in: 0,
            total_KBytes_out: 0,
            delta_KBytes_in: 0,
            delta_KBytes_out: 0,
            delta_kbs_in: 0,
            delta_kbs_out: 0,
            delta_kbs_bandwidth_in: 0,
            delta_kbs_bandwidth_out: 0,
            delta_rtt_connectivity_ms: null,
            total_rtt_connectivity_ms: 0,
            total_rtt_connectivity_measure: 0,
        },
        experimental: {
            time_to_measure_ms: 0,
        },
    };
    if (previousStats) {
        const metrics = Object.assign(Object.assign({}, previousStats), { audio: {}, video: {}, data: Object.assign({}, previousStats.data), network: Object.assign({}, previousStats.network), experimental: Object.assign({}, previousStats.experimental) });
        Object.keys(previousStats.audio).forEach((ssrc) => {
            metrics.audio[ssrc] = Object.assign({}, previousStats.audio[ssrc]);
        });
        Object.keys(previousStats.video).forEach((ssrc) => {
            metrics.video[ssrc] = Object.assign({}, previousStats.video[ssrc]);
        });
        return metrics;
    }
    return Object.assign(Object.assign({}, defaultMetrics), { audio: {}, video: {}, data: Object.assign({}, defaultMetrics.data), network: Object.assign({}, defaultMetrics.network), experimental: Object.assign({}, defaultMetrics.experimental) });
};
exports.getDefaultMetric = getDefaultMetric;
exports.defaultConfig = {
    refreshEvery: 2000,
    startAfter: 0,
    stopAfter: -1,
    // keepMaxReport: 50, // Keep the last 50 tickets (new one erases the oldest)
    verbose: false,
    pname: `p-${(0, generate_unique_id_1.default)()}`,
    cid: `c-${(0, generate_unique_id_1.default)()}`,
    uid: `u-${(0, generate_unique_id_1.default)()}`,
    record: false,
    ticket: true, // Default - ticket generated and so all reports are kept
    // recordFields: ["*"], // Default all fields stored
};
exports.TYPE = {
    CANDIDATE_PAIR: "candidate-pair",
    CODEC: "codec",
    INBOUND_RTP: "inbound-rtp",
    LOCAL_CANDIDATE: "local-candidate",
    MEDIA_SOURCE: "media-source",
    OUTBOUND_RTP: "outbound-rtp",
    REMOTE_CANDIDATE: "remote-candidate",
    REMOTE_INBOUND_RTP: "remote-inbound-rtp",
    TRACK: "track",
};
exports.PROPERTY = {
    AUDIO_LEVEL: "audioLevel",
    AVAILABLE_OUTGOING_BITRATE: "availableOutgoingBitrate",
    AVAILABLE_INCOMING_BITRATE: "availableIncomingBitrate",
    BYTES_RECEIVED: "bytesReceived",
    BYTES_SENT: "bytesSent",
    CANDIDATE_TYPE: "candidateType",
    CHANNELS: "channels",
    CLOCK_RATE: "clockRate",
    CODEC_ID: "codecId",
    CURRENT_ROUND_TRIP_TIME: "currentRoundTripTime",
    ROUND_TRIP_TIME: "roundTripTime",
    FRACTION_LOST: "fractionLost",
    FRAME_HEIGHT: "frameHeight",
    FRAME_WIDTH: "frameWidth",
    QUALITY_LIMITATION_REASON: "qualityLimitationReason",
    QUALITY_LIMITATION_DURATIONS: "qualityLimitationDurations",
    QUALITY_LIMITATION_RESOLUTION_CHANGES: "qualityLimitationResolutionChanges",
    ID: "id",
    JITTER: "jitter",
    KIND: "kind",
    MEDIA_TYPE: "mediaType",
    MIME_TYPE: "mimeType",
    LOCAL_CANDIDATE_ID: "localCandidateId",
    NETWORK_TYPE: "networkType",
    RELAY_PROTOCOL: "relayProtocol",
    NOMINATED: "nominated",
    PACKETS_LOST: "packetsLost",
    PACKETS_RECEIVED: "packetsReceived",
    PACKETS_SENT: "packetsSent",
    PROTOCOL: "protocol",
    PORT: "port",
    REMOTE_CANDIDATE_ID: "remoteCandidateId",
    REMOTE_SOURCE: "remoteSource",
    RESPONSES_RECEIVED: "responsesReceived",
    SDP_FMTP_LINE: "sdpFmtpLine",
    SSRC: "ssrc",
    SELECTED: "selected",
    STATE: "state",
    TIMESTAMP: "timestamp",
    TOTAL_ROUND_TRIP_TIME: "totalRoundTripTime",
    TOTAL_ROUND_TRIP_TIME_MEASUREMENTS: "roundTripTimeMeasurements",
    TYPE: "type",
    DECODER_IMPLEMENTATION: "decoderImplementation",
    ENCODER_IMPLEMENTATION: "encoderImplementation",
    FRAMES_DECODED: "framesDecoded",
    FRAMES_ENCODED: "framesEncoded",
    FRAMES_PER_SECOND: "framesPerSecond",
    TOTAL_DECODE_TIME: "totalDecodeTime",
    TOTAL_ENCODE_TIME: "totalEncodeTime",
    PLI: "pliCount",
    NACK: "nackCount",
};
exports.VALUE = {
    SUCCEEDED: "succeeded",
    AUDIO: "audio",
    VIDEO: "video",
};
exports.INFRASTRUCTURE_VALUE = {
    ETHERNET: 0,
    CELLULAR_5G: 2,
    WIFI: 3,
    CELLULAR_4G: 5,
    CELLULAR: 10,
};
exports.INFRASTRUCTURE_LABEL = {
    ETHERNET: "ethernet",
    CELLULAR_4G: "cellular",
    WIFI: "wifi",
};
exports.STAT_TYPE = {
    AUDIO: "audio",
    VIDEO: "video",
    NETWORK: "network",
    DATA: "data",
};
