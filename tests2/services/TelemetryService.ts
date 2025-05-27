import { NodeSDK } from '@opentelemetry/sdk-node'
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import {
    PeriodicExportingMetricReader,
    ConsoleMetricExporter,
} from '@opentelemetry/sdk-metrics'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { metrics, trace, context, Span, SpanStatusCode, Context, Meter, Tracer } from '@opentelemetry/api'
import axios from 'axios'
import env from '../env'
import QrynLogger from './QrynLogger'
import { QrynClient, Metric } from 'qryn-client'

// Global SDK initialization - this should happen only once
let sdkInitialized = false
let globalMeter: Meter
let globalTracer: Tracer

function initializeSDK () {
    if (sdkInitialized) return

    // Get GIGAPIPE configuration for tracing and metrics
    const gigapipeConfig = env.GIGAPIPE
    const tracingConfig = gigapipeConfig?.TRACING || gigapipeConfig?.DEFAULT
    const metricsConfig = gigapipeConfig?.METRICS || gigapipeConfig?.DEFAULT

    // Configure trace exporter
    let traceExporter
    if (tracingConfig?.url) {
        traceExporter = new OTLPTraceExporter({
            url: `${tracingConfig.url}/v1/traces`,
            headers: tracingConfig.headers || {}
        })
        // Using qryn trace exporter
    } else {
        traceExporter = new ConsoleSpanExporter()
        // No qryn config found, using console trace exporter
    }

    // Configure metric exporter
    let metricExporter
    if (metricsConfig?.url) {
        metricExporter = new OTLPMetricExporter({
            url: `${metricsConfig.url}/v1/metrics`,
            headers: metricsConfig.headers || {}
        })
        // Using qryn metric exporter
    } else {
        metricExporter = new ConsoleMetricExporter()
        // No qryn config found, using console metric exporter
    }

    const sdk = new NodeSDK({
        traceExporter,
        metricReader: new PeriodicExportingMetricReader({
            exporter: metricExporter,
            exportIntervalMillis: 5000, // Export every 5 seconds
        }),
        instrumentations: [ getNodeAutoInstrumentations() ],
    })

    sdk.start()

    globalMeter = metrics.getMeter('event-testing-metrics')
    globalTracer = trace.getTracer('event-testing')

    sdkInitialized = true
    // OpenTelemetry SDK initialized globally
}

export interface TelemetryEventAttributes {
    stage?: string
    [key: string]: any
}

export class TelemetryService {
    private meter: Meter
    private tracer: Tracer
    private eventCounter: any
    private operationDurationHistogram: any
    private activeSpans: Map<string, { span: Span; context: Context; startTime: number }> = new Map()
    private logger: QrynLogger
    private readonly metricsConfig: any
    private readonly qrynClient: QrynClient

    constructor (
        private readonly scenarioId: string,
        private readonly scenarioName: string
    ) {
        // Ensure global SDK is initialized
        initializeSDK()

        this.meter = globalMeter
        this.tracer = globalTracer
        this.logger = new QrynLogger('TelemetryService', scenarioName, scenarioId)

        // Create scenario-specific metrics with labels
        this.eventCounter = this.meter.createCounter('test_events', {
            description: 'Count of events during test scenarios',
        })

        this.operationDurationHistogram = this.meter.createHistogram('operation_duration', {
            unit: 'ms',
            description: 'Duration of operations',
        })

        this.logger.log(`Initialized for scenario: ${scenarioName} (${scenarioId})`)

        const gigapipeConfig = env.GIGAPIPE
        this.metricsConfig = gigapipeConfig?.METRICS || gigapipeConfig?.DEFAULT || null
        this.qrynClient = new QrynClient({
            baseUrl: this.metricsConfig.url,
            auth: {
                username: this.metricsConfig.username,
                password: this.metricsConfig.password,
            },
            timeout: 10000,
        })
    }

    private getOperationKey (eventName: string): string {
        return `${eventName}-${this.scenarioId}`
    }

    private getBaseAttributes (): Record<string, string> {
        return {
            'scenario.id': this.scenarioId,
            'scenario.name': this.scenarioName,
            'service.name': 'opensips-js-tests',
            'environment': env.GIGAPIPE?.DEFAULT?.scope || env.GIGAPIPE?.TRACING?.scope || 'test'
        }
    }

