import { MetricInKeyType, MetricOutKeyType } from '@/types/webrtcmetrics'

export const METRIC_KEYS_TO_INCLUDE: Array<MetricInKeyType> = [ 'mos_in', 'codec_in', 'delta_KBytes_in', 'delta_kbs_in', 'delta_jitter_ms_in', 'delta_packets_lost_in' ]

export const METRIC_OUT_KEYS_TO_INCLUDE: Array<MetricOutKeyType> = [ 'delta_rtt_ms_out', 'mos_out', 'delta_jitter_ms_out', 'delta_packets_lost_out' ]
