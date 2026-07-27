import { QrynClient as SourceQrynClient, Metric, Stream } from 'qryn-client'
import env, { GigapipeConfigType, GIGAPIPE_TYPES } from '../env'

type NotDefaultGigapipeTypes = Exclude<GIGAPIPE_TYPES, 'DEFAULT'>

export interface LogEntry {
    timestamp: string
    level: 'info' | 'error' | 'warn' | 'debug'
    message: string
    section: string
    scenarioName?: string
    scenarioId?: string
    metadata?: Record<string, any>
}

const metricsConfig = env.GIGAPIPE?.METRICS ?? env.GIGAPIPE?.DEFAULT
const logsConfig = env.GIGAPIPE?.LOGS ?? env.GIGAPIPE?.DEFAULT

const qrynMetricClient = metricsConfig
    ? new SourceQrynClient({
        baseUrl: metricsConfig.url,
        auth: {
            username: metricsConfig.username,
            password: metricsConfig.password,
        },
        timeout: 10000,
    })
    : null

const qrynLokiClient = logsConfig
    ? new SourceQrynClient({
        baseUrl: logsConfig.url,
        auth: {
            username: logsConfig.username,
            password: logsConfig.password,
        },
        timeout: 10000,
    })
    : null

export default class QrynClient {
    constructor (
        private readonly section: string,
        private readonly scenarioName?: string,
        private readonly scenarioId?: string
    ) {
        this.section = section
        this.scenarioName = scenarioName
        this.scenarioId = scenarioId
    }

    public sendLogsToQryn (streams: Stream[]) {
        if (!qrynLokiClient || !logsConfig) return
        qrynLokiClient.loki.push(streams, { orgId: logsConfig.OrgID }).catch((err) => console.log('Loki push error: ', err.message))
    }

    public sendMetricsToQryn (metrics: Metric[]) {
        if (!qrynMetricClient || !metricsConfig) return
        qrynMetricClient.prom.push(metrics, {
            orgId: metricsConfig.OrgID
        }).catch(error => {
            console.log('Metrics push error: ', error.message)
        })
    }

    private async createLogForQryn (level: LogEntry['level'], message: string, metadata?: Record<string, any>): Promise<void> {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                level,
                message,
                section: this.section,
                scenarioName: this.scenarioName,
                scenarioId: this.scenarioId,
                metadata
            }

            const stream = new Stream({
                level: logEntry.level,
                section: this.section,
                ...(this.scenarioName && { scenario_name: this.scenarioName }),
                ...(this.scenarioId && { scenario_id: this.scenarioId }),
                job: 'opensips-js-tests-logs',
            })

            stream.addEntry(
                Date.parse(logEntry.timestamp),
                JSON.stringify({
                    message: logEntry.message,
                    ...(logEntry.metadata && { metadata: logEntry.metadata })
                })
            )

            this.sendLogsToQryn([ stream ])
        } catch (error) {
            console.log(error)
        }
    }

    public async log (message: string, metadata?: Record<string, any>): Promise<void> {
        console.log(message, metadata)
        await this.createLogForQryn('info', message, metadata)
    }

    public async error (message: string, metadata?: Record<string, any>): Promise<void> {
        console.error(message, metadata)
        await this.createLogForQryn('error', message, metadata)
    }

    public async warn (message: string, metadata?: Record<string, any>): Promise<void> {
        console.log(message, metadata)
        await this.createLogForQryn('warn', message, metadata)
    }

    public async debug (message: string, metadata?: Record<string, any>): Promise<void> {
        console.log(message, metadata)
        await this.createLogForQryn('debug', message, metadata)
    }
}
