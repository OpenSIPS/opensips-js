import { NodeSDK } from '@opentelemetry/sdk-node'
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { metrics, trace, context, Span, SpanStatusCode, Context, Meter, Tracer, SpanKind } from '@opentelemetry/api'
import env from '../env'
import QrynClient from './QrynClient'

export interface TelemetryEventAttributes {
    stage?: string
    [key: string]: any
}

// The NodeSDK is process-global: one instance shared by every TelemetryService,
// started lazily and shut down via TelemetryService.shutdownSdk() so exporters
// (the 5s PeriodicExportingMetricReader) stop keeping the event loop alive.
let sharedSdk: NodeSDK | null = null

export class TelemetryService {
    private meter: Meter
    private tracer: Tracer
    private eventCounter: any
    private operationDurationHistogram: any
    private activeSpans: Map<string, { span: Span; context: Context; startTime: number }> = new Map()
    private scenarioRootSpan: Span | null = null
    private currentEventSpan: Span | null = null
    private readonly qrynClient: QrynClient

    constructor (
        private readonly scenarioId: string,
        private readonly scenarioName: string
    ) {
        this.initializeSDK()

        this.meter = metrics.getMeter('event-testing-metrics') || metrics.getMeter('event-testing-metrics-fallback')
        this.tracer = trace.getTracer('event-testing') || trace.getTracer('event-testing-fallback')
        this.qrynClient = new QrynClient('TelemetryService', scenarioName, scenarioId)

        this.eventCounter = this.meter.createCounter('test_events', {
            description: 'Count of events during test scenarios',
        })

        this.operationDurationHistogram = this.meter.createHistogram('operation_duration', {
            unit: 'ms',
            description: 'Duration of operations',
        })

        this.qrynClient.log(`Initialized for scenario: ${scenarioName} (${scenarioId})`)

        this.createScenarioRootSpan()
    }

    private initializeSDK () {
        if (sharedSdk) return

        const gigapipeConfig = env.GIGAPIPE
        const tracingConfig = gigapipeConfig?.TRACING || gigapipeConfig?.DEFAULT
        const metricsConfig = gigapipeConfig?.METRICS || gigapipeConfig?.DEFAULT

        let traceExporter
        if (tracingConfig?.url) {
            traceExporter = new ZipkinExporter({
                url: `${tracingConfig.url}/tempo/spans`,
                serviceName: 'opensips-tests',
                headers: tracingConfig.headers || {},
            })
        } else {
            return
        }

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

        sharedSdk = sdk
    }

    /**
     * Flushes and stops the shared NodeSDK (exporters, metric reader). Must be
     * called once after ALL scenarios/sessions in the process are done —
     * otherwise the periodic metric exporter keeps the process alive (T1.3).
     */
    public static async shutdownSdk (): Promise<void> {
        const sdk = sharedSdk
        sharedSdk = null

        if (!sdk) {
            return
        }

        try {
            await sdk.shutdown()
        } catch (error) {
            console.warn(
                '[TelemetryService] SDK shutdown failed:',
                error instanceof Error ? error.message : error
            )
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

        this.qrynClient.log('Created scenario root span', { spanId: this.scenarioRootSpan.spanContext().spanId })
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

        this.qrynClient.log(`Started action span: ${actionType}`, {
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

        this.qrynClient.log('Finished action span', {
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

        this.qrynClient.log(`Started event span: ${eventType}`, {
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

        this.qrynClient.log('Finished event span', {
            spanId: eventSpan.spanContext().spanId,
            success,
            actionsCount
        })
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

        const allAttributes = {
            ...baseAttributes,
            'event.name': eventName,
            'event.stage': stage,
            ...additionalAttributes,
        }

        try {
            if (stage === 'triggered') {
                currentSpan = this.tracer.startSpan(`event.${eventName}.triggered`, {
                    attributes: allAttributes,
                })

                spanContext = trace.setSpan(context.active(), currentSpan)

                this.activeSpans.set(key, {
                    span: currentSpan,
                    context: spanContext,
                    startTime: Date.now()
                })

                await this.qrynClient.log(`Started tracking: ${eventName}`, {
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

                        await this.qrynClient.log(`Completed tracking: ${eventName} (${duration}ms)`, {
                            eventName,
                            stage,
                            duration
                        })
                    }
                } else {
                    await this.qrynClient.warn(`No active span found for ${eventName}, creating one-off span`, {
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
                currentSpan = this.tracer.startSpan(`event.${eventName}.${stage}`, {
                    attributes: {
                        ...allAttributes,
                        'event.status': status,
                    },
                })
                currentSpan.end()
            }

            this.eventCounter.add(1, {
                ...allAttributes,
                'event.status': status,
            })

            await this.qrynClient.log(`Event: ${eventName}, Stage: ${stage}, Status: ${status}`, {
                eventName,
                stage,
                status
            })
        } catch (error) {
            // await this.qrynClient.error(`Error logging event ${eventName}`, {
            //     eventName,
            //     error: error instanceof Error ? error.message : String(error)
            // })
        }
    }

    public cleanup (): void {
        // Clean up any remaining active spans
        for (const [ key, spanEntry ] of this.activeSpans.entries()) {
            this.qrynClient.warn(`Cleaning up orphaned span: ${key}`, { spanKey: key })
            spanEntry.span.setStatus({
                code: SpanStatusCode.ERROR,
                message: 'Span ended during cleanup - possible incomplete operation'
            })
            spanEntry.span.end()
        }
        this.activeSpans.clear()

        if (this.currentEventSpan) {
            this.currentEventSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: 'Event span ended during cleanup - possible incomplete operation'
            })
            this.currentEventSpan.end()
            this.currentEventSpan = null
        }

        if (this.scenarioRootSpan) {
            this.scenarioRootSpan.setStatus({
                code: SpanStatusCode.OK,
                message: 'Scenario completed'
            })
            this.scenarioRootSpan.setAttribute('scenario.end_time', new Date().toISOString())
            this.scenarioRootSpan.end()
        }

        this.scenarioRootSpan = null

        this.qrynClient.log('Cleaned up all spans', {
            orphanedSpansCount: this.activeSpans.size,
            hadActiveEventSpan: this.currentEventSpan !== null
        })
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

    public withSpanContext<T> (span: Span, fn: () => T | Promise<T>): T | Promise<T> {
        const spanContext = trace.setSpan(context.active(), span)
        return context.with(spanContext, fn)
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

    private getOperationKey (eventName: string): string {
        return `${eventName}-${this.scenarioId}`
    }

    private getBaseAttributes (): Record<string, string> {
        return {
            'scenario.id': this.scenarioId,
            'scenario.name': this.scenarioName,
            'service.name': 'opensips-js-tests',
            environment: 'test'
        }
    }

    public getScenarioId (): string {
        return this.scenarioId
    }

    public getScenarioName (): string {
        return this.scenarioName
    }
}
