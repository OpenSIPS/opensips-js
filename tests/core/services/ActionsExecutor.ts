import path from 'path'
import fs from 'fs/promises'

import { Browser, Locator, Page } from 'playwright'
import { Selectors } from '../src/selectors'
import { WebRTCMetricsCollector } from './WebRTCMetricsCollector'
import { WebRTCMetricsSender } from './WebRTCMetricsSender'
import PageWebSocketWorker from './PageWebSocketWorker'
import WindowMethodsWorker from './WindowMethodsWorker'
import QrynLogger from './QrynLogger'

import {
    GetActionPayload,
    GetActionResponse,
    ActionsExecutorImplements,
    RegisterAction,
    DialAction,
    AnswerAction,
    WaitAction,
    HoldAction,
    UnholdAction,
    HangupAction,
    UnregisterAction,
    PlaySoundAction,
    SendDTMFAction,
    TransferAction,
    DNDAction,
    RequestAction,
    BaseActionSuccessResponse,
    Expectation,
    ActionResponse,
    ActionType, isActionError,
} from '../types/actions'

import { expect } from '@playwright/test'

/**
 * TestExecutor - Handles the execution of test actions
 */
export default class ActionsExecutor implements ActionsExecutorImplements {
    private usernameInput: Locator
    private passwordInput: Locator
    private domainInput: Locator
    private loginButton: Locator
    private useAudioCheckbox: Locator
    private useVideoCheckbox: Locator
    private holdButton: Locator

    private DNDCheckbox: Locator
    private yourTargetInput: Locator
    private callButton: Locator
    private answerButton: Locator
    private logoutButton: Locator
    private hangupButton: Locator
    private DTMFSendButton: Locator
    private DTMFInput: Locator
    private transferButton: Locator
    private logger: QrynLogger
    private webrtcMetricsSender: WebRTCMetricsSender | null = null

    constructor (
        private readonly scenarioId: string,
        private readonly scenarioName: string,
        private readonly pageWebSocketWorker: PageWebSocketWorker,
        private readonly windowMethodsWorker: WindowMethodsWorker,
        public readonly page: Page,
        public readonly browser: Browser
    ) {
        this.logger = new QrynLogger('ActionsExecutor', scenarioName, scenarioId)
    }

    public async checkExpectations<T extends BaseActionSuccessResponse> (
        expectations: Expectation<T>[][],
        result: ActionResponse<T>,
        actionType: ActionType
    ): Promise<boolean> {
        if (!expectations || expectations.length === 0) {
            return true // No expectations to check
        }

        await this.logger.log('Checking expectations', {
            actionType,
            expectationGroups: expectations.length,
        })

        // Try each expectation group (OR logic)
        for (const expectationGroup of expectations) {
            try {
                let allExpectationsMet = true

                // Check all expectations in the group (AND logic)
                for (const expectation of expectationGroup) {
                    let expectationMet = false

                    switch (expectation.type) {
                        case 'websocket':
                            // Handle WebSocket expectation
                            try {
                                await this.logger.log('Checking websocket expectation', {
                                    method: expectation.method,
                                    status_code: expectation.status_code,
                                    description: expectation.description
                                })

                                await this.pageWebSocketWorker.waitForMessage(
                                    this.pageWebSocketWorker.getConnectedWebsocket(),
                                    {
                                        method: expectation.method,
                                        status_code: expectation.status_code,
                                        timeout: expectation.timeout || 10000,
                                        checkSentEvent: expectation.checkSentEvent
                                    }
                                )
                                expectationMet = true
                            } catch (error) {
                                await this.logger.error('WebSocket expectation failed', {
                                    method: expectation.method,
                                    status_code: expectation.status_code,
                                    error: error instanceof Error ? error.message : String(error),
                                    description: expectation.description
                                })
                                expectationMet = false
                            }
                            break

                        case 'response':
                            // Handle response expectation
                            try {
                                await this.logger.log('Checking response expectation', {
                                    description: expectation.description
                                })

                                // Check properties if specified
                                if (expectation.properties) {
                                    if (isActionError(result)) {
                                        expectationMet = expectation.properties.success === false
                                    } else {
                                        // For success responses, check all properties
                                        expectationMet = Object.entries(expectation.properties).every(
                                            ([ key, value ]) => {
                                                // Special case for wildcard values
                                                if (value === '*') {
                                                    return key in result
                                                }

                                                if (typeof value === 'object' && value !== null) {
                                                    return JSON.stringify(result[key]) === JSON.stringify(value)
                                                }
                                                return result[key] === value
                                            }
                                        )
                                    }

                                    await this.logger.log('Response properties check result', {
                                        result: expectationMet,
                                        properties: expectation.properties,
                                        description: expectation.description
                                    })
                                } else {
                                    // If no properties, just check success flag
                                    expectationMet = (result.success === true)
                                }
                            } catch (error) {
                                await this.logger.error('Response expectation failed', {
                                    error: error instanceof Error ? error.message : String(error),
                                    description: expectation.description
                                })
                                expectationMet = false
                            }
                            break

                        default:
                            await this.logger.error('Unknown expectation type', {
                                type: expectation.type,
                                description: expectation.description
                            })
                            expectationMet = false
                    }

                    // If any expectation in AND group fails, the group fails
                    if (!expectationMet) {
                        allExpectationsMet = false
                        break
                    }
                }

                // If all expectations in this group are met, return true (OR logic)
                if (allExpectationsMet) {
                    await this.logger.log('Expectation group passed', {
                        actionType,
                        groupSize: expectationGroup.length
                    })
                    return true
                }
            } catch (error) {
                await this.logger.error('Error checking expectation group', {
                    actionType,
                    error: error instanceof Error ? error.message : String(error)
                })
                // Continue checking other groups
            }
        }

        // If we get here, no expectation group was fully satisfied
        await this.logger.error('All expectation groups failed', {
            actionType,
            groupsCount: expectations.length
        })
        return false
    }

