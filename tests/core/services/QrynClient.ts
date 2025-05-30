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

const qrynMetricClient = new SourceQrynClient({
    baseUrl: env.GIGAPIPE.METRICS.url,
    auth: {
        username: env.GIGAPIPE.METRICS.username,
        password: env.GIGAPIPE.METRICS.password,
    },
    timeout: 10000,
})

const qrynLokiClient = new SourceQrynClient({
    baseUrl: env.GIGAPIPE.LOGS.url,
    auth: {
        username: env.GIGAPIPE.LOGS.username,
        password: env.GIGAPIPE.LOGS.password,
    },
    timeout: 10000,
})

export default class QrynClient {
    constructor (
        private readonly section: string,
        private readonly scenarioName?: string,
        private readonly scenarioId?: string
    )

    public sendLogsToQryn (streams: Stream[]) {
        qrynLokiClient.push(streams, { orgId: env.GIGAPIPE.LOGS.OrgID }).then(() => {
            console.log('Loki push successful')
        }).catch((err) => console.log('Loki push error: ', err.message))
    }

    public sendMetricsToQryn (metrics: Metric[]) {
        qrynMetricClient.push(metrics, {
            orgId: env.GIGAPIPE.METRICS.OrgID
        }).then(() => {
            console.log('Metrics push successful')
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
                job: 'opensips-js-tests',
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
        await this.createLogForQryn('info', message, metadata)
    }

    public async error (message: string, metadata?: Record<string, any>): Promise<void> {
        await this.createLogForQryn('error', message, metadata)
    }

    public async warn (message: string, metadata?: Record<string, any>): Promise<void> {
        await this.createLogForQryn('warn', message, metadata)
    }

    public async debug (message: string, metadata?: Record<string, any>): Promise<void> {
        await this.createLogForQryn('debug', message, metadata)
    }
}
