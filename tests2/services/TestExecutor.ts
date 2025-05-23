import { Browser, chromium, Page } from 'playwright'
import mustache from 'mustache'

import PageWebSocketWorker from './PageWebSocketWorker'
import EventBus from './EventBus'
import ActionsExecutor from './ActionsExecutor'
import WindowMethodsWorker from './WindowMethodsWorker'
import ScenarioManager from './ScenarioManager'
import { TelemetryService } from './TelemetryService'
import QrynLogger from './QrynLogger'

import { waitMs } from '../helpers'
import env from '../env'

import {
    ActionsResponseMap,
    GetActionDefinition,
    ActionType,
    ActionByActionType,
    GetActionPayload,
    BaseActionSuccessResponse,
    ActionResponse,
    isActionSuccess,
    isActionError
} from '../types/actions'
import { TestScenario } from '../types/intex'
import { EventListener, EventListenerData, EventType } from '../types/events'

const SCENARIO_THAT_TRIGGERED_EVENT_KEY = 'SCENARIO_THAT_TRIGGERED_EVENT_KEY' as const

export default class TestExecutor {
    private pageWebSocketWorker!: PageWebSocketWorker
    private actionsExecutor!: ActionsExecutor
    private windowMethodsWorker!: WindowMethodsWorker
    private readonly telemetryService: TelemetryService
    private readonly logger: QrynLogger

    private readonly eventBus = EventBus.getInstance()
    private scenarioCompleted = false // Add completion flag

    public page!: Page
    public browser!: Browser

    constructor (
        private readonly scenarioId: string,
        private readonly scenarioName: string,
        private readonly scenarioManager: ScenarioManager
    ) {
        this.telemetryService = new TelemetryService(scenarioId, scenarioName)
        this.logger = new QrynLogger('TestExecutor', scenarioName, scenarioId)
    }

    private addEventListener<E extends EventType> (
        eventName: E,
        listener: EventListener<E>
    ): void {
        const wrappedListener: EventListener<E> = (name, data): void => {
            if (name === eventName) {
                listener(name, data)
            }
        }

        this.eventBus.addEventListener<E>(eventName, wrappedListener)
    }

    private async triggerLocalEventListener<E extends EventType> (
        eventName: E,
        data: EventListenerData<E>
    ): Promise<void> {
        await this.eventBus.triggerEvent(eventName, {
            ...data,
            [SCENARIO_THAT_TRIGGERED_EVENT_KEY]: this.scenarioId,
        })
    }

    private async triggerSharedEventListener<E extends EventType> (
        eventName: E | string,
        data: EventListenerData<E>
    ): Promise<void> {
        await this.logger.log(`Triggering shared event: ${eventName}`, { eventName })
        await this.eventBus.triggerEvent(eventName, data)
    }

    private shouldReactToEvent <E extends keyof ActionsResponseMap> (eventData: ActionsResponseMap[E]): boolean {
        return (
            !(SCENARIO_THAT_TRIGGERED_EVENT_KEY in eventData) ||
            eventData[SCENARIO_THAT_TRIGGERED_EVENT_KEY] === this.scenarioId
        )
    }

    private buildPayload <T extends ActionType, Payload extends GetActionPayload<ActionByActionType<T>>> (
        actionType: T,
        action: GetActionDefinition<ActionByActionType<T>>,
    ): Payload {
        let payload = action.data.payload
        const context = this.scenarioManager.getContext()

        if (payload && typeof payload === 'object') {
            try {
                payload = JSON.parse(
                    mustache.render(
                        JSON.stringify(payload),
                        context
                    )
                )
            } catch (e) {
                this.logger.error('Error rendering payload', { error: e instanceof Error ? e.message : String(e) })
            }
        }

        return payload as Payload
    }