    public async register (data: GetActionPayload<RegisterAction>): Promise<GetActionResponse<RegisterAction>> {
        const instanceId = `${this.scenarioId}-${Date.now()}`
        await this.logger.log('Executing register action', { data })
        const {
            username,
            password,
            sip_domain
        } = data

        await this.logger.log('Form elements found, filling form', { instanceId })
        this.usernameInput = this.page.locator('#loginToAppForm > label:nth-child(2) > input')
        this.passwordInput = this.page.locator('#loginToAppForm > label:nth-child(3) > input')
        this.domainInput = this.page.locator('#loginToAppForm > label:nth-child(5) > input')
        this.useAudioCheckbox = this.page.locator('#useAudioCheckbox')
        this.useVideoCheckbox = this.page.locator('#useVideoCheckbox')
        this.loginButton = this.page.locator('#loginToAppForm > button')

        await this.usernameInput.fill(username)
        await this.passwordInput.fill(password)
        await this.domainInput.fill(sip_domain)

        return new Promise(
            (resolve) => {
                this.pageWebSocketWorker.waitForSocket(sip_domain)
                    .then(async (ws) => {
                        await this.pageWebSocketWorker.waitForMessage(
                            ws,
                            {
                                method: 'REGISTER',
                                status_code: 200,
                                timeout: 10000
                            }
                        )

                        this.pageWebSocketWorker.setConnectedWebsocket(ws)
                        this.pageWebSocketWorker.setWebsocketListener(ws)

                        // Set scenario context for WebRTC metrics collection
                        await this.page.addInitScript(
                            ({ scenarioName, scenarioId }) => {
                                window.scenarioName = scenarioName
                                window.scenarioId = scenarioId
                            },
                            {
                                scenarioName: this.scenarioName,
                                scenarioId: this.scenarioId
                            }
                        )

                        await this.page.evaluate(WebRTCMetricsCollector.initializeMetricsAnalyze)

                        // Start WebRTC metrics collection from Node.js context
                        this.webrtcMetricsSender = new WebRTCMetricsSender(
                            this.page,
                            this.scenarioName,
                            this.scenarioId
                        )
                        this.webrtcMetricsSender.startPeriodicCollection()

                        await this.logger.log('Successfully registered and started WebRTC metrics collection')

                        resolve({
                            success: true,
                            instanceId: instanceId
                        })
                    })
                    .catch(err => {
                        resolve({
                            success: false,
                            error: err instanceof Error ? err.message : 'Error executing register action'
                        })
                    })

                this.loginButton.click()
            }
        )
    }

