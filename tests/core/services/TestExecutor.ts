import mustache from 'mustache'

import SharedEventCoordinator from './SharedEventCoordinator'
import ScenarioManager from './ScenarioManager'
import { TelemetryService } from './TelemetryService'
import CallSession from '../session/CallSession'
import { getDefaultExpectations } from '../session/defaultExpectations'
import { isSessionLocalEvent } from '../session/sessionEvents'

import {
    ActionsResponseMap,
    GetActionDefinition,
    ActionType,
    ActionByActionType,
    GetActionPayload,
    BaseActionSuccessResponse,
    ActionResponse,
    isActionSuccess,
    isActionError,
} from '../types/actions'
import { TestScenario } from '../types/intex'
import { EventListener, EventListenerData, EventType } from '../types/events'
import QrynClient from './QrynClient'
import { SpeechProvider } from './speech/BaseSpeechProvider'
import { parseDeclarativePayload } from '../schema/actionPayloads.schema'

// Events whose handler is reused for every emission instead of consumed once.
const REPEATABLE_EVENTS: ReadonlySet<string> = new Set([ 'textChunk' ])

type EventHandlerGroups = Record<
    string,
    ReadonlyArray<GetActionDefinition<ActionByActionType<keyof ActionsResponseMap>>>[]
>

export default class TestExecutor {
    private callSession: CallSession | null = null
    private readonly telemetryService: TelemetryService
    private qrynClient: QrynClient

    private readonly sharedEvents: SharedEventCoordinator
    private scenarioCompleted = false

    private resolveCompletion: () => void = () => { /* replaced by the promise executor below */ }
    private readonly completionPromise: Promise<void> = new Promise<void>((resolve) => {
        this.resolveCompletion = resolve
    })

    constructor (
        private readonly scenarioId: string,
        private readonly scenarioName: string,
        private readonly scenarioManager: ScenarioManager,
        sharedEvents: SharedEventCoordinator,
        private readonly speechProvider?: SpeechProvider
    ) {
        this.sharedEvents = sharedEvents
        this.telemetryService = new TelemetryService(scenarioId, scenarioName)
        this.qrynClient = new QrynClient('TestExecutor', scenarioName, scenarioId)
    }

    private addSharedEventListener<E extends EventType> (
        eventName: E,
        listener: EventListener<E>
    ): void {
        const wrappedListener: EventListener<E> = (name, data): void => {
            if (name === eventName) {
                listener(name, data)
            }
        }

        this.sharedEvents.addEventListener<E>(eventName, wrappedListener)
    }

    private async triggerSharedEventListener<E extends EventType> (
        eventName: E | string,
        data: EventListenerData<E>
    ): Promise<void> {
        await this.qrynClient.log(`Triggering shared event: ${eventName}`, { eventName })
        await this.sharedEvents.triggerEvent<any>(eventName, data)
    }