    public async logEvent (
        eventName: string,
        status: 'success' | 'failure' = 'success',
        additionalAttributes: TelemetryEventAttributes = {}
    ): Promise<void> {
        const stage = additionalAttributes.stage || 'unknown'
        const key = this.getOperationKey(eventName)
        const baseAttributes = this.getBaseAttributes()
        let currentSpan: Span | undefined
        let spanContext: Context | undefined

        // Merge base attributes with additional ones
        const allAttributes = {
            ...baseAttributes,
            'event.name': eventName,
            'event.stage': stage,
            ...additionalAttributes,
        }

        try {
            if (stage === 'triggered') {
                // Create new span for triggered events
                currentSpan = this.tracer.startSpan(`event.${eventName}.triggered`, {
                    attributes: allAttributes,
                })

                spanContext = trace.setSpan(context.active(), currentSpan)

                this.activeSpans.set(key, {
                    span: currentSpan,
                    context: spanContext,
                    startTime: Date.now()
                })

                await this.logger.log(`Started tracking: ${eventName}`, { eventName, stage })

            } else if (stage === 'completed' || stage === 'listener_error') {
                // Complete existing span
                const activeSpanEntry = this.activeSpans.get(key)

                if (activeSpanEntry) {
                    currentSpan = activeSpanEntry.span
                    spanContext = activeSpanEntry.context
                    this.activeSpans.delete(key)

                    if (currentSpan) {
                        currentSpan.setStatus({
                            code: status === 'success' ? SpanStatusCode.OK : SpanStatusCode.ERROR,
                            message: status === 'failure' ? `Event ${eventName} failed at stage ${stage}` : undefined,
                        })

                        currentSpan.setAttributes({
                            'event.status': status,
                            ...additionalAttributes,
                        })

                        const duration = Date.now() - activeSpanEntry.startTime

                        this.operationDurationHistogram.record(duration, {
                            ...allAttributes,
                            'event.status': status,
                        })

                        currentSpan.setAttribute('event.duration_ms', duration)
                        currentSpan.end()

                        await this.logger.log(`Completed tracking: ${eventName} (${duration}ms)`, { eventName, stage, duration })
                    }
                } else {
                    // Create one-off span if no active span found
                    await this.logger.warn(`No active span found for ${eventName}, creating one-off span`, { eventName, stage })

                    currentSpan = this.tracer.startSpan(`event.${eventName}.${stage}`, {
                        attributes: {
                            ...allAttributes,
                            'event.status': status,
                            warning: 'Span for completed/error stage started without a preceding triggered stage.',
                        },
                    })

                    currentSpan.setAttribute('event.duration_ms', 0)
                    currentSpan.end()
                }
            } else {
                // Create short-lived span for intermediate stages
                currentSpan = this.tracer.startSpan(`event.${eventName}.${stage}`, {
                    attributes: {
                        ...allAttributes,
                        'event.status': status,
                    },
                })
                currentSpan.end()
            }

            // Record event counter
            this.eventCounter.add(1, {
                ...allAttributes,
                'event.status': status,
            })

            await this.logger.log(`Event: ${eventName}, Stage: ${stage}, Status: ${status}`, { eventName, stage, status })

            // Send metrics to qryn if configured
            await this.sendMetricsToQryn(eventName, status, stage, allAttributes, currentSpan)

        } catch (error) {
            await this.logger.error(`Error logging event ${eventName}`, { eventName, error: error instanceof Error ? error.message : String(error) })
        }
    }

