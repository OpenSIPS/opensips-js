import { Span, trace, context, SpanStatusCode } from '@opentelemetry/api'
import { NodeSDK } from '@opentelemetry/auto-instrumentations-node'
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { Page } from 'playwright'
import { Metric, Stream } from 'qryn-client'
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

/**
 * TelemetryService - CENTRALIZED telemetry service
 *
 * This is the ONLY service that should:
 * - Import and use QrynClient
 * - Actually send data to qryn (traces, logs, metrics)
 * - Handle all telemetry operations
 *
 * All other services should use TelemetryService methods.
 */
export class TelemetryService {
    // Centralized qryn clients - ONLY here!
    private readonly tracingClient: QrynClient
    private readonly metricsClient: QrynClient
    private readonly logsClient: QrynClient

    // OpenTelemetry setup
    private tracer: any
    private scenarioRootSpan: Span | null = null
    private currentEventSpan: Span | null = null

    // WebRTC metrics
    private webrtcCollectionInterval: ReturnType<typeof setInterval> | null = null
    private webrtcPage: Page | null = null
    private lastWebrtcSentCount = 0

    constructor (
        private readonly scenarioId: string,
        private readonly scenarioName: string
    ) {
        // Initialize qryn clients - CENTRALIZED
        this.tracingClient = new QrynClient('TRACING')
        this.metricsClient = new QrynClient('METRICS')
        this.logsClient = new QrynClient('LOGS')

        // Initialize OpenTelemetry tracing
        this.initializeTracing()

        console.log(`🚀 Initialized CENTRALIZED telemetry for scenario: ${scenarioName} (${scenarioId})`)
        this.logScenarioStart()
    }

