import { Stream } from 'qryn-client'
import QrynClient from './QrynClient'

export interface LogEntry {
    timestamp: string
    level: 'info' | 'error' | 'warn' | 'debug'
    message: string
    section: string
    scenarioName?: string
    scenarioId?: string
    metadata?: Record<string, any>
}

export interface QrynLogPayload {
    streams: Array<{
        stream: Record<string, string>
        values: Array<[string, string]>
    }>
}

export default class QrynLogger {
    public qrynClient = new QrynClient('LOGS')

    constructor (
        private readonly section: string,
        private readonly scenarioName?: string,
        private readonly scenarioId?: string
    ) {}

    private createLogEntry (level: LogEntry['level'], message: string, metadata?: Record<string, any>): LogEntry {
        return {
            timestamp: new Date().toISOString(),
            level,
            message,
            section: this.section,
            scenarioName: this.scenarioName,
            scenarioId: this.scenarioId,
            metadata
        }
    }

    private async sendToQryn (logEntry: LogEntry): Promise<void> {
        if (!this.qrynClient.isQrynConfigured) {
            // Fallback to console with structured format
            const prefix = this.scenarioName ? `[${this.scenarioName}]` : this.scenarioId ? `[${this.scenarioId}]` : ''
            const logMessage = `${prefix} [${this.section}] ${logEntry.message}`

            switch (logEntry.level) {
                case 'error':
                    console.error(logMessage, logEntry.metadata || '')
                    break
                case 'warn':
                    console.warn(logMessage, logEntry.metadata || '')
                    break
                case 'debug':
                    console.debug(logMessage, logEntry.metadata || '')
                    break
                default:
                    console.log(logMessage, logEntry.metadata || '')
            }
            return
        }

        try {
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

            this.qrynClient.client.loki.push([ stream ], { orgId: this.qrynClient.getEffectiveConfig.OrgID }).then(() => {
                console.log('Loki push successful')
            }).catch((err) => console.log('Loki push error: ', err.message))
        } catch (error) {
            // If qryn fails, fallback to console but log the error
            console.error(`[QrynLogger] Failed to send log to qryn: ${error instanceof Error ? error.message : error}`)
            console.error(`[QrynLogger] Original log: [${logEntry.level.toUpperCase()}] [${this.section}] ${logEntry.message}`, logEntry.metadata || '')
        }
    }

    public async log (message: string, metadata?: Record<string, any>): Promise<void> {
        const logEntry = this.createLogEntry('info', message, metadata)
        await this.sendToQryn(logEntry)
    }

    public async error (message: string, metadata?: Record<string, any>): Promise<void> {
        const logEntry = this.createLogEntry('error', message, metadata)
        await this.sendToQryn(logEntry)
    }

    public async warn (message: string, metadata?: Record<string, any>): Promise<void> {
        const logEntry = this.createLogEntry('warn', message, metadata)
        await this.sendToQryn(logEntry)
    }

    public async debug (message: string, metadata?: Record<string, any>): Promise<void> {
        const logEntry = this.createLogEntry('debug', message, metadata)
        await this.sendToQryn(logEntry)
    }

    // === LIFECYCLE LOGGING METHODS ===
    public async logScenarioStart(): Promise<void> {
        await this.log('Scenario execution started', {
            scenario_id: this.scenarioId,
            scenario_name: this.scenarioName
        })
    }

    public async logScenarioEnd(success: boolean, durationMs?: number): Promise<void> {
        await this.log('Scenario execution completed', {
            scenario_id: this.scenarioId,
            scenario_name: this.scenarioName,
            success,
            ...(durationMs && { duration_ms: durationMs })
        })
    }

    public async logEventStart(eventType: string, eventData?: any): Promise<void> {
        await this.log(`Event started: ${eventType}`, {
            event_type: eventType,
            event_data: eventData
        })
    }

    public async logEventEnd(eventType: string, success: boolean, actionsCount?: number): Promise<void> {
        await this.log(`Event completed: ${eventType}`, {
            event_type: eventType,
            success,
            ...(actionsCount && { actions_count: actionsCount })
        })
    }

    public async logActionStart(actionType: string, actionData?: any): Promise<void> {
        await this.debug(`Action started: ${actionType}`, {
            action_type: actionType,
            action_data: actionData
        })
    }

    public async logActionEnd(actionType: string, success: boolean, result?: any, durationMs?: number): Promise<void> {
        await this.debug(`Action completed: ${actionType}`, {
            action_type: actionType,
            success,
            ...(result && { result }),
            ...(durationMs && { duration_ms: durationMs })
        })
    }

    public async logWebSocketMessage(direction: 'sent' | 'received', method: string, statusCode?: number): Promise<void> {
        await this.debug(`WebSocket message ${direction}: ${method}`, {
            direction,
            sip_method: method,
            ...(statusCode && { status_code: statusCode })
        })
    }

    public async logActionError(actionType: string, error: Error | string, phase: string = 'execution'): Promise<void> {
        await this.error(`Action failed: ${actionType}`, {
            action_type: actionType,
            phase,
            error: error instanceof Error ? error.message : error
        })
    }

    public async logEventError(eventType: string, error: Error | string): Promise<void> {
        await this.error(`Event failed: ${eventType}`, {
            event_type: eventType,
            error: error instanceof Error ? error.message : error
        })
    }
}
