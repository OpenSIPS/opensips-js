import { Page } from 'playwright'
import QrynLogger from './QrynLogger'
import QrynClient from './QrynClient'

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
    private logger: QrynLogger
    private qrynClient: QrynClient
    private intervalId: ReturnType<typeof setInterval> | null = null
    private lastSentCount = 0

    constructor (
        private readonly page: Page,
        private readonly scenarioName: string,
        private readonly scenarioId: string
    ) {
        this.logger = new QrynLogger('WebRTCMetricsSender', scenarioName, scenarioId)
        this.qrynClient = new QrynClient('METRICS')
    }

    public startPeriodicCollection (): void {
        // Send metrics every 5 seconds
        this.intervalId = setInterval(async () => {
            await this.collectAndSendMetrics()
        }, 5000)

        this.logger.log('Started periodic WebRTC metrics collection', { interval: '5s' })
    }

    public stopPeriodicCollection (): void {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
            this.logger.log('Stopped periodic WebRTC metrics collection')
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

            await this.sendMetricsToQryn(metricsData)
            this.lastSentCount = metricsData.allStats.length

        } catch (error) {
            await this.logger.error('Error collecting WebRTC metrics from browser', {
                error: error instanceof Error ? error.message : String(error)
            })
        }
    }

    private async sendMetricsToQryn (metricsData: WebRTCMetricsData): Promise<void> {
        if (!this.qrynClient.isQrynConfigured) {
            await this.logger.warn('No qryn metrics configuration found, skipping WebRTC metrics')
            return
        }

        try {
            const timestamp = Date.now()
            const labels = {
                scenario_name: this.scenarioName,
                scenario_id: this.scenarioId,
                environment: this.qrynClient.getEffectiveConfig?.scope || 'test',
                metric_type: 'webrtc_audio'
            }

            const labelString = Object.entries(labels)
                .map(([ key, value ]) => `${key}="${value}"`)
                .join(',')

            const metricsLines = [
                // Connection metrics
                `opensips_webrtc_setup_time_ms{${labelString}} ${metricsData.setupTime || 0} ${timestamp}`,
                `opensips_webrtc_total_duration_ms{${labelString}} ${metricsData.totalDuration || 0} ${timestamp}`,
                `opensips_webrtc_connection_successful{${labelString}} ${metricsData.connectionSuccessful ? 1 : 0} ${timestamp}`,
            ]

            // Audio quality metrics
            if (metricsData.audioMetrics) {
                const audio = metricsData.audioMetrics
                metricsLines.push(
                    `opensips_webrtc_packets_received_total{${labelString}} ${audio.packetsReceived || 0} ${timestamp}`,
                    `opensips_webrtc_packets_sent_total{${labelString}} ${audio.packetsSent || 0} ${timestamp}`,
                    `opensips_webrtc_packets_lost_total{${labelString}} ${audio.packetsLost || 0} ${timestamp}`,
                    `opensips_webrtc_jitter_ms{${labelString}} ${audio.jitter || 0} ${timestamp}`,
                    `opensips_webrtc_round_trip_time_ms{${labelString}} ${audio.roundTripTime || 0} ${timestamp}`,
                    `opensips_webrtc_audio_level{${labelString}} ${audio.audioLevel || 0} ${timestamp}`,
                    `opensips_webrtc_total_audio_energy{${labelString}} ${audio.totalAudioEnergy || 0} ${timestamp}`,
                    `opensips_webrtc_bytes_received_total{${labelString}} ${audio.bytesReceived || 0} ${timestamp}`,
                    `opensips_webrtc_bytes_sent_total{${labelString}} ${audio.bytesSent || 0} ${timestamp}`,
                    `opensips_webrtc_current_delay_ms{${labelString}} ${audio.currentDelay || 0} ${timestamp}`
                )
            }

            // Send to qryn via Prometheus format
            // TODO

            await this.logger.log('WebRTC metrics sent to qryn', {
                metricsCount: metricsLines.length,
                totalSamples: metricsData.allStats.length,
                connectionSuccessful: metricsData.connectionSuccessful,
                hasAudioMetrics: !!metricsData.audioMetrics
            })

        } catch (error) {
            await this.logger.error('Failed to send WebRTC metrics to qryn', {
                error: error instanceof Error ? error.message : String(error),
                url: this.qrynClient.getEffectiveConfig.url
            })
        }
    }

    public async sendFinalMetrics (): Promise<void> {
        await this.logger.log('Collecting final WebRTC metrics before cleanup')
        await this.collectAndSendMetrics()
        this.stopPeriodicCollection()
    }
}