    public async dial (data: GetActionPayload<DialAction>): Promise<GetActionResponse<DialAction>> {
        await this.logger.log('Executing dial action', { data })
        this.yourTargetInput = this.page.locator('#makeCallForm input')
        this.callButton = this.page.locator('#makeCallForm button')
        await this.yourTargetInput.fill(String(data.target))
        await this.callButton.click()

        const callId = 'call-' + Math.floor(Math.random() * 10000)

        return {
            callId,
            target: data.target,
            success: true
        }
    }

    public async answer (): Promise<GetActionResponse<AnswerAction>> {
        await this.logger.log('Executing answer action')

        this.answerButton = this.page.locator(Selectors.roomListPage.answerButton)
        await this.answerButton.click()

        return {
            success: true,
            callId: 'call-' + Math.floor(Math.random() * 10000)
        }
    }

    public async wait (data: GetActionPayload<WaitAction>): Promise<GetActionResponse<WaitAction>> {
        await this.logger.log(`Waiting for ${data.time}ms`, { waitTime: data.time })

        await this.page.waitForTimeout(data.time)
        return {
            success: true
        }
    }

    public async hold (): Promise<GetActionResponse<HoldAction>> {
        await this.logger.log('Executing hold action')

        this.holdButton = this.page.locator('.holdAgent')

        await this.holdButton.click()

        return {
            success: true,
            callId: 'call-' + Math.floor(Math.random() * 10000)
        }
    }

    public async unhold (): Promise<GetActionResponse<UnholdAction>> {
        await this.logger.log('Executing unhold action')

        this.holdButton = this.page.locator('.holdAgent')
        await this.holdButton.click()

        return {
            success: true,
            callId: 'call-' + Math.floor(Math.random() * 10000)
        }
    }

    public async hangup (): Promise<GetActionResponse<HangupAction>> {
        await this.logger.log('Executing hangup action')
        //this.hangupButton = this.page.locator('#call-undefined > button:nth-child(4)')

        this.hangupButton = this.page.getByRole('button', { name: 'Hangup' })
        await this.hangupButton.click()

        return {
            success: true,
            callId: 'call-' + Math.floor(Math.random() * 10000)
        }
    }

    public async sendDTMF (data: GetActionPayload<SendDTMFAction>): Promise<GetActionResponse<SendDTMFAction>> {
        await this.logger.log('Executing send DTMF action', { dtmf: data.dtmf })

        this.DTMFInput = this.page.locator('#dtmfInput')
        this.DTMFSendButton = this.page.locator('#dtmfSendButton')
        await this.DTMFInput.fill(data.dtmf)
        await this.DTMFSendButton.click()

        return {
            dtmf: data.dtmf,
            callId: 'call-' + Math.floor(Math.random() * 10000),
            success: true,
        }
    }

    public async transfer (data: GetActionPayload<TransferAction>): Promise<GetActionResponse<TransferAction>> {
        await this.logger.log('Executing transfer action', { target: data.target })

        this.page.on('dialog', async dialog => {
            await this.logger.log(`Dialog message: ${dialog.message()}`, { target: data.target })
            expect(dialog.type()).toContain('prompt')
            expect(dialog.message()).toContain('Please enter target:')
            await dialog.accept(data.target).catch(e => this.logger.error('Error accepting dialog', { error: e instanceof Error ? e.message : String(e) }))
        })

        this.transferButton = this.page.getByRole('button', { name: 'Transfer' })
        await this.transferButton.click()
        this.logger.log('Transfer button clicked')

        return {
            callId: 'call-' + Math.floor(Math.random() * 10000),
            success: true,
            target: data.target
        }
    }

    public async DND (): Promise<GetActionResponse<DNDAction>> {
        await this.logger.log('Executing DND action')
        this.DNDCheckbox = this.page.locator(Selectors.audioCallsPage.DNDCheckbox)
        await this.DNDCheckbox.click()

        return {
            success: true
        }
    }

