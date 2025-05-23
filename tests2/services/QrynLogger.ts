import axios from 'axios'
import env from '../env'

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
    private readonly logsConfig: any
    private readonly fallbackToConsole: boolean

    constructor (
        private readonly section: string,
        private readonly scenarioName?: string,
        private readonly scenarioId?: string
    ) {
        // Get LOGS configuration with DEFAULT fallback
        const gigapipeConfig = env.GIGAPIPE
        this.logsConfig = gigapipeConfig?.LOGS || gigapipeConfig?.DEFAULT || null
        this.fallbackToConsole = !this.logsConfig?.url

        if (this.fallbackToConsole) {
            console.warn('[QrynLogger] No GIGAPIPE.LOGS or DEFAULT config found, falling back to console logging')
        }
    }

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
        if (this.fallbackToConsole) {
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
            // Create Loki-compatible payload for qryn
            const payload: QrynLogPayload = {
                streams: [ {
                    stream: {
                        level: logEntry.level,
                        section: this.section,
                        ...(this.scenarioName && { scenario_name: this.scenarioName }),
                        ...(this.scenarioId && { scenario_id: this.scenarioId }),
                        job: 'opensips-js-tests',
                        environment: this.logsConfig.scope || 'test'
                    },
                    values: [ [
                        (Date.parse(logEntry.timestamp) * 1000000).toString(), // Loki expects nanoseconds
                        JSON.stringify({
                            message: logEntry.message,
                            ...(logEntry.metadata && { metadata: logEntry.metadata })
                        })
                    ] ]
                } ]
            }

            await axios.post(
                `${this.logsConfig.url}/loki/api/v1/push`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        ...this.logsConfig.headers
                    },
                    timeout: 5000
                }
            )
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

    // Static method to get configuration status
    public static isQrynConfigured (): boolean {
        const gigapipeConfig = env.GIGAPIPE
        return Boolean(gigapipeConfig?.LOGS?.url || gigapipeConfig?.DEFAULT?.url)
    }

    // Static method to get effective configuration
    public static getEffectiveConfig (): any {
        const gigapipeConfig = env.GIGAPIPE
        return gigapipeConfig?.LOGS || gigapipeConfig?.DEFAULT || null
    }
}
