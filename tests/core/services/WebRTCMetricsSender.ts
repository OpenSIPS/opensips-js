import { Page } from 'playwright'
import QrynLogger from './QrynLogger'
import QrynClient from './QrynClient'
import { Metric } from 'qryn-client'

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
                const [name, value, ...rest] = Object.entries(definitions).flat()

                if (!name) return metrics

                const metric = new Metric('opensips_test_webrtc', definitions)
                metric.addSample(value as number, timestamp)
                metrics.push(metric)

                // Recursive call with remaining definitions
                const remainingDefs = Object.fromEntries(
                    Object.entries(definitions).slice(1)
                )

                return Object.keys(remainingDefs).length > 0
                    ? createMetrics(remainingDefs, metrics)
                    : metrics
            }

            const metrics = createMetrics(metricDefinitions)

            this.qrynClient.client.prom.push(metrics, {
                orgId: this.qrynClient.getEffectiveConfig.OrgID
            }).then(() => {
                console.log('webrtc pushed!')
            }).catch(() => {
                console.log('not pushed((')
            })

            await this.logger.log('WebRTC metrics sent to qryn', {
                metricsCount: metrics.length,
                totalSamples: metricsData.allStats.length,
                connectionSuccessful: metricsData.connectionSuccessful,
                hasAudioMetrics: !!metricsData.audioMetrics
            })

        } catch (error) {
            await this.logger.error('Failed to send WebRTC metrics to qryn', {
                error: error instanceof Error ? error.message : String(error),
                url: this.qrynClient.getEffectiveConfig?.url
            })
        }
    }

    public async sendFinalMetrics (): Promise<void> {
        await this.logger.log('Collecting final WebRTC metrics before cleanup')
        await this.collectAndSendMetrics()
        this.stopPeriodicCollection()
    }
}