    public async unregister (): Promise<GetActionResponse<UnregisterAction>> {
        await this.logger.log('Executing unregister action')

        this.logoutButton = this.page.locator('#logoutButton')

        const metrics = await this.page.evaluate(WebRTCMetricsCollector.collectMetrics)

        // Send final WebRTC metrics before cleanup
        if (this.webrtcMetricsSender) {
            await this.webrtcMetricsSender.sendFinalMetrics()
        }

        // Clean up the WindowMethodsWorker
        if (this.windowMethodsWorker) {
            await this.windowMethodsWorker.cleanup()
        }

        // Clicking the logout button
        this.logoutButton.click()

        try {
            await this.pageWebSocketWorker.waitForMessage(
                this.pageWebSocketWorker.getConnectedWebsocket(),
                {
                    method: 'REGISTER',
                    timeout: 10000,
                    checkSentEvent: true
                }
            )
        } catch (error) {
            return {
                success: false,
                error: `Error unregister to ${this.scenarioId}`
            }
        }

        await this.logger.log('Logout button clicked')

        // Log metrics
        await this.logger.log('Call metrics collected', {
            setupTimeMs: metrics.setupTime,
            totalDurationMs: metrics.totalDuration,
            connectionSuccessful: metrics.connectionSuccessful,
            audioStats: metrics.audioMetrics
        })

        // Close browser and log after actually closing
        await this.page.close()
        await this.browser.close()
        await this.logger.log('Browser closed')

        return {
            success: true
        }
    }

    public async playSound (data: GetActionPayload<PlaySoundAction>): Promise<GetActionResponse<PlaySoundAction>> {
        const soundPath = data.sound
        await this.logger.log('Playing sound', { soundPath })

        try {
            let fullPath: string

            // Handle relative paths by resolving from sounds directory
            if (!path.isAbsolute(soundPath)) {
                fullPath = path.resolve(process.cwd(), soundPath)
            } else {
                fullPath = soundPath
            }

            const soundFileName = path.basename(fullPath)

            // Check if windowMethodsWorker is available and properly initialized
            if (!this.windowMethodsWorker) {
                throw new Error('WindowMethodsWorker is not available')
            }

            // Check if file exists
            try {
                await fs.access(fullPath)
            } catch (error) {
                throw new Error(`Sound file not found: ${fullPath}`)
            }

            // Read the file as a Buffer
            const fileData = await fs.readFile(fullPath)

            // Determine MIME type based on file extension
            const mimeTypes: Record<string, string> = {
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.ogg': 'audio/ogg',
                '.m4a': 'audio/mp4',
                '.webm': 'audio/webm',
                '.aac': 'audio/aac',
                '.flac': 'audio/flac'
            }
            const ext = path.extname(fullPath).toLowerCase()
            const mimeType = mimeTypes[ext] || 'audio/wav' // Default to wav for unknown types

            // Create a data URL
            const base64Data = fileData.toString('base64')
            const dataUrl = `data:${mimeType};base64,${base64Data}`

            await this.logger.log(`Playing audio file: ${soundFileName}`, {
                mimeType,
                fileSizeKB: Math.round(fileData.length / 1024)
            })

            // Use the WindowMethodsWorker to play the clip
            const startTime = Date.now()
            await this.windowMethodsWorker.playClip(dataUrl)
            const playDuration = Date.now() - startTime

            await this.logger.log(`Sound played successfully: ${soundFileName}`, {
                playDurationMs: playDuration
            })

            return {
                success: true,
                soundFile: soundFileName,
                duration: playDuration
            }
        } catch (error) {
            await this.logger.error('Error playing sound', {
                error: error instanceof Error ? error.message : String(error)
            })
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error playing sound'
            }
        }
    }

    public async request (data: GetActionPayload<RequestAction>): Promise<GetActionResponse<RequestAction>> {
        await this.logger.log('Executing request action', { url: data.url })

        try {
            const response = await this.page.request.fetch(
                data.url,
                data.options
            )

            const responseBody = await response.json()

            return {
                success: true,
                response: responseBody
            }
        } catch (error) {
            await this.logger.error('Error during request', {
                error: error instanceof Error ? error.message : String(error)
            })

            const message = error instanceof Error ? error.message : 'Unknown error'

            return {
                success: false,
                error: message
            }
        }
    }
}
