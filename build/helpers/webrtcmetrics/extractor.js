"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extract = void 0;
const models_1 = require("./utils/models");
const helper_1 = require("./utils/helper");
const log_1 = require("./utils/log");
const moduleName = "extractor   ";
const extractRTTBasedOnRTCP = (bunch, kind, referenceReport, previousBunch) => {
    let supportOfMeasure = false;
    const previousRTT = previousBunch[kind].total_rtt_ms_out;
    const previousNbMeasure = previousBunch[kind].total_rtt_measure_out;
    const referenceRTT = referenceReport
        ? referenceReport[kind].total_rtt_ms_out
        : 0;
    const referenceNbMeasure = referenceReport
        ? referenceReport[kind].total_rtt_measure_out
        : 0;
    const returnedValuesByDefault = {
        rtt: null,
        totalRTT: previousRTT,
        totalRTTMeasurements: previousNbMeasure,
    };
    if (bunch[models_1.PROPERTY.TIMESTAMP] === previousBunch[kind].timestamp_out) {
        return returnedValuesByDefault;
    }
    // If RTT is not part of the stat - return
    if (!Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.ROUND_TRIP_TIME)) {
        return returnedValuesByDefault;
    }
    // If no measure yet or no new measure - return
    if (Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.TOTAL_ROUND_TRIP_TIME_MEASUREMENTS)) {
        supportOfMeasure = true;
        if (Number(bunch[models_1.PROPERTY.TOTAL_ROUND_TRIP_TIME_MEASUREMENTS]) === 0 ||
            Number(bunch[models_1.PROPERTY.TOTAL_ROUND_TRIP_TIME_MEASUREMENTS]) -
                referenceNbMeasure ===
                previousNbMeasure) {
            return returnedValuesByDefault;
        }
    }
    const currentRTT = Number(1000) * Number(bunch[models_1.PROPERTY.ROUND_TRIP_TIME]);
    let currentTotalRTT = previousRTT + currentRTT;
    let currentTotalMeasurements = previousNbMeasure + 1;
    // If support of totalRoundTripTime
    if (supportOfMeasure) {
        currentTotalRTT =
            Number(1000) * Number(bunch[models_1.PROPERTY.TOTAL_ROUND_TRIP_TIME]) -
                referenceRTT;
        currentTotalMeasurements =
            Number(bunch[models_1.PROPERTY.TOTAL_ROUND_TRIP_TIME_MEASUREMENTS]) -
                referenceNbMeasure;
    }
    return {
        rtt: currentRTT,
        totalRTT: currentTotalRTT,
        totalRTTMeasurements: currentTotalMeasurements,
    };
};
const extractRTTBasedOnSTUNConnectivityCheck = (bunch, kind, referenceReport, previousBunch) => {
    // If RTT is not part of the stat - return null value
    if (!Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.CURRENT_ROUND_TRIP_TIME)) {
        return {
            rtt: null,
            totalRTT: previousBunch[kind].total_rtt_connectivity_ms,
            totalRTTMeasurements: previousBunch[kind].total_rtt_connectivity_measure,
        };
    }
    const currentRTT = Number(1000) * Number(bunch[models_1.PROPERTY.CURRENT_ROUND_TRIP_TIME]);
    let currentTotalRTT = previousBunch[kind].total_rtt_connectivity_ms + currentRTT;
    let currentTotalMeasurements = previousBunch[kind].total_rtt_connectivity_measure + 1;
    // If support of totalRoundTripTime
    if (Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.TOTAL_ROUND_TRIP_TIME)) {
        currentTotalRTT =
            Number(1000) * Number(bunch[models_1.PROPERTY.TOTAL_ROUND_TRIP_TIME]) -
                (referenceReport
                    ? referenceReport[kind].total_rtt_connectivity_ms
                    : 0);
    }
    // If support of responsesReceived
    if (Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.RESPONSES_RECEIVED)) {
        currentTotalMeasurements =
            Number(bunch[models_1.PROPERTY.RESPONSES_RECEIVED]) -
                (referenceReport
                    ? referenceReport[kind].total_rtt_connectivity_measure
                    : 0);
    }
    return {
        rtt: currentRTT,
        totalRTT: currentTotalRTT,
        totalRTTMeasurements: currentTotalMeasurements,
    };
};
const extractLastJitter = (bunch, kind, previousBunch) => {
    if (bunch[models_1.PROPERTY.TIMESTAMP] === previousBunch[kind].timestamp_out) {
        return null;
    }
    if (!Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.JITTER)) {
        return null;
    }
    return Number(1000) * (Number(bunch[models_1.PROPERTY.JITTER]) || 0);
};
const extractDecodeTime = (bunch, previousBunch) => {
    if (!Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.FRAMES_DECODED) ||
        !Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.TOTAL_DECODE_TIME)) {
        return {
            delta_ms_decode_frame: previousBunch[models_1.VALUE.VIDEO].delta_ms_decode_frame_in,
            frames_decoded: previousBunch[models_1.VALUE.VIDEO].total_frames_decoded_in,
            total_decode_time: previousBunch[models_1.VALUE.VIDEO].total_time_decoded_in,
        };
    }
    const decodedFrames = bunch[models_1.PROPERTY.FRAMES_DECODED];
    const totalDecodeTime = bunch[models_1.PROPERTY.TOTAL_DECODE_TIME];
    const decodeTimeDelta = totalDecodeTime - previousBunch[models_1.VALUE.VIDEO].total_time_decoded_in;
    const frameDelta = decodedFrames - previousBunch[models_1.VALUE.VIDEO].total_frames_decoded_in;
    return {
        delta_ms_decode_frame: frameDelta > 0 ? (decodeTimeDelta * 1000) / frameDelta : 0,
        frames_decoded: decodedFrames,
        total_decode_time: totalDecodeTime,
    };
};
const extractEncodeTime = (bunch, previousBunch) => {
    if (!Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.FRAMES_ENCODED) ||
        !Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.TOTAL_ENCODE_TIME)) {
        return {
            delta_ms_encode_frame: previousBunch[models_1.VALUE.VIDEO].delta_ms_encode_frame_out,
            frames_encoded: previousBunch[models_1.VALUE.VIDEO].total_frames_encoded_out,
            total_encode_time: previousBunch[models_1.VALUE.VIDEO].total_time_encoded_out,
        };
    }
    const encodedFrames = bunch[models_1.PROPERTY.FRAMES_ENCODED];
    const totalEncodeTime = bunch[models_1.PROPERTY.TOTAL_ENCODE_TIME];
    const encodeTimeDelta = totalEncodeTime - previousBunch[models_1.VALUE.VIDEO].total_time_encoded_out;
    const frameDelta = encodedFrames - previousBunch[models_1.VALUE.VIDEO].total_frames_encoded_out;
    const framesEncodedDelta = frameDelta > 0 && encodeTimeDelta
        ? (encodeTimeDelta * 1000) / frameDelta
        : 0;
    return {
        delta_ms_encode_frame: framesEncodedDelta,
        frames_encoded: encodedFrames,
        total_encode_time: totalEncodeTime,
    };
};
const extractAudioVideoPacketSent = (bunch, kind, previousBunch, referenceReport) => {
    if (!Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.PACKETS_SENT) ||
        !Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.BYTES_SENT)) {
        return {
            packetsSent: previousBunch[kind].total_packets_out,
            packetsLost: previousBunch[kind].total_packets_lost_out,
            bytesSent: previousBunch[kind].total_KBytes_out,
        };
    }
    const packetsSent = Number(bunch[models_1.PROPERTY.PACKETS_SENT]) ||
        0 - (referenceReport ? referenceReport[kind].total_packets_out : 0);
    const deltaPacketsSent = packetsSent - previousBunch[kind].total_packets_out;
    const KBytesSent = (Number(bunch[models_1.PROPERTY.BYTES_SENT]) / 1024) - (referenceReport ? referenceReport[kind].total_KBytes_out : 0);
    const deltaKBytesSent = KBytesSent - previousBunch[kind].total_KBytes_out;
    const timestamp = bunch[models_1.PROPERTY.TIMESTAMP] || Date.now();
    const referenceTimestamp = referenceReport ? referenceReport.timestamp : null;
    let previousTimestamp = previousBunch.timestamp;
    if (!previousTimestamp && referenceTimestamp) {
        previousTimestamp = referenceTimestamp;
    }
    const deltaMs = previousTimestamp ? timestamp - previousTimestamp : 0;
    const kbsSent = deltaMs > 0 ? ((deltaKBytesSent * 0.008 * 1024) / deltaMs) * 1000 : 0; // kbs = kilo bits per second
    return {
        packetsSent,
        deltaPacketsSent,
        KBytesSent,
        deltaKBytesSent,
        kbsSent,
    };
};
const extractAudioVideoPacketLost = (bunch, kind, previousBunch, referenceReport) => {
    let packetsLost = previousBunch[kind].total_packets_lost_out;
    let deltaPacketsLost = 0;
    let fractionLost = 0;
    if (Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.PACKETS_LOST)) {
        packetsLost = Number(bunch[models_1.PROPERTY.PACKETS_LOST]) || 0 - (referenceReport ? referenceReport[kind].total_packets_lost_out : 0);
        deltaPacketsLost = packetsLost - previousBunch[kind].total_packets_lost_out;
    }
    if (Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.FRACTION_LOST)) {
        fractionLost = Number(100 * bunch[models_1.PROPERTY.FRACTION_LOST]);
    }
    return {
        packetsLost,
        deltaPacketsLost,
        fractionLost,
    };
};
const extractAudioVideoPacketReceived = (bunch, kind, previousBunch, referenceReport) => {
    if (!Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.PACKETS_RECEIVED) ||
        !Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.PACKETS_LOST) ||
        !Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.BYTES_RECEIVED)) {
        return {
            percent_packets_lost: previousBunch[kind].percent_packets_lost_in,
            packetsReceived: previousBunch[kind].total_packets_in,
            packetsLost: previousBunch[kind].total_packets_lost_in,
            bytesReceived: previousBunch[kind].total_KBytes_in,
        };
    }
    const packetsReceived = Number(bunch[models_1.PROPERTY.PACKETS_RECEIVED]) ||
        0 - (referenceReport ? referenceReport[kind].total_packets_in : 0);
    const packetsLost = Number(bunch[models_1.PROPERTY.PACKETS_LOST]) ||
        0 - (referenceReport ? referenceReport[kind].total_packets_lost_in : 0);
    const deltaPacketsLost = packetsLost - previousBunch[kind].total_packets_lost_in;
    const deltaPacketsReceived = packetsReceived - previousBunch[kind].total_packets_in;
    const percentPacketsLost = packetsReceived !== previousBunch[kind].total_packets_in
        ? (deltaPacketsLost * 100) / (deltaPacketsLost + deltaPacketsReceived)
        : 0.0;
    const KBytesReceived = (Number(bunch[models_1.PROPERTY.BYTES_RECEIVED]) / 1024) - (referenceReport ? referenceReport[kind].total_KBytes_in : 0);
    const deltaKBytesReceived = KBytesReceived - previousBunch[kind].total_KBytes_in;
    const timestamp = bunch[models_1.PROPERTY.TIMESTAMP] || Date.now();
    const referenceTimestamp = referenceReport ? referenceReport.timestamp : null;
    let previousTimestamp = previousBunch.timestamp;
    if (!previousTimestamp && referenceTimestamp) {
        previousTimestamp = referenceTimestamp;
    }
    const deltaMs = previousTimestamp ? timestamp - previousTimestamp : 0;
    const kbsReceived = deltaMs > 0 ? ((deltaKBytesReceived * 0.008 * 1024) / deltaMs) * 1000 : 0; // kbs = kilo bits per second
    return {
        percentPacketsLost,
        packetsReceived,
        deltaPacketsReceived,
        packetsLost,
        deltaPacketsLost,
        KBytesReceived,
        deltaKBytesReceived,
        kbsReceived,
    };
};
const extractRelayProtocolUsed = (bunch) => {
    const candidateType = bunch[models_1.PROPERTY.CANDIDATE_TYPE];
    if (candidateType !== "relay") {
        return "";
    }
    return bunch[models_1.PROPERTY.RELAY_PROTOCOL] || "";
};
const extractInfrastructureValue = (bunch) => {
    if (!Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.NETWORK_TYPE)) {
        // Assuming Wifi when not provided (firefox/Safari at this time)
        return models_1.INFRASTRUCTURE_VALUE.WIFI;
    }
    switch (bunch[models_1.PROPERTY.NETWORK_TYPE]) {
        case models_1.INFRASTRUCTURE_LABEL.ETHERNET:
            return models_1.INFRASTRUCTURE_VALUE.ETHERNET;
        case models_1.INFRASTRUCTURE_LABEL.CELLULAR_4G:
            return models_1.INFRASTRUCTURE_VALUE.CELLULAR_4G;
        case models_1.INFRASTRUCTURE_LABEL.WIFI:
            return models_1.INFRASTRUCTURE_VALUE.WIFI;
        default:
            return models_1.INFRASTRUCTURE_VALUE.CELLULAR;
    }
};
const extractVideoSize = (bunch) => {
    if (!Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.FRAME_HEIGHT) ||
        !Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.FRAME_WIDTH)) {
        return { width: null, height: null, framerate: null };
    }
    return {
        width: bunch[models_1.PROPERTY.FRAME_WIDTH] || null,
        height: bunch[models_1.PROPERTY.FRAME_HEIGHT] || null,
        framerate: bunch[models_1.PROPERTY.FRAMES_PER_SECOND],
    };
};
const extractQualityLimitation = (bunch) => {
    const reason = Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.QUALITY_LIMITATION_REASON)
        ? bunch[models_1.PROPERTY.QUALITY_LIMITATION_REASON]
        : null;
    const resolutionChanges = Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.QUALITY_LIMITATION_RESOLUTION_CHANGES)
        ? bunch[models_1.PROPERTY.QUALITY_LIMITATION_RESOLUTION_CHANGES]
        : null;
    const durations = Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.QUALITY_LIMITATION_DURATIONS)
        ? bunch[models_1.PROPERTY.QUALITY_LIMITATION_DURATIONS]
        : null;
    if (durations) {
        Object.keys(durations).forEach((key) => {
            if (durations[key] > 1000) {
                durations[key] = Number(durations[key] / 1000);
            }
        });
    }
    return { reason, durations, resolutionChanges };
};
const extractNackAndPliCountSentWhenReceiving = (bunch, previousReport, referenceReport) => {
    if (!Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.PLI) ||
        !Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.NACK)) {
        return {
            pliCount: previousReport.total_pli_sent_in,
            nackCount: previousReport.total_nack_sent_in,
            deltaPliCount: 0,
            deltaNackCount: 0,
        };
    }
    const pliCount = (bunch[models_1.PROPERTY.PLI] || 0) - (referenceReport ? referenceReport[models_1.VALUE.VIDEO].total_pli_sent_in : 0);
    const nackCount = (bunch[models_1.PROPERTY.NACK] || 0) - (referenceReport ? referenceReport[models_1.VALUE.VIDEO].total_nack_sent_in : 0);
    return {
        pliCount,
        nackCount,
        deltaPliCount: pliCount - previousReport[models_1.VALUE.VIDEO].total_pli_sent_in,
        deltaNackCount: nackCount - previousReport[models_1.VALUE.VIDEO].total_nack_sent_in,
    };
};
const extractNackAndPliCountReceivedWhenSending = (bunch, previousReport, referenceReport) => {
    if (!Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.PLI) ||
        !Object.prototype.hasOwnProperty.call(bunch, models_1.PROPERTY.NACK)) {
        return {
            pliCount: previousReport.total_pli_received_out,
            nackCount: previousReport.total_nack_received_out,
            deltaPliCount: 0,
            deltaNackCount: 0,
        };
    }
    const pliCount = (bunch[models_1.PROPERTY.PLI] || 0) - (referenceReport ? referenceReport[models_1.VALUE.VIDEO].total_pli_received_out : 0);
    const nackCount = (bunch[models_1.PROPERTY.NACK] || 0) - (referenceReport ? referenceReport[models_1.VALUE.VIDEO].total_nack_received_out : 0);
    return {
        pliCount,
        nackCount,
        deltaPliCount: pliCount - previousReport[models_1.VALUE.VIDEO].total_pli_received_out,
        deltaNackCount: nackCount - previousReport[models_1.VALUE.VIDEO].total_nack_received_out,
    };
};
const extractAudioCodec = (bunch) => ({
    channels: bunch[models_1.PROPERTY.CHANNELS] || null,
    clock_rate: bunch[models_1.PROPERTY.CLOCK_RATE] || null,
    mime_type: bunch[models_1.PROPERTY.MIME_TYPE] || null,
    sdp_fmtp_line: bunch[models_1.PROPERTY.SDP_FMTP_LINE] || null,
});
const extractVideoCodec = (bunch) => ({
    clock_rate: bunch[models_1.PROPERTY.CLOCK_RATE] || null,
    mime_type: bunch[models_1.PROPERTY.MIME_TYPE] || null,
});
const extractBytesSentReceived = (bunch, previousBunch, referenceReport) => {
    const totalKBytesReceived = (bunch[models_1.PROPERTY.BYTES_RECEIVED] || 0) / 1024 -
        (referenceReport ? referenceReport.data.total_KBytes_in : 0);
    const totalKBytesSent = (bunch[models_1.PROPERTY.BYTES_SENT] || 0) / 1024 -
        (referenceReport ? referenceReport.data.total_KBytes_out : 0);
    const timestamp = bunch[models_1.PROPERTY.TIMESTAMP] || Date.now();
    const KBytesReceived = totalKBytesReceived - previousBunch.data.total_KBytes_in;
    const KBytesSent = totalKBytesSent - previousBunch.data.total_KBytes_out;
    const referenceTimestamp = referenceReport ? referenceReport.timestamp : null;
    let previousTimestamp = previousBunch.timestamp;
    if (!previousTimestamp && referenceTimestamp) {
        previousTimestamp = referenceTimestamp;
    }
    const deltaMs = previousTimestamp ? timestamp - previousTimestamp : 0;
    const kbsSpeedReceived = deltaMs > 0 ? ((KBytesReceived * 0.008 * 1024) / deltaMs) * 1000 : 0; // kbs = kilo bits per second
    const kbsSpeedSent = deltaMs > 0 ? ((KBytesSent * 0.008 * 1024) / deltaMs) * 1000 : 0;
    return {
        total_KBytes_received: totalKBytesReceived,
        total_KBytes_sent: totalKBytesSent,
        delta_KBytes_received: KBytesReceived,
        delta_KBytes_sent: KBytesSent,
        kbs_speed_received: kbsSpeedReceived,
        kbs_speed_sent: kbsSpeedSent,
    };
};
const extractAvailableBandwidth = (bunch) => {
    const kbsIncomingBandwidth = bunch[models_1.PROPERTY.AVAILABLE_INCOMING_BITRATE] / 1024 || 0;
    const kbsOutgoingBandwidth = bunch[models_1.PROPERTY.AVAILABLE_OUTGOING_BITRATE] / 1024 || 0;
    return {
        kbs_incoming_bandwidth: kbsIncomingBandwidth,
        kbs_outgoing_bandwidth: kbsOutgoingBandwidth,
    };
};
const extract = (bunch, previousBunch, pname, referenceReport) => {
    if (!bunch) {
        return [];
    }
    switch (bunch[models_1.PROPERTY.TYPE]) {
        case models_1.TYPE.CANDIDATE_PAIR:
            let selectedPair = false;
            if (bunch[models_1.PROPERTY.NOMINATED] &&
                bunch[models_1.PROPERTY.STATE] === models_1.VALUE.SUCCEEDED) {
                selectedPair = true;
                (0, log_1.debug)(moduleName, `analyze() - got stats ${bunch[models_1.PROPERTY.TYPE]} for ${pname}`, bunch);
                // FF: Do not use candidate-pair with selected=false
                if (models_1.PROPERTY.SELECTED in bunch && !bunch[models_1.PROPERTY.SELECTED]) {
                    selectedPair = false;
                }
            }
            if (selectedPair) {
                const localCandidateId = bunch[models_1.PROPERTY.LOCAL_CANDIDATE_ID];
                const remoteCandidateId = bunch[models_1.PROPERTY.REMOTE_CANDIDATE_ID];
                const valueSentReceived = extractBytesSentReceived(bunch, previousBunch, referenceReport);
                const bandwidth = extractAvailableBandwidth(bunch);
                const rttConnectivity = extractRTTBasedOnSTUNConnectivityCheck(bunch, "data", referenceReport, previousBunch);
                return [
                    {
                        type: models_1.STAT_TYPE.NETWORK,
                        value: { local_candidate_id: localCandidateId },
                    },
                    {
                        type: models_1.STAT_TYPE.NETWORK,
                        value: { remote_candidate_id: remoteCandidateId },
                    },
                    {
                        type: models_1.STAT_TYPE.DATA,
                        value: { total_KBytes_in: valueSentReceived.total_KBytes_received },
                    },
                    {
                        type: models_1.STAT_TYPE.DATA,
                        value: { total_KBytes_out: valueSentReceived.total_KBytes_sent },
                    },
                    {
                        type: models_1.STAT_TYPE.DATA,
                        value: { delta_KBytes_in: valueSentReceived.delta_KBytes_received },
                    },
                    {
                        type: models_1.STAT_TYPE.DATA,
                        value: { delta_KBytes_out: valueSentReceived.delta_KBytes_sent },
                    },
                    {
                        type: models_1.STAT_TYPE.DATA,
                        value: { delta_kbs_in: valueSentReceived.kbs_speed_received },
                    },
                    {
                        type: models_1.STAT_TYPE.DATA,
                        value: { delta_kbs_out: valueSentReceived.kbs_speed_sent },
                    },
                    {
                        type: models_1.STAT_TYPE.DATA,
                        value: { delta_kbs_bandwidth_in: bandwidth.kbs_incoming_bandwidth },
                    },
                    {
                        type: models_1.STAT_TYPE.DATA,
                        value: {
                            delta_kbs_bandwidth_out: bandwidth.kbs_outgoing_bandwidth,
                        },
                    },
                    {
                        type: models_1.STAT_TYPE.DATA,
                        value: { delta_rtt_connectivity_ms: rttConnectivity.rtt },
                    },
                    {
                        type: models_1.STAT_TYPE.DATA,
                        value: { total_rtt_connectivity_ms: rttConnectivity.totalRTT },
                    },
                    {
                        type: models_1.STAT_TYPE.DATA,
                        value: {
                            total_rtt_connectivity_measure: rttConnectivity.totalRTTMeasurements,
                        },
                    },
                ];
            }
            break;
        case models_1.TYPE.LOCAL_CANDIDATE:
            if (bunch[models_1.PROPERTY.ID] === previousBunch.network.local_candidate_id) {
                return [
                    {
                        type: models_1.STAT_TYPE.NETWORK,
                        value: { infrastructure: extractInfrastructureValue(bunch) },
                    },
                    {
                        type: models_1.STAT_TYPE.NETWORK,
                        value: {
                            local_candidate_type: bunch[models_1.PROPERTY.CANDIDATE_TYPE] || "",
                        },
                    },
                    {
                        type: models_1.STAT_TYPE.NETWORK,
                        value: { local_candidate_protocol: bunch[models_1.PROPERTY.PROTOCOL] || "" },
                    },
                    {
                        type: models_1.STAT_TYPE.NETWORK,
                        value: {
                            local_candidate_relay_protocol: extractRelayProtocolUsed(bunch),
                        },
                    },
                ];
            }
            break;
        case models_1.TYPE.REMOTE_CANDIDATE:
            if (bunch[models_1.PROPERTY.ID] === previousBunch.network.remote_candidate_id) {
                return [
                    {
                        type: models_1.STAT_TYPE.NETWORK,
                        value: {
                            remote_candidate_type: bunch[models_1.PROPERTY.CANDIDATE_TYPE] || "",
                        },
                    },
                    {
                        type: models_1.STAT_TYPE.NETWORK,
                        value: {
                            remote_candidate_protocol: bunch[models_1.PROPERTY.PROTOCOL] || "",
                        },
                    },
                ];
            }
            break;
        case models_1.TYPE.INBOUND_RTP: {
            (0, log_1.debug)(moduleName, `analyze() - got stats ${bunch[models_1.PROPERTY.TYPE]} for ${pname}`, bunch);
            // get SSRC and associated data
            const ssrc = bunch[models_1.PROPERTY.SSRC];
            const previousSSRCBunch = (0, helper_1.getSSRCDataFromBunch)(ssrc, previousBunch, models_1.DIRECTION.INBOUND);
            if (previousSSRCBunch) {
                previousSSRCBunch.timestamp = previousBunch.timestamp;
            }
            const referenceSSRCBunch = (0, helper_1.getSSRCDataFromBunch)(ssrc, referenceReport, models_1.DIRECTION.INBOUND);
            if (referenceSSRCBunch) {
                referenceSSRCBunch.timestamp = referenceReport.timestamp;
            }
            if (bunch[models_1.PROPERTY.MEDIA_TYPE] === models_1.VALUE.AUDIO) {
                // Packets stats and Bytes
                const data = extractAudioVideoPacketReceived(bunch, models_1.VALUE.AUDIO, previousSSRCBunch, referenceSSRCBunch);
                // Jitter stats
                const jitter = extractLastJitter(bunch, models_1.VALUE.AUDIO, previousSSRCBunch);
                // Codec stats
                const audioInputCodecId = bunch[models_1.PROPERTY.CODEC_ID] || "";
                return [
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { codec_id_in: audioInputCodecId },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { total_packets_in: data.packetsReceived },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { delta_packets_in: data.deltaPacketsReceived },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { total_packets_lost_in: data.packetsLost },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { delta_packets_lost_in: data.deltaPacketsLost },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { percent_packets_lost_in: data.percentPacketsLost },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { total_KBytes_in: data.KBytesReceived },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { delta_KBytes_in: data.deltaKBytesReceived },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { delta_kbs_in: data.kbsReceived },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { delta_jitter_ms_in: jitter },
                    },
                ];
            }
            if (bunch[models_1.PROPERTY.MEDIA_TYPE] === models_1.VALUE.VIDEO) {
                // Decode time stats
                const data = extractDecodeTime(bunch, previousSSRCBunch);
                // Packets stats and Bytes
                const packetsData = extractAudioVideoPacketReceived(bunch, models_1.VALUE.VIDEO, previousSSRCBunch, referenceSSRCBunch);
                // Jitter stats
                const jitter = extractLastJitter(bunch, models_1.VALUE.VIDEO, previousSSRCBunch);
                // Codec stats
                const decoderImplementation = bunch[models_1.PROPERTY.DECODER_IMPLEMENTATION] || null;
                const videoInputCodecId = bunch[models_1.PROPERTY.CODEC_ID] || null;
                // Video size
                const inputVideo = extractVideoSize(bunch);
                // Nack & Pli stats
                const nackPliData = extractNackAndPliCountSentWhenReceiving(bunch, previousSSRCBunch, referenceSSRCBunch);
                return [
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { codec_id_in: videoInputCodecId },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_packets_in: packetsData.packetsReceived },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_packets_in: packetsData.deltaPacketsReceived },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_packets_lost_in: packetsData.packetsLost },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_packets_lost_in: packetsData.deltaPacketsLost },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { percent_packets_lost_in: packetsData.percentPacketsLost },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_KBytes_in: packetsData.KBytesReceived },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_KBytes_in: packetsData.deltaKBytesReceived },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_kbs_in: packetsData.kbsReceived },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_jitter_ms_in: jitter },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { decoder_in: decoderImplementation },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_ms_decode_frame_in: data.delta_ms_decode_frame },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_frames_decoded_in: data.frames_decoded },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_time_decoded_in: data.total_decode_time },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_nack_sent_in: nackPliData.nackCount },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_nack_sent_in: nackPliData.deltaNackCount },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_pli_sent_in: nackPliData.pliCount },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_pli_sent_in: nackPliData.deltaPliCount },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { size_in: inputVideo },
                    },
                ];
            }
            break;
        }
        case models_1.TYPE.OUTBOUND_RTP: {
            (0, log_1.debug)(moduleName, `analyze() - got stats ${bunch[models_1.PROPERTY.TYPE]} for ${pname}`, bunch);
            // get SSRC and associated data
            const ssrc = bunch[models_1.PROPERTY.SSRC];
            const previousSSRCBunch = (0, helper_1.getSSRCDataFromBunch)(ssrc, previousBunch, models_1.DIRECTION.OUTBOUND);
            if (previousSSRCBunch) {
                previousSSRCBunch.timestamp = previousBunch.timestamp;
            }
            const referenceSSRCBunch = (0, helper_1.getSSRCDataFromBunch)(ssrc, referenceReport, models_1.DIRECTION.OUTBOUND);
            if (referenceSSRCBunch) {
                referenceSSRCBunch.timestamp = referenceReport.timestamp;
            }
            if (bunch[models_1.PROPERTY.MEDIA_TYPE] === models_1.VALUE.AUDIO) {
                const audioOutputCodecId = bunch[models_1.PROPERTY.CODEC_ID] || null;
                // packets and bytes
                const data = extractAudioVideoPacketSent(bunch, models_1.VALUE.AUDIO, previousSSRCBunch, referenceSSRCBunch);
                return [
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { codec_id_out: audioOutputCodecId },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { total_packets_out: data.packetsSent },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { delta_packets_out: data.deltaPacketsSent },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { total_KBytes_out: data.KBytesSent },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { delta_KBytes_out: data.deltaKBytesSent },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { delta_kbs_out: data.kbsSent },
                    },
                ];
            }
            if (bunch[models_1.PROPERTY.MEDIA_TYPE] === models_1.VALUE.VIDEO) {
                const encoderImplementation = bunch[models_1.PROPERTY.ENCODER_IMPLEMENTATION] || null;
                const videoOutputCodecId = bunch[models_1.PROPERTY.CODEC_ID] || null;
                // Encode time
                const data = extractEncodeTime(bunch, previousSSRCBunch);
                // Video size
                const outputVideo = extractVideoSize(bunch);
                // limitations
                const limitationOut = extractQualityLimitation(bunch);
                // Nack & Pli stats
                const nackPliData = extractNackAndPliCountReceivedWhenSending(bunch, previousSSRCBunch, referenceSSRCBunch);
                // packets and bytes
                const dataSent = extractAudioVideoPacketSent(bunch, models_1.VALUE.VIDEO, previousSSRCBunch, referenceSSRCBunch);
                return [
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { codec_id_out: videoOutputCodecId },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_packets_out: dataSent.packetsSent },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_packets_out: dataSent.deltaPacketsSent },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_KBytes_out: dataSent.KBytesSent },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_KBytes_out: dataSent.deltaKBytesSent },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_kbs_out: dataSent.kbsSent },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { encoder_out: encoderImplementation },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_ms_encode_frame_out: data.delta_ms_encode_frame },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_frames_encoded_out: data.frames_encoded },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_time_encoded_out: data.total_encode_time },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_nack_received_out: nackPliData.nackCount },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_nack_received_out: nackPliData.deltaNackCount },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_pli_received_out: nackPliData.pliCount },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_pli_received_out: nackPliData.deltaPliCount },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { size_out: outputVideo },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { limitation_out: limitationOut },
                    },
                ];
            }
            break;
        }
        case models_1.TYPE.MEDIA_SOURCE: {
            (0, log_1.debug)(moduleName, `analyze() - got stats ${bunch[models_1.PROPERTY.TYPE]} for ${pname}`, bunch);
            break;
        }
        case models_1.TYPE.TRACK: {
            (0, log_1.debug)(moduleName, `analyze() - got stats ${bunch[models_1.PROPERTY.TYPE]} for ${pname}`, bunch);
            break;
        }
        case models_1.TYPE.CODEC:
            const result = [];
            // Check for Audio codec
            Object.keys(previousBunch[models_1.VALUE.AUDIO]).forEach((ssrc) => {
                const ssrcAudioBunch = previousBunch[models_1.VALUE.AUDIO][ssrc];
                if ((ssrcAudioBunch.codec_id_in === bunch[models_1.PROPERTY.ID]) || (ssrcAudioBunch.codec_id_out === bunch[models_1.PROPERTY.ID])) {
                    (0, log_1.debug)(moduleName, `analyze() - got stats ${bunch[models_1.PROPERTY.TYPE]} for ${pname}`, bunch);
                    const codec = extractAudioCodec(bunch);
                    if (bunch[models_1.PROPERTY.ID] === ssrcAudioBunch.codec_id_in) {
                        result.push({ ssrc: ssrcAudioBunch.ssrc, type: models_1.STAT_TYPE.AUDIO, value: { codec_in: codec } });
                    }
                    else {
                        result.push({ ssrc: ssrcAudioBunch.ssrc, type: models_1.STAT_TYPE.AUDIO, value: { codec_out: codec } });
                    }
                }
            });
            // Check for Video codec
            Object.keys(previousBunch[models_1.VALUE.VIDEO]).forEach((ssrc) => {
                const ssrcVideoBunch = previousBunch[models_1.VALUE.VIDEO][ssrc];
                if ((ssrcVideoBunch.codec_id_in === bunch[models_1.PROPERTY.ID]) || (ssrcVideoBunch.codec_id_out === bunch[models_1.PROPERTY.ID])) {
                    (0, log_1.debug)(moduleName, `analyze() - got stats ${bunch[models_1.PROPERTY.TYPE]} for ${pname}`, bunch);
                    const codec = extractVideoCodec(bunch);
                    if (bunch[models_1.PROPERTY.ID] === ssrcVideoBunch.codec_id_in) {
                        result.push({ ssrc: ssrcVideoBunch.ssrc, type: models_1.STAT_TYPE.VIDEO, value: { codec_in: codec } });
                    }
                    else {
                        result.push({ ssrc: ssrcVideoBunch.ssrc, type: models_1.STAT_TYPE.VIDEO, value: { codec_out: codec } });
                    }
                }
            });
            return result;
        case models_1.TYPE.REMOTE_INBOUND_RTP: {
            (0, log_1.debug)(moduleName, `analyze() - got stats ${bunch[models_1.PROPERTY.TYPE]} for ${pname}`, bunch);
            // get SSRC and associated data
            const ssrc = bunch[models_1.PROPERTY.SSRC];
            const previousSSRCBunch = (0, helper_1.getSSRCDataFromBunch)(ssrc, previousBunch, models_1.DIRECTION.OUTBOUND);
            const referenceSSRCBunch = (0, helper_1.getSSRCDataFromBunch)(ssrc, referenceReport, models_1.DIRECTION.OUTBOUND);
            if (bunch[models_1.PROPERTY.KIND] === models_1.VALUE.AUDIO) {
                // Round Trip Time based on RTCP
                const data = extractRTTBasedOnRTCP(bunch, models_1.VALUE.AUDIO, referenceSSRCBunch, previousSSRCBunch);
                // Jitter (out)
                const jitter = extractLastJitter(bunch, models_1.VALUE.AUDIO, previousSSRCBunch);
                // Packets lost
                const packets = extractAudioVideoPacketLost(bunch, models_1.VALUE.AUDIO, previousSSRCBunch, referenceSSRCBunch);
                return [
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { delta_rtt_ms_out: data.rtt },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { total_rtt_ms_out: data.totalRTT },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { total_rtt_measure_out: data.totalRTTMeasurements },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { delta_jitter_ms_out: jitter },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { timestamp_out: bunch[models_1.PROPERTY.TIMESTAMP] },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { total_packets_lost_out: packets.packetsLost },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { delta_packets_lost_out: packets.deltaPacketsLost },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.AUDIO,
                        value: { percent_packets_lost_out: packets.fractionLost },
                    },
                ];
            }
            if (bunch[models_1.PROPERTY.KIND] === models_1.VALUE.VIDEO) {
                // Round Trip Time based on RTCP
                const data = extractRTTBasedOnRTCP(bunch, models_1.VALUE.VIDEO, referenceSSRCBunch, previousSSRCBunch);
                // Jitter (out)
                const jitter = extractLastJitter(bunch, models_1.VALUE.VIDEO, previousSSRCBunch);
                // Packets lost
                const packets = extractAudioVideoPacketLost(bunch, models_1.VALUE.VIDEO, previousSSRCBunch, referenceSSRCBunch);
                return [
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_rtt_ms_out: data.rtt },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_rtt_ms_out: data.totalRTT },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_rtt_measure_out: data.totalRTTMeasurements },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_jitter_ms_out: jitter },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { timestamp_out: bunch[models_1.PROPERTY.TIMESTAMP] },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { total_packets_lost_out: packets.packetsLost },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { delta_packets_lost_out: packets.deltaPacketsLost },
                    },
                    {
                        ssrc,
                        type: models_1.STAT_TYPE.VIDEO,
                        value: { percent_packets_lost_out: packets.fractionLost },
                    },
                ];
            }
            break;
        }
        default:
            break;
    }
    // No interesting data
    return [];
};
exports.extract = extract;
