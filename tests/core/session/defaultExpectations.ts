import { ActionType, WebSocketMessageExpectation } from '../types/actions'

/**
 * Default SIP-level expectations per action, extracted verbatim from
 * TestExecutor.getDefaultExpectations so the CallSession layer preserves the
 * exact same qryn expectation chain (INVITE 200, BYE 200, ...).
 */
export function getDefaultExpectations (actionType: ActionType): WebSocketMessageExpectation[][] {
    switch (actionType) {
        case 'dial':
            return [
                [
                    {
                        type: 'websocket',
                        method: 'INVITE',
                        status_code: 200,
                        timeout: 10000,
                        description: 'Default expectation: Should receive successful INVITE response'
                    }
                ]
            ]

        case 'hold':
        case 'unhold':
            return [
                [
                    {
                        type: 'websocket',
                        method: 'INVITE',
                        status_code: 100,
                        timeout: 10000,
                        description: `Default expectation: Should receive INVITE for ${actionType}`
                    }
                ]
            ]

        case 'hangup':
            return [
                [
                    {
                        type: 'websocket',
                        method: 'BYE',
                        status_code: 200,
                        timeout: 10000,
                        description: 'Default expectation: Should receive successful BYE response'
                    }
                ]
            ]

        case 'sendDTMF':
            return [
                [
                    {
                        type: 'websocket',
                        method: 'INFO',
                        status_code: 200,
                        timeout: 10000,
                        description: 'Default expectation: Should receive successful INFO response for DTMF'
                    }
                ]
            ]

        case 'transfer':
            return [
                [
                    {
                        type: 'websocket',
                        method: 'REFER',
                        status_code: 202,
                        timeout: 10000,
                        description: 'Default expectation: Should receive successful REFER response'
                    }
                ]
            ]

        default:
            return []
    }
}