    private initializeTracing (): void {
        // Initialize OpenTelemetry
        const sdk = new NodeSDK({
            resource: new Resource({
                [SemanticResourceAttributes.SERVICE_NAME]: 'opensips-js-tests',
                [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
                [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.tracingClient.getEffectiveConfig?.scope || 'test',
            }),
            traceExporter: new ConsoleSpanExporter(),
        })

        try {
            sdk.start()
            this.tracer = trace.getTracer('opensips-js-tests', '1.0.0')

            // Create scenario root span
            this.scenarioRootSpan = this.tracer.startSpan(`scenario_${this.scenarioName}`, {
                attributes: {
                    'scenario.id': this.scenarioId,
                    'scenario.name': this.scenarioName,
                    'scenario.start_time': new Date().toISOString(),
                    'telemetry.source': 'opensips-js-tests'
                }
            })
        } catch (error) {
            console.error('Failed to initialize OpenTelemetry:', error)
        }
    }

    // === CENTRALIZED LOGGING METHODS ===
    public async log (message: string, data?: Record<string, any>): Promise<void> {
        await this.sendLog('info', message, data)
    }

    public async error (message: string, errorOrData?: Error | string | Record<string, any>, additionalData?: Record<string, any>): Promise<void> {
        if (errorOrData instanceof Error || typeof errorOrData === 'string') {
            await this.sendLog('error', message, {
                error: errorOrData instanceof Error ? errorOrData.message : errorOrData,
                ...additionalData
            })
        } else {
            await this.sendLog('error', message, errorOrData)
        }
    }

    public async warn (message: string, data?: Record<string, any>): Promise<void> {
        await this.sendLog('warn', message, data)
    }

    public async debug (message: string, data?: Record<string, any>): Promise<void> {
        await this.sendLog('debug', message, data)
    }

    private async sendLog (level: 'info' | 'error' | 'warn' | 'debug', message: string, metadata?: Record<string, any>): Promise<void> {
        if (!this.logsClient.isQrynConfigured) {
            // Fallback to console
            const prefix = `[${this.scenarioName}] [TelemetryService]`
            const logMessage = `${prefix} ${message}`

            switch (level) {
                case 'error': console.error(logMessage, metadata || ''); break
                case 'warn': console.warn(logMessage, metadata || ''); break
                case 'debug': console.debug(logMessage, metadata || ''); break
                default: console.log(logMessage, metadata || '')
            }
            return
        }

        try {
            const stream = new Stream({
                level,
                section: 'TelemetryService',
                scenario_name: this.scenarioName,
                scenario_id: this.scenarioId,
                job: 'opensips-js-tests',
            })

            stream.addEntry(
                Date.now(),
                JSON.stringify({
                    message,
                    ...(metadata && { metadata })
                })
            )

            await this.logsClient.client.loki.push([ stream ], { orgId: this.logsClient.getEffectiveConfig.OrgID })
            console.log('✅ Log sent to qryn loki')
        } catch (error) {
            console.error(`[TelemetryService] Failed to send log to qryn: ${error instanceof Error ? error.message : error}`)
        }
    }

    // === CENTRALIZED METRICS METHODS ===
    public recordEvent (eventName: string, stage = 'triggered', status: 'success' | 'failure' = 'success'): void {
        this.sendMetric('opensips_test_events_total', 1, {
            event_name: eventName,
            stage,
            status,
            scenario_name: this.scenarioName,
            scenario_id: this.scenarioId
        })
    }

    public recordActionDuration (actionType: string, durationMs: number, status: 'success' | 'failure' = 'success'): void {
        this.sendMetric('opensips_action_duration_ms', durationMs, {
            action_type: actionType,
            status,
            scenario_name: this.scenarioName,
            scenario_id: this.scenarioId
        })
    }

    public recordWebSocketEvent (method: string, direction: 'sent' | 'received', statusCode?: number): void {
        this.sendMetric('opensips_websocket_messages_total', 1, {
            sip_method: method,
            direction,
            ...(statusCode && { status_code: statusCode.toString() }),
            scenario_name: this.scenarioName,
            scenario_id: this.scenarioId
        })
    }

    public recordCustomMetric (metricName: string, value: number, additionalLabels: Record<string, string> = {}): void {
        this.sendMetric(metricName, value, {
            ...additionalLabels,
            scenario_name: this.scenarioName,
            scenario_id: this.scenarioId
        })
    }

    private async sendMetric (metricName: string, value: number, labels: Record<string, string>): Promise<void> {
        if (!this.metricsClient.isQrynConfigured) {
            console.log(`[METRIC] ${metricName}=${value} ${JSON.stringify(labels)}`)
            return
        }

        try {
            const metric = new Metric(metricName, labels)
            metric.addSample(value, Date.now())

            await this.metricsClient.client.prom.push([ metric ], { orgId: this.metricsClient.getEffectiveConfig.OrgID })
            console.log('✅ Metric sent to qryn prometheus')
        } catch (error) {
            console.error(`[TelemetryService] Failed to send metric to qryn: ${error instanceof Error ? error.message : error}`)
        }
    }

    // === CENTRALIZED TRACING METHODS ===
    public startActionSpan (actionType: string, actionData?: any): Span {
        if (!this.tracer) {
            return null as any // Return null if tracing not available
        }

        const parentSpan = this.currentEventSpan || this.scenarioRootSpan
        const span = this.tracer.startSpan(`action_${actionType}`, {
            parent: parentSpan,
            attributes: {
                'action.type': actionType,
                'action.start_time': new Date().toISOString(),
                'scenario.id': this.scenarioId,
                'scenario.name': this.scenarioName,
                ...(actionData && { 'action.data': JSON.stringify(actionData) })
            }
        })

        this.log(`Started action span: ${actionType}`, { actionData })
        return span
    }

    public finishActionSpan (actionSpan: Span, success: boolean, error?: Error | string, result?: any): void {
        if (!actionSpan) return

        actionSpan.setStatus({
            code: success ? SpanStatusCode.OK : SpanStatusCode.ERROR,
            message: success ? 'Action completed successfully' : (error instanceof Error ? error.message : String(error))
        })

        if (result) {
            actionSpan.setAttributes({ 'action.result': JSON.stringify(result) })
        }

        actionSpan.end()

        const actionType = actionSpan.attributes['action.type'] as string
        this.log(`Finished action span: ${actionType}`, {
            success,
            error: error instanceof Error ? error.message : error
        })
    }

    public startEventSpan (eventType: string, eventData?: any): Span {
        if (!this.tracer) {
            return null as any
        }

        this.currentEventSpan = this.tracer.startSpan(`event_${eventType}`, {
            parent: this.scenarioRootSpan,
            attributes: {
                'event.type': eventType,
                'event.start_time': new Date().toISOString(),
                'scenario.id': this.scenarioId,
                'scenario.name': this.scenarioName,
                ...(eventData && { 'event.data': JSON.stringify(eventData) })
            }
        })

        this.log(`Started event span: ${eventType}`, { eventData })
        return this.currentEventSpan
    }

    public finishEventSpan (eventSpan: Span, success: boolean, error?: Error | string, actionsCount?: number): void {
        if (!eventSpan) return

        eventSpan.setStatus({
            code: success ? SpanStatusCode.OK : SpanStatusCode.ERROR,
            message: success ? 'Event completed successfully' : (error instanceof Error ? error.message : String(error))
        })

        if (actionsCount) {
            eventSpan.setAttributes({ 'event.actions_count': actionsCount })
        }

        eventSpan.end()

        // Clear current event span
        if (eventSpan === this.currentEventSpan) {
            this.currentEventSpan = null
        }

        const eventType = eventSpan.attributes['event.type'] as string
        this.log(`Finished event span: ${eventType}`, {
            success,
            actionsCount
        })
    }

    public getCurrentSpan (): Span | null {
        return this.currentEventSpan || this.scenarioRootSpan
    }

    public getCurrentEventSpan (): Span | null {
        return this.currentEventSpan
    }

    public getScenarioRootSpan (): Span | null {
        return this.scenarioRootSpan
    }

    public withSpanContext<T> (span: Span, fn: () => T | Promise<T>): T | Promise<T> {
        if (!span) return fn()
        return context.with(trace.setSpan(context.active(), span), fn)
    }

    // === CENTRALIZED WEBRTC METRICS ===
    public initializeWebRTCMetrics (page: Page): void {
        this.webrtcPage = page
        this.log('WebRTC metrics initialized for page')
    }

    public startWebRTCMetricsCollection (): void {
        if (!this.webrtcPage) {
            this.warn('Cannot start WebRTC metrics collection - page not initialized')
            return
        }

        this.webrtcCollectionInterval = setInterval(async () => {
            await this.collectAndSendWebRTCMetrics()
        }, 5000)

        this.log('Started WebRTC metrics collection', { interval: '5s' })
    }

    public stopWebRTCMetricsCollection (): void {
        if (this.webrtcCollectionInterval) {
            clearInterval(this.webrtcCollectionInterval)
            this.webrtcCollectionInterval = null
            this.log('Stopped WebRTC metrics collection')
        }
    }

    public async finalizeWebRTCMetrics (): Promise<void> {
        await this.log('Collecting final WebRTC metrics before cleanup')
        await this.collectAndSendWebRTCMetrics()
        this.stopWebRTCMetricsCollection()
    }

    private async collectAndSendWebRTCMetrics (): Promise<void> {
        if (!this.webrtcPage) return

        try {
            const metricsData = await this.webrtcPage.evaluate(() => {
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

            if (!metricsData || metricsData.allStats.length <= this.lastWebrtcSentCount) {
                return
            }

            // Send WebRTC metrics using centralized methods
            this.recordCustomMetric('opensips_webrtc_setup_time_ms', metricsData.setupTime || 0, {
                metric_type: 'webrtc_audio',
                connection_status: metricsData.connectionSuccessful ? 'connected' : 'failed'
            })

            this.recordCustomMetric('opensips_webrtc_total_duration_ms', metricsData.totalDuration || 0, {
                metric_type: 'webrtc_audio',
                connection_status: metricsData.connectionSuccessful ? 'connected' : 'failed'
            })

            this.recordCustomMetric('opensips_webrtc_connection_successful', metricsData.connectionSuccessful ? 1 : 0, {
                metric_type: 'webrtc_audio',
                connection_status: metricsData.connectionSuccessful ? 'connected' : 'failed'
            })

            if (metricsData.audioMetrics) {
                const audio = metricsData.audioMetrics
                const audioLabels = {
                    metric_type: 'webrtc_audio',
                    stream_type: 'audio'
                }

                this.recordCustomMetric('opensips_webrtc_packets_received_total', audio.packetsReceived || 0, audioLabels)
                this.recordCustomMetric('opensips_webrtc_packets_sent_total', audio.packetsSent || 0, audioLabels)
                this.recordCustomMetric('opensips_webrtc_packets_lost_total', audio.packetsLost || 0, audioLabels)
                this.recordCustomMetric('opensips_webrtc_jitter_ms', audio.jitter || 0, audioLabels)
                this.recordCustomMetric('opensips_webrtc_round_trip_time_ms', audio.roundTripTime || 0, audioLabels)
                this.recordCustomMetric('opensips_webrtc_audio_level', audio.audioLevel || 0, audioLabels)
                this.recordCustomMetric('opensips_webrtc_total_audio_energy', audio.totalAudioEnergy || 0, audioLabels)
                this.recordCustomMetric('opensips_webrtc_bytes_received_total', audio.bytesReceived || 0, audioLabels)
                this.recordCustomMetric('opensips_webrtc_bytes_sent_total', audio.bytesSent || 0, audioLabels)
                this.recordCustomMetric('opensips_webrtc_current_delay_ms', audio.currentDelay || 0, audioLabels)
            }

            this.lastWebrtcSentCount = metricsData.allStats.length
            await this.log('WebRTC metrics collected and sent', {
                totalSamples: metricsData.allStats.length,
                connectionSuccessful: metricsData.connectionSuccessful,
                hasAudioMetrics: !!metricsData.audioMetrics
            })

        } catch (error) {
            await this.error('Error collecting WebRTC metrics', error)
        }
    }

    // === LIFECYCLE LOGGING METHODS ===
    public async logScenarioStart (): Promise<void> {
        await this.log('Scenario execution started', {
            scenario_id: this.scenarioId,
            scenario_name: this.scenarioName
        })
    }

    public async logScenarioEnd (success: boolean, durationMs?: number): Promise<void> {
        await this.log('Scenario execution completed', {
            scenario_id: this.scenarioId,
            scenario_name: this.scenarioName,
            success,
            ...(durationMs && { duration_ms: durationMs })
        })
    }

    public async logEventStart (eventType: string, eventData?: any): Promise<void> {
        await this.log(`Event started: ${eventType}`, {
            event_type: eventType,
            event_data: eventData
        })
    }

    public async logEventEnd (eventType: string, success: boolean, actionsCount?: number): Promise<void> {
        await this.log(`Event completed: ${eventType}`, {
            event_type: eventType,
            success,
            ...(actionsCount && { actions_count: actionsCount })
        })
    }

    public async logActionStart (actionType: string, actionData?: any): Promise<void> {
        await this.debug(`Action started: ${actionType}`, {
            action_type: actionType,
            action_data: actionData
        })
    }

    public async logActionEnd (actionType: string, success: boolean, result?: any, durationMs?: number): Promise<void> {
        await this.debug(`Action completed: ${actionType}`, {
            action_type: actionType,
            success,
            ...(result && { result }),
            ...(durationMs && { duration_ms: durationMs })
        })
    }

    public async logWebSocketMessage (direction: 'sent' | 'received', method: string, statusCode?: number): Promise<void> {
        await this.debug(`WebSocket message ${direction}: ${method}`, {
            direction,
            sip_method: method,
            ...(statusCode && { status_code: statusCode })
        })
    }

    // === CLEANUP ===
    public async cleanup (): Promise<void> {
        // Record final scenario duration
        const scenarioDuration = this.scenarioRootSpan ?
            Date.now() - new Date(this.scenarioRootSpan.attributes['scenario.start_time'] as string).getTime() : 0

        this.recordCustomMetric('opensips_scenario_duration_ms', scenarioDuration, { status: 'success' })

        // Cleanup WebRTC metrics
        await this.finalizeWebRTCMetrics()

        // End scenario span
        if (this.scenarioRootSpan) {
            this.scenarioRootSpan.setStatus({ code: SpanStatusCode.OK })
            this.scenarioRootSpan.end()
        }

        await this.logScenarioEnd(true, scenarioDuration)

        console.log('🚀 CENTRALIZED telemetry cleanup completed - ALL DATA SENT TO QRYN')
    }

    // === GETTERS ===
    public getScenarioId (): string {
        return this.scenarioId
    }

    public getScenarioName (): string {
        return this.scenarioName
    }
}