    private async executeAction<T extends ActionType> (
        action: GetActionDefinition<ActionByActionType<T>>,
    ): Promise<void> {
        await this.logger.log(`Executing action: ${action.type}`, { actionType: action.type })

        // Start telemetry tracking for this action
        await this.telemetryService.logTriggered(action.type, {
            actionData: JSON.stringify(action.data)
        })

        if (action.data && action.data.waitUntil && action.data.waitUntil.event) {
            await this.logger.log(`Waiting for event: ${action.data.waitUntil.event}`, {
                waitingForEvent: action.data.waitUntil.event,
                timeout: action.data.waitUntil.timeout || 30000
            })

            try {
                // Wait for the event globally (not just scenario-specific)
                await this.eventBus.waitForEvent(
                    action.data.waitUntil.event,
                    (_, data) => this.shouldReactToEvent(data),
                    action.data.waitUntil.timeout || 30000 // Default 30 second timeout
                )
                await this.logger.log(`Event received: ${action.data.waitUntil.event}`, {
                    receivedEvent: action.data.waitUntil.event
                })
            } catch (error) {
                await this.logger.error('Error waiting for event', {
                    error: error instanceof Error ? error.message : String(error),
                    waitingForEvent: action.data.waitUntil.event
                })
                await this.telemetryService.logError(action.type, error, {
                    phase: 'waitUntil',
                    waitingFor: action.data.waitUntil.event
                })
                throw error
            }
        }

        const triggerCustom = (result: ActionResponse<BaseActionSuccessResponse>) => {
            if (action.data && action.data.customSharedEvent && isActionSuccess(result)) {
                const sharedData = {
                    ...result,
                    originScenario: this.scenarioId,
                    actionType: action.type
                }
                setTimeout(() => {
                    this.triggerSharedEventListener(action.data.customSharedEvent!, sharedData)
                }, 0)
            }
        }

        const onResult = (result: ActionResponse<BaseActionSuccessResponse>) => {
            if (isActionError(result)) {
                this.logger.error('Action failed', {
                    actionType: action.type,
                    error: result.error
                })
                throw new Error(result.error)
            }

            if (action.data && 'responseToContext' in action.data &&
                action.data.responseToContext?.setToContext &&
                action.data.responseToContext.contextKeyToSet) {
                this.scenarioManager.updateContext({
                    [action.data.responseToContext.contextKeyToSet]: result
                })
                this.logger.log('Context updated', {
                    contextKey: action.data.responseToContext.contextKeyToSet,
                    newContext: this.scenarioManager.getContext()
                })
            }
        }

        try {
            const actionType = action.type
            let result: ActionResponse<BaseActionSuccessResponse>

            // Execute the action with proper type safety
            switch (actionType) {
                case 'register':
                    result = await this.actionsExecutor.register(this.buildPayload('register', action))
                    break
                case 'dial':
                    result = await this.actionsExecutor.dial(this.buildPayload('dial', action))
                    break
                case 'answer':
                    result = await this.actionsExecutor.answer()
                    break
                case 'wait':
                    result = await this.actionsExecutor.wait(this.buildPayload('wait', action))
                    break
                case 'hold':
                    result = await this.actionsExecutor.hold()
                    break
                case 'unhold':
                    result = await this.actionsExecutor.unhold()
                    break
                case 'hangup':
                    result = await this.actionsExecutor.hangup()
                    break
                case 'playSound':
                    result = await this.actionsExecutor.playSound(this.buildPayload('playSound', action))
                    break
                case 'sendDTMF':
                    result = await this.actionsExecutor.sendDTMF(this.buildPayload('sendDTMF', action))
                    break
                case 'transfer':
                    result = await this.actionsExecutor.transfer(this.buildPayload('transfer', action))
                    break
                case 'unregister':
                    result = await this.actionsExecutor.unregister()
                    break
                case 'request':
                    result = await this.actionsExecutor.request(this.buildPayload('request', action))
                    break
                default:
                    // TypeScript will ensure this case never happens
                    throw new Error(`Unknown action type: ${actionType}`)
            }

            // Handle result consistently for all actions
            onResult(result)

            // Always trigger local event listener for actions that have corresponding events
            const actionsWithoutEvents: Array<ActionType> = [ 'wait' ]

            if (!actionsWithoutEvents.includes(actionType)) {
                await this.triggerLocalEventListener(actionType, result)
            }

            // Always trigger custom events if specified
            triggerCustom(result)

            // Log successful completion with result details
            await this.telemetryService.logCompleted(action.type, {
                success: result.success.toString(),
                resultType: typeof result,
                hasCustomEvent: !!action.data?.customSharedEvent
            })

        } catch (error) {
            await this.logger.error('Error executing action', {
                actionType: action.type,
                error: error instanceof Error ? error.message : String(error)
            })

            // Log the error with detailed context
            await this.telemetryService.logError(action.type, error, {
                phase: 'execution',
                actionData: JSON.stringify(action.data),
                errorMessage: error instanceof Error ? error.message : String(error)
            })

            throw error
        }
    }

