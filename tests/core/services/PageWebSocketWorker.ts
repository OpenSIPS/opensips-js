import { Page, WebSocket } from 'playwright'
import Parser from '../../../src/lib/janus/Parser'
import { TelemetryService } from './TelemetryService'

interface WaitForMessageOptions {
    method: string
    status_code?: number
    timeout: number
    checkSentEvent?: boolean
}

export default class PageWebSocketWorker {
    private connectedWebsocket: WebSocket

    constructor (
        private readonly page: Page,
        private readonly socketEventsToMonitor: Record<string, string> = {},
        private readonly callback: (eventName: string) => never,
        private readonly telemetryService: TelemetryService
    ) {
        // All logging now goes through telemetryService
    }

    public setConnectedWebsocket (ws: WebSocket): void {
        this.connectedWebsocket = ws
        this.telemetryService.log('Connected WebSocket', { url: ws.url() })
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

                // Record WebSocket event metrics and logs
                this.telemetryService.recordWebSocketEvent(
                    parsedMessage.method, 
                    'received', 
                    'status_code' in parsedMessage ? parsedMessage.status_code : undefined
                )

                await this.telemetryService.log('Received WebSocket frame', {
                    method: parsedMessage.method,
                    status_code: 'status_code' in parsedMessage ? parsedMessage.status_code : null,
                })

                // Check if this socket event has a corresponding local event
                if (parsedMessage && parsedMessage.method && parsedMessage.method in this.socketEventsToMonitor) {
                    const localEvent = this.socketEventsToMonitor[parsedMessage.method]
                    await this.telemetryService.log('Triggering local event', {
                        localEvent,
                        method: parsedMessage.method
                    })
                    this.callback(localEvent)
                }
            }
        })
    }

    public waitForMessage (ws: WebSocket, waitingOptions: WaitForMessageOptions): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => {
                    this.telemetryService.warn('Timeout waiting for message', {
                        method: waitingOptions.method,
                        timeout: waitingOptions.timeout
                    })
                    this.telemetryService.error(`Timeout waiting for ${waitingOptions.method}`)
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
                    // Record WebSocket wait event
                    this.telemetryService.recordWebSocketEvent(
                        parsedMessage.method, 
                        'received', 
                        'status_code' in parsedMessage ? parsedMessage.status_code : undefined
                    )
                    if (parsedMessage &&
                        parsedMessage.method === waitingOptions.method &&
                        (!('status_code' in waitingOptions) ||
                            ('status_code' in parsedMessage && parsedMessage.status_code === waitingOptions.status_code))) {
                        await this.telemetryService.log('Received expected message', {
                            method: parsedMessage.method,
                            status_code: 'status_code' in parsedMessage ? parsedMessage.status_code : 'none'
                        })
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
                    this.telemetryService.warn('Timeout waiting for websocket', {
                        domain,
                        timeout: 10000
                    })
                    this.telemetryService.error(`Timeout waiting for websocket connection to ${domain}`)
                    reject(new Error(`Timeout waiting for websocket ${domain}`))
                },
                10000
            )

            this.page.on('websocket', (ws) => {
                const url = new URL(ws.url())
                const connectedWebsocketDomain = url.hostname

                this.telemetryService.log('Found WebSocket connection', { domain: connectedWebsocketDomain })

                if (connectedWebsocketDomain === domain) {
                    this.telemetryService.log('WebSocket found for domain', { domain })

                    this.telemetryService.log('WebSocket connection successful', {
                        domain: domain
                    })

                    clearTimeout(timeout)
                    resolve(ws)
                }
            })
        })
    }
}
