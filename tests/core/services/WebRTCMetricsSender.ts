import { Page } from 'playwright'
import QrynClient from './QrynClient'
import { Metric } from 'qryn-client'
import WebRTCMetricsAnalyzer from './WebRTCMetricsAnalyzer'

export interface WebRTCMetricsData {
    setupTime: number | null
    totalDuration: number
    connectionSuccessful: boolean
    audioMetrics: any
    allStats: any[]
    scenarioName?: string
    scenarioId?: string
}

export class WebRTCMetricsSender {
    private qrynClient: QrynClient
    private intervalId: ReturnType<typeof setInterval> | null = null
    private lastSentCount = 0

    constructor (
        private readonly page: Page,
        private readonly scenarioName: string,
        private readonly scenarioId: string
    ) {
        this.qrynClient = new QrynClient('WebRTCMetricsSender', scenarioName, scenarioId)
    }

    public startPeriodicCollection (): void {
        // Send metrics every 5 seconds
        this.intervalId = setInterval(async () => {
            await this.collectAndSendMetrics()
        }, 5000)

        this.qrynClient.log('Started periodic WebRTC metrics collection', { interval: '5s' })
    }

    public stopPeriodicCollection (): void {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
            this.qrynClient.log('Stopped periodic WebRTC metrics collection')
        }
    }

    public async collectAndSendMetrics (): Promise<void> {
        try {
            // Retrieve metrics from browser context
            const metricsData = await this.page.evaluate(() => {
                if (typeof window !== 'undefined' && window.callMetrics) {
                    return window.WebRTCMetricsCollector?.collectMetrics() || {
                        setupTime: window.callMetrics.connectionTime,
                        totalDuration: Date.now() - (window.callMetrics.startTime || Date.now()),
                        connectionSuccessful: window.callMetrics.connected,
                        audioMetrics: window.callMetrics.stats[window.callMetrics.stats.length - 1]?.audio || null,
                        allStats: window.callMetrics.stats,
                        scenarioName: window.scenarioName,
                        scenarioId: window.scenarioId
                    }
                }
                return null
            }) as WebRTCMetricsData | null

            if (!metricsData) {
                // No metrics available yet
                return
            }

            // Only send if we have new metrics
            if (metricsData.allStats.length <= this.lastSentCount) {
                return
            }
            metricsData.audioMetrics = WebRTCMetricsAnalyzer.calculateAverageMetrics(metricsData.allStats)
            await this.sendMetricsToQryn(metricsData)
            this.lastSentCount = metricsData.allStats.length

        } catch (error) {
            await this.qrynClient.error('Error collecting WebRTC metrics from browser', {
                error: error instanceof Error ? error.message : String(error)
            })
        }
    }

    private async sendMetricsToQryn (metricsData: WebRTCMetricsData): Promise<void> {
        try {
            const timestamp = Date.now()
            const labels = {
                scenario_name: this.scenarioName,
                scenario_id: this.scenarioId,
                environment: 'test',
                metric_type: 'webrtc_audio',
                // Connection status labels
                connection_successful: metricsData.connectionSuccessful ? 'true' : 'false',
                has_audio_metrics: metricsData.audioMetrics ? 'true' : 'false',
                // Audio metrics as labels (when available)
                ...(metricsData.audioMetrics && {
                    audio_level_range: metricsData.audioMetrics.audioLevel
                        ? (metricsData.audioMetrics.audioLevel > 0.5 ? 'high' : 'low')
                        : 'unknown',
                    jitter_category: metricsData.audioMetrics.jitter
                        ? (metricsData.audioMetrics.jitter > 50 ? 'high' : 'normal')
                        : 'unknown',
                    rtt_category: metricsData.audioMetrics.roundTripTime
                        ? (metricsData.audioMetrics.roundTripTime > 200 ? 'high' : 'normal')
                        : 'unknown',
                    packets_lost_status: metricsData.audioMetrics.packetsLost,
                    current_delay_category: metricsData.audioMetrics.currentDelay
                        ? (metricsData.audioMetrics.currentDelay > 100 ? 'high' : 'normal')
                        : 'unknown',
                    audio_energy_level: metricsData.audioMetrics.totalAudioEnergy
                        ? (metricsData.audioMetrics.totalAudioEnergy > 1000 ? 'high' : 'low')
                        : 'unknown'
                }),
                // Connection timing labels
                setup_time_category: metricsData.setupTime
                    ? (metricsData.setupTime > 5000 ? 'slow' : 'fast')
                    : 'unknown',
                duration_category: metricsData.totalDuration > 60000 ? 'long' : 'short',
                // Stats collection info
                stats_count: metricsData.allStats.length.toString(),
                timestamp_category: new Date(timestamp).getHours() < 12 ? 'morning' : 'afternoon'
            }

            // Define metric definitions
            const metricDefinitions = {
                // Connection metrics
                opensips_webrtc_setup_time_ms: metricsData.setupTime || 0,
                opensips_webrtc_total_duration_ms: metricsData.totalDuration || 0,
                opensips_webrtc_connection_successful: metricsData.connectionSuccessful ? 1 : 0,

                // Audio metrics (conditionally added)
                ...(metricsData.audioMetrics && {
                    opensips_webrtc_packets_received_total: metricsData.audioMetrics.packetsReceived || 0,
                    opensips_webrtc_packets_sent_total: metricsData.audioMetrics.packetsSent || 0,
                    opensips_webrtc_packets_lost_total: metricsData.audioMetrics.packetsLost || 0,
                    opensips_webrtc_jitter_ms: metricsData.audioMetrics.jitter || 0,
                    opensips_webrtc_round_trip_time_ms: metricsData.audioMetrics.roundTripTime || 0,
                    opensips_webrtc_audio_level: metricsData.audioMetrics.audioLevel || 0,
                    opensips_webrtc_total_audio_energy: metricsData.audioMetrics.totalAudioEnergy || 0,
                    opensips_webrtc_bytes_received_total: metricsData.audioMetrics.bytesReceived || 0,
                    opensips_webrtc_bytes_sent_total: metricsData.audioMetrics.bytesSent || 0,
                    opensips_webrtc_current_delay_ms: metricsData.audioMetrics.currentDelay || 0
                })
            }

            // Recursively create metrics
            const createMetrics = (definitions: Record<string, number>, metrics: Metric[] = []): Metric[] => {
                const entries = Object.entries(definitions)
                if (entries.length === 0) return metrics

                const [ metricName, value ] = entries[0]
                const metric = new Metric(metricName, labels)
                metric.addSample(value as number, timestamp)
                metrics.push(metric)

                // Recursive call with remaining definitions
                const remainingDefs = Object.fromEntries(entries.slice(1))
                return Object.keys(remainingDefs).length > 0
                    ? createMetrics(remainingDefs, metrics)
                    : metrics
            }

            const metrics = createMetrics(metricDefinitions)

            this.qrynClient.sendMetricsToQryn(metrics)

            await this.qrynClient.log('WebRTC metrics sent to qryn', {
                metricsCount: metrics.length,
                totalSamples: metricsData.allStats.length,
                connectionSuccessful: metricsData.connectionSuccessful,
                hasAudioMetrics: !!metricsData.audioMetrics
            })

        } catch (error) {
            await this.qrynClient.error('Failed to send WebRTC metrics to qryn', {
                error: error instanceof Error ? error.message : String(error),
                url: (this.qrynClient as unknown as { getEffectiveConfig?: { url?: string } }).getEffectiveConfig?.url
            })
        }
    }

    public async sendFinalMetrics (): Promise<void> {
        await this.qrynClient.log('Collecting final WebRTC metrics before cleanup')
        await this.collectAndSendMetrics()
        this.stopPeriodicCollection()
    }
}