    private async start (): Promise<void> {
        // Log scenario start
        await this.telemetryService.logTriggered('scenario_start')

        try {
            this.browser = await chromium.launch({
                headless: false,
                args: [
                    '--use-fake-ui-for-media-stream',
                    '--use-fake-device-for-media-stream',
                    '--allow-file-access',
                    '--autoplay-policy=no-user-gesture-required',
                    '--disable-web-security',
                    '--allow-running-insecure-content'
                ],
            })

            const context = await this.browser.newContext({
                permissions: [ 'microphone', 'camera' ]
            })
            this.page = await context.newPage()

            // Pass telemetry service to PageWebSocketWorker
            this.pageWebSocketWorker = new PageWebSocketWorker(
                this.page,
                {
                    INVITE: 'incoming',
                    ACK: 'callConfirmed',
                    CANCEL: 'callCancelled',
                    BYE: 'callEnded',
                    UPDATE: 'callUpdated',
                    MESSAGE: 'messageReceived',
                    OPTIONS: 'optionsReceived',
                    REFER: 'callReferred',
                    INFO: 'infoReceived',
                    NOTIFY: 'notificationReceived',
                },
                this.triggerLocalEventListener.bind(this),
                this.telemetryService // Pass telemetry service
            )

            this.windowMethodsWorker = new WindowMethodsWorker(this.page)
            await this.windowMethodsWorker.implementPlayClipMethod()

            this.actionsExecutor = new ActionsExecutor(
                this.scenarioId,
                this.scenarioName,
                this.pageWebSocketWorker,
                this.windowMethodsWorker,
                this.page,
                this.browser
            )

            await this.page.goto(`http://localhost:${env.APPLICATION_PORT}`)
            await waitMs(100)

            // Log successful scenario start
            await this.telemetryService.logCompleted('scenario_start')

            await this.triggerLocalEventListener('ready', { timestamp: Date.now() })
        } catch (error) {
            await this.telemetryService.logError('scenario_start', error)
            throw error
        }
    }

    public async executeScenario (scenario: TestScenario): Promise<void> {
        await this.logger.log('Executing scenario', {
            scenarioName: scenario.name,
            actionsCount: scenario.actions.length
        })

        try {
            const eventCounter: Record<string, number> = {} // Changed to string to allow custom events
            const eventHandlers: Record<string, GetActionDefinition<ActionByActionType<keyof ActionsResponseMap>>[][]> = {}

            // Initialize all event handlers
            for (const { event, actions } of scenario.actions) {
                if (!eventHandlers[event]) {
                    eventHandlers[event] = []
                    eventCounter[event] = 0
                }
                eventHandlers[event].push(actions)
            }

            await this.logger.log('Event handlers initialized', {
                eventTypes: Object.keys(eventHandlers),
                totalHandlers: Object.values(eventHandlers).reduce((sum, handlers) => sum + handlers.length, 0)
            })

            // Set up event listeners for all events (including custom ones)
            for (const eventName in eventHandlers) {
                const handlers = eventHandlers[eventName]

                this.addEventListener(eventName, async (_, eventData) => {
                    // For custom events, don't check scenario restriction
                    if (!eventName.startsWith('ready') &&
                        !eventName.startsWith('register') &&
                        !eventName.startsWith('dial') &&
                        !eventName.startsWith('answer') &&
                        !eventName.startsWith('incoming') &&
                        !eventName.startsWith('hangup')) {
                        // This is a custom event, don't restrict to scenario
                    } else if (!this.shouldReactToEvent(eventData)) {
                        return
                    }

                    const currentIndex = eventCounter[eventName]
                    const actions = handlers[currentIndex]

                    if (actions) {
                        eventCounter[eventName]++

                        // Log event handling
                        await this.telemetryService.logEvent(`event_${eventName}`, 'success', {
                            stage: 'triggered',
                            eventIndex: currentIndex.toString(),
                            actionsCount: actions.length.toString()
                        })

                        for (const action of actions) {
                            await this.executeAction(action)
                        }

                        await this.telemetryService.logEvent(`event_${eventName}`, 'success', {
                            stage: 'completed',
                            eventIndex: currentIndex.toString(),
                            actionsCount: actions.length.toString()
                        })
                    }
                })
            }

            await this.start()

            // Keep the scenario alive until it's explicitly completed
            // Don't cleanup immediately
            await this.logger.log('Scenario setup complete, waiting for events...')

        } catch (error) {
            await this.telemetryService.logError('scenario_execution', error)
            this.scenarioCompleted = true
            throw error
        } finally {
            // Only cleanup if scenario is actually completed
            if (this.scenarioCompleted) {
                this.telemetryService.cleanup()
            }
        }
    }

    // Add method to manually complete scenario
    public completeScenario (): void {
        this.scenarioCompleted = true
        this.telemetryService.cleanup()
    }
}
