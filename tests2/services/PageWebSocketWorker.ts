import { Page, WebSocket } from 'playwright'
import Parser from '../../src/lib/janus/Parser'
import Logger from './Logger'
import { TelemetryService } from './TelemetryService'

interface WaitForMessageOptions {
    method: string
    status_code?: number
    timeout: number
    checkSentEvent?: boolean
}

export default class PageWebSocketWorker {
    private readonly logger = new Logger('PageWebSocketWorker')
    private connectedWebsocket: WebSocket

    constructor (
        private readonly page: Page,
        private readonly socketEventsToMonitor: Record<string, string> = {},
        private readonly callback: (eventName: string) => never,
        private readonly telemetryService: TelemetryService
    ) {}

    public setConnectedWebsocket (ws: WebSocket): void {
        this.connectedWebsocket = ws
        this.logger.log('Connected WebSocket:', ws.url())
    }

    public getConnectedWebsocket (): WebSocket {
        return this.connectedWebsocket
    }

    public setWebsocketListener (ws: WebSocket) {
        ws.on('framesent', async (msg) => {
            if (typeof msg.payload === 'string') {
                const message = msg.payload
                const parsedMessage = Parser.parseMessage(message, {
                    configuration: {},
                    contact: {}
                })
                console.log('SEND WEBSOCKET FRAME', {
                    method: parsedMessage.method,
                    status_code: 'status_code' in parsedMessage ? parsedMessage.status_code : null,
                })

            }
        })
        ws.on('framereceived', async (msg) => {
            if (typeof msg.payload === 'string') {
                const message = msg.payload
                const parsedMessage = Parser.parseMessage(message, {
                    configuration: {},
                    contact: {}
                })

                await this.telemetryService.logEvent(`websocket_${parsedMessage.method}`, 'success', {
                    stage: 'received',
                    method: parsedMessage.method,
                    status_code: 'status_code' in parsedMessage ? parsedMessage.status_code?.toString() : 'none'
                })

                console.log('RECEIVED WEBSOCKET FRAME', {
                    method: parsedMessage.method,
                    status_code: 'status_code' in parsedMessage ? parsedMessage.status_code : null,
                })

                // Check if this socket event has a corresponding local event
                if (parsedMessage && parsedMessage.method && parsedMessage.method in this.socketEventsToMonitor) {
                    const localEvent = this.socketEventsToMonitor[parsedMessage.method]
                    this.logger.log('triggering local event', localEvent)
                    this.callback(localEvent)
                }
            }
        })
    }

    public waitForMessage (ws: WebSocket, waitingOptions: WaitForMessageOptions): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => {
                    this.logger.log('Timeout waiting for message')
                    this.telemetryService.logError(`websocket_wait_${waitingOptions.method}`,
                        `Timeout waiting for ${waitingOptions.method}`)
                    reject(new Error(`Timeout waiting for message ${waitingOptions.method}`))
                },
                waitingOptions.timeout
            )

            const listener = async (msg: {payload: string | Buffer}) => {
                if (typeof msg.payload === 'string') {
                    const message = msg.payload
                    const parsedMessage = Parser.parseMessage(message, {
                        configuration: {},
                        contact: {}
                    })
                    await this.telemetryService.logEvent(`websocket_wait_${parsedMessage.method}`, 'success', {
                        stage: 'received',
                        method: parsedMessage.method,
                        waiting_for: waitingOptions.method,
                        expected_status: 'status_code' in waitingOptions ? waitingOptions.status_code.toString() : 'none',
                    })

                    if (parsedMessage &&
                        parsedMessage.method === waitingOptions.method &&
                        (!('status_code' in waitingOptions) ||
                            ('status_code' in parsedMessage && parsedMessage.status_code === waitingOptions.status_code))) {
                        this.logger.log('Received expected message:', parsedMessage.method)
                        clearTimeout(timeout)
                        ws.off('framereceived', listener.bind(this))
                        resolve()
                    }
                }
            }

            if (waitingOptions.checkSentEvent) {
                ws.on('framesent', listener.bind(this))
            } else {
                ws.on('framereceived', listener.bind(this))
            }
        })
    }

    public waitForSocket (domain: string): Promise<WebSocket> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => {
                    this.logger.log('Timeout waiting for websocket')
                    this.telemetryService.logError('websocket_connection',
                        `Timeout waiting for websocket connection to ${domain}`)
                    reject(new Error(`Timeout waiting for websocket ${domain}`))
                },
                10000
            )

            this.page.on('websocket', (ws) => {
                const url = new URL(ws.url())
                const connectedWebsocketDomain = url.hostname

                this.logger.log('GOT SOME WEBSOCKET', connectedWebsocketDomain)

                if (connectedWebsocketDomain === domain) {
                    this.logger.log('WebSocket found for domain:', domain)

                    this.telemetryService.logEvent('websocket_connection', 'success', {
                        stage: 'connected',
                        domain: domain
                    })

                    clearTimeout(timeout)
                    resolve(ws)
                }
            })
        })
    }
}
