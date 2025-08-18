import { NodeSDK } from '@opentelemetry/sdk-node'
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node'
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import {
    PeriodicExportingMetricReader,
    ConsoleMetricExporter,
} from '@opentelemetry/sdk-metrics'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { metrics, trace, context, Span, SpanStatusCode, Context, Meter, Tracer, SpanKind } from '@opentelemetry/api'
import env from '../env'
import QrynLogger from './QrynLogger'
import QrynClient from './QrynClient'
import { Metric } from 'qryn-client'

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
        traceExporter = new ZipkinExporter({
            url: `${tracingConfig.url}/tempo/spans`,
            serviceName: 'opensips-tests',
            headers: tracingConfig.headers || {},
        })
    } else {
        return // No tracing config, skip SDK initialization
    }

    // Configure metric exporter
    let metricExporter
    let metricReader
    if (metricsConfig?.url) {
        metricExporter = new OTLPMetricExporter({
            url: `${metricsConfig.url}/v1/metrics`,
            headers: metricsConfig.headers || {}
        })
        metricReader = new PeriodicExportingMetricReader({
            exporter: metricExporter,
            exportIntervalMillis: 5000, // Export every 5 seconds
        })
    }

    const sdk = new NodeSDK({
        traceExporter,
        metricReader,
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
    private scenarioRootSpan: Span | null = null
    private currentEventSpan: Span | null = null
    private logger: QrynLogger
    private readonly qrynClient: QrynClient

    constructor (
        private readonly scenarioId: string,
        private readonly scenarioName: string
    ) {
        // Ensure global SDK is initialized
        initializeSDK()

        this.meter = globalMeter || metrics.getMeter('event-testing-metrics-fallback')
        this.tracer = globalTracer || trace.getTracer('event-testing-fallback')
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

        this.qrynClient = new QrynClient('TRACING')

        // Create root span for the entire scenario
        this.createScenarioRootSpan()
    }

    private getOperationKey (eventName: string): string {
        return `${eventName}-${this.scenarioId}`
    }

    private getBaseAttributes (): Record<string, string> {
        return {
            'scenario.id': this.scenarioId,
            'scenario.name': this.scenarioName,
            'service.name': 'opensips-js-tests',
            environment: this.qrynClient.getEffectiveConfig?.scope || 'test'
        }
    }

    private createScenarioRootSpan (): void {
        this.scenarioRootSpan = this.tracer.startSpan(`scenario.${this.scenarioName}`, {
            kind: SpanKind.SERVER,
            attributes: {
                ...this.getBaseAttributes(),
                'scenario.type': 'test_execution',
                'scenario.start_time': new Date().toISOString()
            }
        })

        this.logger.log('Created scenario root span', { spanId: this.scenarioRootSpan.spanContext().spanId })
    }

    public startActionSpan (actionType: string, actionData?: any): Span {
        // Actions should always be children of the current event span
        const parentSpan = this.currentEventSpan || this.scenarioRootSpan
        const parentContext = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active()

        const actionSpan = this.tracer.startSpan(`action.${actionType}`, {
            kind: SpanKind.INTERNAL,
            attributes: {
                ...this.getBaseAttributes(),
                'action.type': actionType,
                'action.data': actionData ? JSON.stringify(actionData) : undefined,
                'action.start_time': new Date().toISOString()
            }
        }, parentContext)

        this.logger.log(`Started action span: ${actionType}`, {
            spanId: actionSpan.spanContext().spanId,
            parentSpanId: parentSpan?.spanContext().spanId,
            parentType: this.currentEventSpan ? 'event' : 'scenario'
        })

        return actionSpan
    }

    public finishActionSpan (actionSpan: Span, success: boolean, error?: Error | string, result?: any): void {
        if (!actionSpan) return

        actionSpan.setStatus({
            code: success ? SpanStatusCode.OK : SpanStatusCode.ERROR,
            message: error ? (error instanceof Error ? error.message : error) : undefined
        })

        if (result) {
            actionSpan.setAttributes({
                'action.result': JSON.stringify(result),
                'action.success': success.toString()
            })
        }

        if (error) {
            actionSpan.recordException(error instanceof Error ? error : new Error(error))
        }

        actionSpan.end()

        this.logger.log('Finished action span', {
            spanId: actionSpan.spanContext().spanId,
            success,
            error: error ? (error instanceof Error ? error.message : error) : undefined
        })
    }

    public startEventSpan (eventType: string, eventData?: any): Span {
        // Events should always be children of the scenario root span
        const parentContext = this.scenarioRootSpan ? trace.setSpan(context.active(), this.scenarioRootSpan) : context.active()

        const eventSpan = this.tracer.startSpan(`event.${eventType}`, {
            kind: SpanKind.INTERNAL,
            attributes: {
                ...this.getBaseAttributes(),
                'event.type': eventType,
                'event.data': eventData ? JSON.stringify(eventData) : undefined,
                'event.start_time': new Date().toISOString()
            }
        }, parentContext)

        // Set this as the current event span so actions become its children
        this.currentEventSpan = eventSpan

        this.logger.log(`Started event span: ${eventType}`, {
            spanId: eventSpan.spanContext().spanId,
            parentSpanId: this.scenarioRootSpan?.spanContext().spanId
        })

        return eventSpan
    }

    public finishEventSpan (eventSpan: Span, success: boolean, error?: Error | string, actionsCount?: number): void {
        if (!eventSpan) return

        eventSpan.setStatus({
            code: success ? SpanStatusCode.OK : SpanStatusCode.ERROR,
            message: error ? (error instanceof Error ? error.message : error) : undefined
        })

        if (actionsCount !== undefined) {
            eventSpan.setAttribute('event.actions_count', actionsCount)
        }

        if (error) {
            eventSpan.recordException(error instanceof Error ? error : new Error(error))
        }

        eventSpan.end()

        // Clear current event span when this event finishes
        if (this.currentEventSpan === eventSpan) {
            this.currentEventSpan = null
        }

        this.logger.log('Finished event span', {
            spanId: eventSpan.spanContext().spanId,
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
        const spanContext = trace.setSpan(context.active(), span)
        return context.with(spanContext, fn)
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

                await this.logger.log(`Started tracking: ${eventName}`, {
                    eventName,
                    stage
                })

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

                        await this.logger.log(`Completed tracking: ${eventName} (${duration}ms)`, {
                            eventName,
                            stage,
                            duration
                        })
                    }
                } else {
                    // Create one-off span if no active span found
                    await this.logger.warn(`No active span found for ${eventName}, creating one-off span`, {
                        eventName,
                        stage
                    })

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

            await this.logger.log(`Event: ${eventName}, Stage: ${stage}, Status: ${status}`, {
                eventName,
                stage,
                status
            })

            // Send metrics to qryn if configured
            await this.sendMetricsToQryn(eventName, status, stage, allAttributes, currentSpan)
        } catch (error) {
            await this.logger.error(`Error logging event ${eventName}`, {
                eventName,
                error: error instanceof Error ? error.message : String(error)
            })
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

        if (!this.qrynClient.isQrynConfigured) {
            // Fallback to console with structured format

            // console.log('Qryn client not configured, skipping metric push', {
            //     eventName,
            //     status,
            //     stage,
            //     attributes
            // })

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
                environment: this.qrynClient.getEffectiveConfig?.scope || 'test'
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

            // await this.qrynClient.client.prom.push(metrics, { orgId: this.qrynClient.getEffectiveConfig.OrgID }).then(() => {
            //     console.log('Metric push successful')
            // }).catch(err => {
            //     console.log('Metric push error: ', err.message)
            // })
        } catch (error: any) {
            await this.logger.error(`Failed to send metric to qryn: ${error.message}`, {
                eventName,
                stage,
                error: error.message
            })
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

        // Clean up current event span if still active
        if (this.currentEventSpan) {
            this.currentEventSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: 'Event span ended during cleanup - possible incomplete operation'
            })
            this.currentEventSpan.end()
            this.currentEventSpan = null
        }

        // Finish scenario root span
        if (this.scenarioRootSpan) {
            this.scenarioRootSpan.setStatus({
                code: SpanStatusCode.OK,
                message: 'Scenario completed'
            })
            this.scenarioRootSpan.setAttribute('scenario.end_time', new Date().toISOString())
            this.scenarioRootSpan.end()
        }

        this.scenarioRootSpan = null

        this.logger.log('Cleaned up all spans', {
            orphanedSpansCount: this.activeSpans.size,
            hadActiveEventSpan: this.currentEventSpan !== null
        })
    }

    // Getter methods for scenario info
    public getScenarioId (): string {
        return this.scenarioId
    }

    public getScenarioName (): string {
        return this.scenarioName
    }
}
