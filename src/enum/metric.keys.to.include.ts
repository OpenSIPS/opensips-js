import { ProbeMetricInType } from '@/types/webrtcmetrics'

export const METRIC_KEYS_TO_INCLUDE = [ 'mos_in', 'codec_in', 'delta_KBytes_in', 'delta_kbs_in', 'delta_jitter_ms_in', 'delta_packets_lost_in' ] as Array<keyof ProbeMetricInType>