    private buildPayload <T extends ActionType> (
        actionType: T,
        action: GetActionDefinition<ActionByActionType<T>>,
    ): NonNullable<GetActionPayload<ActionByActionType<T>>> {
        let payload: unknown = action.data?.payload
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
                // A failed render must fail the action — validating the
                // unrendered payload would let literal "{{var}}" strings pass.
                const message = e instanceof Error ? e.message : String(e)
                void this.qrynClient.error('Error rendering payload', { error: message })
                throw new Error(`Failed to render payload template for action "${actionType}": ${message}`)
            }
        }

        try {
            return parseDeclarativePayload(actionType, payload)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`Invalid payload for action "${actionType}" after mustache render: ${message}`)
        }
    }

    private createEventHandler (
        eventName: string,
        eventHandlers: EventHandlerGroups,
        eventCounter: Record<string, number>
    ): (eventData: unknown) => Promise<void> {
        return async (eventData: unknown) => {
            const isRepeatable = REPEATABLE_EVENTS.has(eventName)
            const currentIndex = isRepeatable ? 0 : eventCounter[eventName]
            const actions = eventHandlers[eventName][currentIndex]

            if (!actions) {
                return
            }

            if (!isRepeatable) {
                eventCounter[eventName]++
            }

            const eventSpan = this.telemetryService.startEventSpan(eventName, eventData)

            try {
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

                this.telemetryService.finishEventSpan(eventSpan, true, undefined, actions.length)
            } catch (error) {
                await this.qrynClient.error('Error handling event', {
                    eventName,
                    error: error instanceof Error ? error.message : String(error)
                })

                this.telemetryService.finishEventSpan(eventSpan, false, error, actions.length)
                throw error
            }
        }
    }

    private getCallSession (): CallSession {
        if (!this.callSession) {
            throw new Error('CallSession is not initialized')
        }

        return this.callSession
    }

    private async executeAction<T extends ActionType> (
        action: GetActionDefinition<ActionByActionType<T>>,
    ): Promise<void> {
        const session = this.getCallSession()

        await this.qrynClient.log(`Executing action: ${action.type}`, { actionType: action.type })

        await this.telemetryService.logTriggered(action.type, {
            actionData: JSON.stringify(action.data)
        })

        if (action.data && action.data.waitUntil && action.data.waitUntil.length) {
            const waitingForEventsNames = action.data.waitUntil.map(e => e.event).join(', ')

            await this.qrynClient.log(
                `Waiting for events: ${waitingForEventsNames}`,
                {
                    events: action.data.waitUntil.map(e => ({
                        waitingForEvent: e.event,
                        timeout: e.timeout || 30000
                    }))
                }
            )

            try {
                const eventPromises = action.data.waitUntil.map(waitConfig => {
                    const eventName = String(waitConfig.event)
                    const timeout = waitConfig.timeout || 30000

                    if (isSessionLocalEvent(eventName)) {
                        return session.waitFor(eventName, timeout)
                    }

                    return this.sharedEvents.waitForEvent(
                        waitConfig.event,
                        () => true,
                        timeout
                    )
                })

                const results = await Promise.all(eventPromises)

                await this.qrynClient.log(`All events received: ${waitingForEventsNames}`, {
                    receivedEvents: action.data.waitUntil.map(e => e.event),
                    resultsCount: results.length
                })
            } catch (error) {
                await this.qrynClient.error('Error waiting for events', {
                    error: error instanceof Error ? error.message : String(error),
                    waitingForEvents: action.data.waitUntil.map(e => e.event)
                })
                await this.telemetryService.logError(action.type, error, {
                    phase: 'waitUntil',
                    waitingFor: waitingForEventsNames
                })
                throw error
            }
        }

        const triggerCustom = (result: ActionResponse<BaseActionSuccessResponse>) => {
            const customSharedEvent = action.data?.customSharedEvent

            if (customSharedEvent && isActionSuccess(result)) {
                const sharedData = {
                    ...result,
                    originScenario: this.scenarioId,
                    actionType: action.type
                }
                setTimeout(() => {
                    void this.triggerSharedEventListener(customSharedEvent, sharedData)
                }, 0)
            }
        }

        const onResult = (result: ActionResponse<BaseActionSuccessResponse>) => {
            if (isActionError(result)) {
                this.qrynClient.error('Action failed', {
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

                this.qrynClient.log('Context updated', {
                    contextKey: action.data.responseToContext.contextKeyToSet,
                    newContext: this.scenarioManager.getContext()
                })
            }
        }

        const actionSpan = this.telemetryService.startActionSpan(action.type, action.data)

        try {
            const actionType = action.type
            let result: ActionResponse<BaseActionSuccessResponse>

            switch (actionType) {
                case 'register':
                    result = await session.registerRaw(this.buildPayload('register', action))
                    break
                case 'dial':
                    result = await session.dialRaw(this.buildPayload('dial', action).target)
                    break
                case 'answer':
                    result = await session.answerRaw()
                    break
                case 'wait':
                    result = await session.waitRaw(this.buildPayload('wait', action).time)
                    break
                case 'hold':
                    result = await session.holdRaw()
                    break
                case 'unhold':
                    result = await session.unholdRaw()
                    break
                case 'hangup':
                    result = await session.hangupRaw()
                    break
                case 'playSound':
                    result = await session.playSoundRaw(this.buildPayload('playSound', action).sound)
                    break
                case 'sendDTMF':
                    result = await session.sendDTMFRaw(this.buildPayload('sendDTMF', action).dtmf)
                    break
                case 'transfer':
                    result = await session.transferRaw(this.buildPayload('transfer', action).target)
                    break
                case 'changeRoom': {
                    const payload = this.buildPayload('changeRoom', action)
                    result = await session.changeRoomRaw(payload.fromRoom, payload.toRoom)
                    break
                }
                case 'DND':
                    result = await session.dndRaw()
                    break
                case 'unregister':
                    result = await session.unregisterRaw()
                    break
                case 'request':
                    result = await session.requestRaw(this.buildPayload('request', action))
                    break
                case 'textToSpeech':
                    result = await session.textToSpeechRaw(this.buildPayload('textToSpeech', action).text)
                    break
                case 'startTranscription':
                    result = await session.startTranscriptionRaw()
                    break
                case 'stopTranscription':
                    result = await session.stopTranscriptionRaw()
                    break
                default:
                    throw new Error(`Unknown action type: ${actionType}`)
            }

            onResult(result)

            let expectationsToCheck = action.data?.expect

            if (!expectationsToCheck || expectationsToCheck.length === 0) {
                expectationsToCheck = getDefaultExpectations(actionType)
            }

            if (expectationsToCheck && expectationsToCheck.length > 0) {
                const expectationsResult = await session.checkExpectations(
                    expectationsToCheck,
                    result,
                    actionType
                )

                if (!expectationsResult) {
                    const error = new Error(`Expectations failed for action ${actionType}`)
                    await this.qrynClient.error('Expectations failed', {
                        actionType,
                        expectations: JSON.stringify(expectationsToCheck)
                    })

                    await this.telemetryService.logError(action.type, error, {
                        phase: 'expectations',
                        actionData: JSON.stringify(action.data),
                        errorMessage: error.message
                    })

                    this.telemetryService.finishActionSpan(actionSpan, false, error)
                    throw error
                }

                await this.qrynClient.log('Expectations passed', {
                    actionType,
                    expectationGroups: expectationsToCheck.length,
                    isDefaultExpectation: !action.data?.expect
                })
            }

            const actionsWithoutEvents: Array<ActionType> = [ 'wait' ]

            if (!actionsWithoutEvents.includes(actionType)) {
                session.emit(actionType, result)
            }

            triggerCustom(result)

            await this.telemetryService.logCompleted(action.type, {
                success: result.success.toString(),
                resultType: typeof result,
                hasCustomEvent: !!action.data?.customSharedEvent
            })

            this.telemetryService.finishActionSpan(actionSpan, true, undefined, result)
        } catch (error) {
            await this.qrynClient.error('Error executing action', {
                actionType: action.type,
                error: error instanceof Error ? error.message : String(error)
            })

            await this.telemetryService.logError(action.type, error, {
                phase: 'execution',
                actionData: JSON.stringify(action.data),
                errorMessage: error instanceof Error ? error.message : String(error)
            })

            this.telemetryService.finishActionSpan(actionSpan, false, error)
            throw error
        }
    }

    private async start (
        sessionEventHandlers: EventHandlerGroups,
        eventCounter: Record<string, number>
    ): Promise<void> {
        await this.telemetryService.logTriggered('scenario_start')

        try {
            const callSession = await CallSession.create({
                scenarioId: this.scenarioId,
                scenarioName: this.scenarioName,
                speechProvider: this.speechProvider,
                telemetryService: this.telemetryService,
                skipReadyEmit: true,
                onPageClose: () => {
                    void this.markCompleted()
                },
            })
            this.callSession = callSession

            for (const eventName in sessionEventHandlers) {
                const handler = this.createEventHandler(eventName, sessionEventHandlers, eventCounter)
                callSession.on(eventName, (eventData) => {
                    void handler(eventData)
                })
            }

            if (this.speechProvider) {
                this.speechProvider.onTranscript((text, isFinal) => {
                    const chunk = {
                        text,
                        isFinal: Boolean(isFinal),
                        timestamp: Date.now() 
                    }
                    if (isFinal) {
                        const previousTranscript = (this.scenarioManager.getContext().transcript as string | undefined) ?? ''
                        this.scenarioManager.updateContext({ transcript: (previousTranscript + text).trim() })
                    }
                    this.scenarioManager.updateContext({ textChunk: chunk })
                    void this.triggerSharedEventListener('textChunk', chunk as EventListenerData<'textChunk'>)
                })
            }

            await this.telemetryService.logCompleted('scenario_start')
            callSession.emitReady()
        } catch (error) {
            await this.telemetryService.logError('scenario_start', error)
            throw error
        }
    }

    public async executeScenario (scenario: TestScenario): Promise<void> {
        await this.qrynClient.log('Executing scenario', {
            scenarioName: scenario.name,
            actionsCount: scenario.actions.length
        })

        try {
            const eventCounter: Record<string, number> = {}
            const sessionEventHandlers: EventHandlerGroups = {}
            const allEventHandlers: EventHandlerGroups = {}

            for (const { event, actions } of scenario.actions) {
                if (!allEventHandlers[event]) {
                    allEventHandlers[event] = []
                    eventCounter[event] = 0
                }
                allEventHandlers[event].push(actions)

                if (isSessionLocalEvent(event)) {
                    sessionEventHandlers[event] = allEventHandlers[event]
                }
            }

            for (const eventName in allEventHandlers) {
                if (!isSessionLocalEvent(eventName)) {
                    const handler = this.createEventHandler(eventName, allEventHandlers, eventCounter)
                    this.addSharedEventListener(eventName, (_, eventData) => {
                        void handler(eventData)
                    })
                }
            }

            await this.qrynClient.log('Event handlers initialized', {
                eventTypes: Object.keys(allEventHandlers),
                sessionEvents: Object.keys(sessionEventHandlers),
                sharedEvents: Object.keys(allEventHandlers).filter(e => !isSessionLocalEvent(e)),
                totalHandlers: Object.values(allEventHandlers).reduce((sum, handlers) => sum + handlers.length, 0)
            })

            await this.start(sessionEventHandlers, eventCounter)

            await this.qrynClient.log('Scenario setup complete, waiting for completion...')
            await this.completionPromise
        } catch (error) {
            await this.telemetryService.logError('scenario_execution', error)
            this.markCompleted()
            throw error
        } finally {
            this.markCompleted()
        }
    }

    public completeScenario (): void {
        this.markCompleted()
    }

    private markCompleted (): void {
        if (this.scenarioCompleted) {
            return
        }

        this.scenarioCompleted = true

        const session = this.callSession
        this.callSession = null

        if (session) {
            void session.dispose().catch((error) => {
                void this.qrynClient.warn('CallSession dispose failed during scenario completion', {
                    error: error instanceof Error ? error.message : String(error),
                })
            })
        }

        this.resolveCompletion()
        this.telemetryService.cleanup()
    }
}