    private async sendMetricsToQryn (
        eventName: string,
        status: string,
        stage: string,
        attributes: Record<string, any>,
        span?: Span
    ): Promise<void> {
        // const gigapipeConfig = env.GIGAPIPE
        // const metricsConfig = gigapipeConfig?.METRICS || gigapipeConfig?.DEFAULT

        if (!this.metricsConfig?.url) {
            // If no qryn config, still try the visualization server as fallback
            try {
                const metricData: Record<string, any> = {
                    name: eventName,
                    metricType: stage,
                    event: eventName,
                    scenarioId: this.scenarioId,
                    scenarioName: this.scenarioName,
                    status,
                    timestamp: new Date().toISOString(),
                    ...attributes,
                    displayName: `${eventName} (${stage})`,
                    value: 1,
                }

                if (span && span.attributes['event.duration_ms']) {
                    metricData.executionTimeMs = span.attributes['event.duration_ms']
                }

                await axios.post('http://localhost:8080/collect-metrics', metricData)
            } catch (error: any) {
                await this.logger.warn(`Failed to send metric to visualization server: ${error.message}`, { eventName, stage })
            }
            return
        }

        try {
            // Send to qryn via Prometheus format
            // const timestamp = Date.now()
            // const labels = {
            //     scenario_name: this.scenarioName,
            //     scenario_id: this.scenarioId,
            //     event_name: eventName,
            //     stage: stage,
            //     status: status,
            //     environment: metricsConfig.scope || 'test'
            // }
            //
            // const collector = new Collector(
            //     this.logger.qrynClient,
            //     {
            //         orgId: 40,
            //         maxBulkSize: 50,
            //         maxTimeout: 3000,
            //         async: true,
            //     }
            // )
            // const metric = collector.createMetric({
            //     name: 'opensips_test_events_total',
            //     labels
            // })

            const timestamp = Date.now()
            const labels = {
                scenario_name: this.scenarioName,
                scenario_id: this.scenarioId,
                event_name: eventName,
                stage: stage,
                status: status,
                environment: this.metricsConfig.scope || 'test'
            }

            const metrics: Metric[] = []

            const testEventsTotal = new Metric('opensips_test_events_total', labels)
            testEventsTotal.addSample(1, timestamp)

            metrics.push(testEventsTotal)

            if (span && span.attributes['event.duration_ms']) {
                const testDurationMs = new Metric('opensips_test_duration_ms', labels)
                testDurationMs.addSample(span.attributes['event.duration_ms'], timestamp)

                metrics.push(testDurationMs)
            }

            await this.qrynClient.prom.push(metrics, { orgId: this.metricsConfig.OrgID }).then(() => {
                console.log('Metric push successful')
            }).catch(err => {
                console.log('Metric push error: ', err.message)
            })
        } catch (error: any) {
            await this.logger.error(`Failed to send metric to qryn: ${error.message}`, { eventName, stage, error: error.message })
        }
    }

    public async logSuccess (eventName: string, additionalAttributes: TelemetryEventAttributes = {}): Promise<void> {
        await this.logEvent(eventName, 'success', additionalAttributes)
    }

    public async logFailure (eventName: string, error?: string | Error, additionalAttributes: TelemetryEventAttributes = {}): Promise<void> {
        const errorMessage = error instanceof Error ? error.message : error
        await this.logEvent(eventName, 'failure', {
            ...additionalAttributes,
            errorMessage,
        })
    }

    public async logTriggered (eventName: string, additionalAttributes: TelemetryEventAttributes = {}): Promise<void> {
        await this.logEvent(eventName, 'success', {
            ...additionalAttributes,
            stage: 'triggered',
        })
    }

    public async logCompleted (eventName: string, additionalAttributes: TelemetryEventAttributes = {}): Promise<void> {
        await this.logEvent(eventName, 'success', {
            ...additionalAttributes,
            stage: 'completed',
        })
    }

    public async logError (eventName: string, error?: string | Error, additionalAttributes: TelemetryEventAttributes = {}): Promise<void> {
        const errorMessage = error instanceof Error ? error.message : error
        await this.logEvent(eventName, 'failure', {
            ...additionalAttributes,
            stage: 'listener_error',
            errorMessage,
        })
    }

    public cleanup (): void {
        // Clean up any remaining active spans
        for (const [ key, spanEntry ] of this.activeSpans.entries()) {
            this.logger.warn(`Cleaning up orphaned span: ${key}`, { spanKey: key })
            spanEntry.span.setStatus({
                code: SpanStatusCode.ERROR,
                message: 'Span ended during cleanup - possible incomplete operation'
            })
            spanEntry.span.end()
        }
        this.activeSpans.clear()
        this.logger.log('Cleaned up', { orphanedSpansCount: this.activeSpans.size })
    }

    // Getter methods for scenario info
    public getScenarioId (): string {
        return this.scenarioId
    }

    public getScenarioName (): string {
        return this.scenarioName
    }
}
