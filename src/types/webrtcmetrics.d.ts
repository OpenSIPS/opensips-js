export interface WebrtcMetricsConfigType {
    refreshEvery?: number
    startAfter?: number
    stopAfter?: number
    verbose?: boolean
    pname?: string
    cid?: string
    uid?: string
    record?: boolean
    ticket?: boolean
}

export type ProbeDirectionType = 'inbound' | 'outbound'

export interface ProbeMetricInType {
    level_in: number
    codec_id_in: string
    codec_in: { mime_type: null | number, clock_rate: null | number, sdp_fmtp_line: null | number }
    delta_jitter_ms_in: number
    percent_packets_lost_in: number
    delta_packets_in: number
    delta_packets_lost_in: number
    total_packets_in: number
    total_packets_lost_in: number
    total_KBytes_in: number
    delta_KBytes_in: number
    delta_kbs_in: number,
    mos_in: number
    mos_emodel_in: number
    ssrc: string
    direction: ProbeDirectionType
}
export interface ProbeMetricOutType {
    level_out: number
    codec_id_out: string
    codec_out: { mime_type: null | number, clock_rate: null | number, sdp_fmtp_line: null | number }
    delta_jitter_ms_out: number
    delta_rtt_ms_out: null | number
    total_rtt_ms_out: number
    total_rtt_measure_out: number
    percent_packets_lost_out: number
    delta_packets_out: number
    delta_packets_lost_out: number
    total_packets_out: number
    total_packets_lost_out: number
    total_KBytes_out: number
    delta_KBytes_out: number
    delta_kbs_out: number
    timestamp_out: null | number
    mos_out: number
    mos_emodel_out: number
    ssrc: string
    direction: ProbeDirectionType
}

export interface Probe {
    audio: { [key: string]: ProbeMetricInType | ProbeMetricOutType }
}

interface MetricAudioData extends ProbeMetricInType {
    callId?: string
}