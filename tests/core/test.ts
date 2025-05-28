// Base types for action data
import { Browser, chromium, Locator, Page } from 'playwright'
import { getPageWebSocket, monitorSocketEvents } from './webSocket'
import { WebRTCMetricsService } from './services/webrtc-metrics.service'
const path = require('path')
const audioPathSara = path.resolve(__dirname, './../fixtures/sara.wav')
const audioPathAlex = path.resolve(__dirname, './../fixtures/alex.wav')

interface RegisterData {
    sip_domain: string
    username: string
    password: string
}

interface DialData {
    target: number
}

interface WaitData {
    time: number // Milliseconds
}

interface PlaySoundData {
    sound: string
}

// Event data types - what data each event provides
interface RegisterEventData {
    success: boolean
    username: string
    password: string
    domain: string
}

interface DialEventData {
    callId: string
    target: number
    success: boolean
}

interface AnswerEventData {
    answered: boolean
    callId: string
}

interface HoldEventData {
    onHold: boolean
    callId: string
}

interface UnholdEventData {
    onHold: boolean
    callId: string
}

interface HangupEventData {
    hungUp: boolean
    callId: string
}

interface UnregisterEventData {
    unregistered: boolean
}

interface PlaySoundEventData {
    played: boolean
    sound: string
}

interface IncomingEventData {
    callerId: string
    callerName?: string
    callId: string
}
interface SendDTMFEventData {
    dtmf: string
    callId: string
    success: boolean,
}
interface TransferEventData {
    callId: string
    target: number
    success: boolean
}

interface ReadyEventData {
    timestamp: number
}

// Custom shared event data
interface CustomSharedEventData<T = any> {
    originScenario: string
    actionType: string
    result: T
}

// Map events to their data types
interface EventDataTypes {
    register: RegisterEventData
    dial: DialEventData
    answer: AnswerEventData
    ready: ReadyEventData
    incoming: IncomingEventData
    hangup: HangupEventData
    hold: HoldEventData
    unhold: UnholdEventData
    unregister: UnregisterEventData
    play_sound: PlaySoundEventData
    [customEvent: string]: any // For custom events
}

// Common action properties with typed filter
interface ActionProps<E extends keyof EventDataTypes = any> {
    waitUntil?: {
        event: string
        timeout?: number
    }
    customSharedEvent?: string
    timeout?: number
    // Typed filter function based on the event type
    filter?: (eventData: E extends keyof EventDataTypes ? EventDataTypes[E] | CustomSharedEventData<EventDataTypes[E]> : any) => boolean
}

// Define available events and the actions they allow
type EventMap = {
    register: ['dial', 'wait']
    dial: never[]
    answer: ['hold', 'unhold', 'wait', 'play_sound', 'hangup']
    ready: ['register', 'wait']
    incoming: ['answer', 'wait']
    hangup: ['unregister']
    [customEvent: string]: string[] // Custom events
}

// Define action return types with proper structure
interface RegisterAction extends ActionProps<'register'> {
    type: 'register'
    data: RegisterData
}

interface DialAction extends ActionProps<'dial'> {
    type: 'dial'
    data: DialData
}

interface WaitAction extends ActionProps {
    type: 'wait'
    data: WaitData
}

interface PlaySoundAction extends ActionProps<'play_sound'> {
    type: 'play_sound'
    data: PlaySoundData
}

interface AnswerAction extends ActionProps<'answer'> {
    type: 'answer'
    data?: undefined
}

interface HoldAction extends ActionProps<'hold'> {
    type: 'hold'
    data?: undefined
}

interface UnholdAction extends ActionProps<'unhold'> {
    type: 'unhold'
    data?: undefined
}

interface HangupAction extends ActionProps<'hangup'> {
    type: 'hangup'
    data?: undefined
}

interface SendDTMFAction extends ActionProps<'send_dtmf'> {
    type: 'send_dtmf'
    data: SendDTMFEventData
}

interface TransferAction extends ActionProps<'transfer'> {
    type: 'transfer'
    data: TransferEventData
}

interface UnregisterAction extends ActionProps<'unregister'> {
    type: 'unregister'
    data?: undefined
}

// Union type for all possible actions
type Action =
    | RegisterAction
    | DialAction
    | WaitAction
    | PlaySoundAction
    | AnswerAction
    | HoldAction
    | UnholdAction
    | HangupAction
    | UnregisterAction;

// Type for specific event handler
type EventHandler<E extends keyof EventMap> =
    EventMap[E] extends never[]
        ? never
        : Array<
            | (E extends 'ready' ? RegisterAction | WaitAction : never)
            | (E extends 'register' ? DialAction | WaitAction : never)
            | (E extends 'answer' ? HoldAction | UnholdAction | WaitAction | PlaySoundAction | HangupAction : never)
            | (E extends 'incoming' ? AnswerAction | WaitAction : never)
            | (E extends 'hangup' ? UnregisterAction : never)
            | (E extends string ? Action : never)
        >

// Type for a test scenario (multiple event handlers)
type TestScenario = {
    [E in keyof EventMap]?: EventHandler<E>
}

// Type for a collection of test scenarios
type TestScenarios = TestScenario[]

// Type for event listeners
type EventListener = (eventName: string, data?: any) => void;

/**
 * Global event bus to handle shared events across scenarios
 */
class EventBus {
    private static instance: EventBus
    private eventListeners: Map<string, EventListener[]> = new Map()

    private constructor () {}

    public static getInstance (): EventBus {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus()
        }
        return EventBus.instance
    }

    // Register an event listener
    public addEventListener (eventName: string, listener: EventListener): void {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, [])
        }
        this.eventListeners.get(eventName)!.push(listener)
    }

    // Remove an event listener
    public removeEventListener (eventName: string, listener: EventListener): void {
        if (this.eventListeners.has(eventName)) {
            const listeners = this.eventListeners.get(eventName)!
            const index = listeners.indexOf(listener)
            if (index !== -1) {
                listeners.splice(index, 1)
            }
        }
    }

    // Trigger an event
    public triggerEvent<E extends keyof EventDataTypes>(eventName: E, data?: EventDataTypes[E]): void;

    public triggerEvent (eventName: string, data?: EventDataTypes): void {
        console.log(`[EventBus] Event triggered: ${eventName}`, data)

        // First trigger specific event listeners
        const listeners = this.eventListeners.get(eventName) || []
        for (const listener of listeners) {
            listener(eventName, data)
        }

        // Then trigger wildcard listeners
        const wildcardListeners = this.eventListeners.get('*') || []
        for (const listener of wildcardListeners) {
            listener(eventName, data)
        }
    }

    // Utility to wait for an event
    public waitForEvent<E extends keyof EventDataTypes>(eventName: E, additionalCheck: (eventName: string, data: object) => boolean, timeout?: number): Promise<EventDataTypes[E]>;
    public waitForEvent (eventName: string, additionalCheck: (eventName: string, data: object) => boolean, timeout?: number): Promise<any> {
        return new Promise((resolve, reject) => {
            const listener = (name: string, data: any) => {
                console.log(`Triggered listener for waiting event: ${eventName}, name === eventName: ${name === eventName}, additionalCheck(name, data): ${additionalCheck(name, data)}`)

                if (name === eventName && additionalCheck(name, data)) {
                    this.removeEventListener(eventName, listener)
                    resolve(data)
                }
            }

            this.addEventListener(eventName, listener)

            if (timeout) {
                setTimeout(() => {
                    this.removeEventListener(eventName, listener)
                    reject(new Error(`Timeout waiting for event ${eventName}`))
                }, timeout)
            }
        })
    }
}

const SCENARIO_THAT_TRIGGERED_EVENT_KEY = 'SCENARIO_THAT_TRIGGERED_EVENT_KEY'

/**
 * TestExecutor - Handles the execution of test actions
 */
class TestExecutor {
    private eventBus: EventBus
    private scenarioId: string
    public page: Page
    public browser: Browser

    private usernameInput: Locator
    private passwordInput: Locator
    private domainInput: Locator
    private loginButton: Locator
    private useAudioCheckbox: Locator
    private useVideoCheckbox: Locator
    private holdButton: Locator

    private yourTargetInput: Locator
    private callButton: Locator
    private answerButton: Locator
    private logoutButton: Locator
    private hangupButton: Locator
    private context: null
    private DTMFSendButton: Locator
    private DTMFInput:  Locator
    private transferButton: Locator

    constructor (scenarioId: string) {
        this.eventBus = EventBus.getInstance()
        this.scenarioId = scenarioId
    }

    // Register an event listener
    private addEventListener (eventName: string, listener: EventListener): void {
        this.eventBus.addEventListener(eventName, listener)
    }

    private triggerLocalEventListener (eventName: string, data: object): void {
        this.eventBus.triggerEvent(eventName, {
            ...data,
            SCENARIO_THAT_TRIGGERED_EVENT_KEY: this.scenarioId
        })
    }

    private triggerSharedEventListener (eventName: string, data: object): void {
        this.eventBus.triggerEvent(eventName, data)
    }

    private shouldReactToEvent (eventData: object) {
        return !(SCENARIO_THAT_TRIGGERED_EVENT_KEY in eventData) || eventData[SCENARIO_THAT_TRIGGERED_EVENT_KEY] === this.scenarioId
    }
    // Execute a single action
    private async executeAction<E extends keyof EventDataTypes> (
        action: Action,
        eventName: E,
        eventData?: EventDataTypes[E] | CustomSharedEventData<any>
    ): Promise<void> {
        console.log(`[Scenario ${this.scenarioId}] Executing action: ${action.type}`, action)

        // Check if there's a filter function and if it passes
        if (action.filter && eventData) {
            const shouldExecute = action.filter(eventData)
            if (!shouldExecute) {
                console.log(`[Scenario ${this.scenarioId}] Action skipped due to filter condition: ${action.type}`)
                return // Skip this action if filter condition is not met
            }
        }

        // Wait for a specific event if waitUntil is specified
        if (action.waitUntil) {
            console.log(`[Scenario ${this.scenarioId}] Waiting for event: ${action.waitUntil.event}`)
            try {
                await this.eventBus.waitForEvent(
                    action.waitUntil.event,
                    (_, data) => {
                        return this.shouldReactToEvent(data)
                    },
                    action.waitUntil.timeout
                )
                console.log(`[Scenario ${this.scenarioId}] Event received: ${action.waitUntil.event}`)
            } catch (error) {
                console.error(`[Scenario ${this.scenarioId}] Error waiting for event:`, error)
                throw error
            }
        }

        // Execute the action based on its type
        try {
            let result

            switch (action.type) {
                case 'register':
                    console.log(`[Scenario ${this.scenarioId}] Executing register action`)
                    result = await this.executeRegister(action)
                    this.triggerLocalEventListener('register', result)
                    break
                case 'dial':
                    result = await this.executeDial(action)
                    this.triggerLocalEventListener('dial', result)
                    break
                case 'answer':
                    result = await this.executeAnswer(action)
                    this.triggerLocalEventListener('answer', result)
                    break
                case 'wait':
                    await this.executeWait(action)
                    // Note: wait doesn't trigger an event
                    break
                case 'hold':
                    result = await this.executeHold(action)
                    this.triggerLocalEventListener('hold', result)
                    break
                case 'unhold':
                    result = await this.executeUnhold(action)
                    this.triggerLocalEventListener('unhold', result)
                    break
                case 'hangup':
                    result = await this.executeHangup(action)
                    this.triggerLocalEventListener('hangup', result)
                    break
                case 'play_sound':
                    result = await this.executePlaySound(action)
                    this.triggerLocalEventListener('play_sound', result)
                    break
                case 'unregister':
                    result = await this.executeUnregister(action)
                    this.triggerLocalEventListener('unregister', result)
                    break
                default:
                    console.error(`[Scenario ${this.scenarioId}] Unknown action type:`, (action as any).type)
                    throw new Error(`Unknown action type: ${(action as any).type}`)
            }

            // If the action has a customSharedEvent property, trigger that event
            if (action.customSharedEvent) {
                console.log(`[Scenario ${this.scenarioId}] Triggering custom shared event: ${action.customSharedEvent}`)
                const customEventData: CustomSharedEventData = {
                    originScenario: this.scenarioId,
                    actionType: action.type,
                    result
                }
                this.triggerSharedEventListener(action.customSharedEvent, customEventData)
            }

        } catch (error) {
            console.error(`[Scenario ${this.scenarioId}] Error executing action:`, error)
            throw error
        }
    }

    // Action implementation methods with typed returns
    private async executeRegister (action: RegisterAction): Promise<{
        success: boolean;
        username: string;
        password: string;
        domain: string;
        instanceId: string
    }> {
        const instanceId = `${this.scenarioId}-${Date.now()}`
        console.log(`[Scenario ${this.scenarioId}] Executing register action`, action.data)
        const { username, password, sip_domain } = action.data

        console.log(`[Scenario ${this.scenarioId}][Instance ${instanceId}] Form elements found, filling form`)
        this.usernameInput = this.page.locator('#loginToAppForm > label:nth-child(2) > input')
        this.passwordInput = this.page.locator('#loginToAppForm > label:nth-child(3) > input')
        this.domainInput = this.page.locator('#loginToAppForm > label:nth-child(5) > input')
        this.useAudioCheckbox = this.page.locator('#useAudioCheckbox')
        this.useVideoCheckbox = this.page.locator('#useVideoCheckbox')
        this.loginButton = this.page.locator('#loginToAppForm > button')

        await this.usernameInput.fill(username)
        await this.passwordInput.fill(password)
        await this.domainInput.fill(sip_domain)
        await this.loginButton.click()
        const ws = await getPageWebSocket(this.page)
        await this.page.addScriptTag({
            content: WebRTCMetricsService.getMetricsCollectionScript()
        })
        const eventMapping = {
            INVITE: 'incoming',
            ACK: 'callConfirmed',
            CANCEL: 'callCancelled',
            BYE: 'callEnded',
            UPDATE: 'callUpdated',
            MESSAGE: 'messageReceived',
            OPTIONS: 'optionsReceived',
            REFER: 'callReferred',
            INFO: 'infoReceived',
            NOTIFY: 'notificationReceived'
        }
        monitorSocketEvents(ws, eventMapping, this)
        console.log(`[Scenario ${this.scenarioId}] Registration already completed, skipping`)
        return {
            success: true,
            username: action.data.username,
            password: action.data.password,
            domain: action.data.sip_domain,
            instanceId: instanceId
        }

    }

    private async executeDial (action: DialAction): Promise<DialEventData> {
        console.log(`[Scenario ${this.scenarioId}] Executing dial action`, action.data)
        this.yourTargetInput= this.page.locator('#makeCallForm input')
        this.callButton= this.page.locator('#makeCallForm button')
        await this.simulateAsyncOperation(300)
        await this.yourTargetInput.fill(String(action.data.target))
        await this.callButton.click()
        const callId = 'call-' + Math.floor(Math.random() * 10000)
        await this.simulateAsyncOperation(300)
        return {
            callId,
            target: action.data.target,
            success: true
        }
    }

    private async executeAnswer (action: AnswerAction): Promise<AnswerEventData> {
        console.log(`[Scenario ${this.scenarioId}] Executing answer action`)
        this.answerButton = this.page.locator('#call-undefined > button:nth-child(7)')
        await this.answerButton.click()
        await this.simulateAsyncOperation(200)
        return {
            answered: true,
            callId: 'call-' + Math.floor(Math.random() * 10000)
        }
    }

    private async executeWait (action: WaitAction): Promise<void> {
        console.log(`[Scenario ${this.scenarioId}] Waiting for ${action.data.time}ms`)
        await this.page.waitForTimeout(action.data.time)
        await this.simulateAsyncOperation(action.data.time)
    }

    private async executeHold (action: HoldAction): Promise<HoldEventData> {
        console.log(`[Scenario ${this.scenarioId}] Executing hold action`)
        this.holdButton = this.page.locator('.holdAgent')
        await this.holdButton.click()
        await this.simulateAsyncOperation(100)
        return {
            onHold: true,
            callId: 'call-' + Math.floor(Math.random() * 10000)
        }
    }

    private async executeUnhold (action: UnholdAction): Promise<UnholdEventData> {
        console.log(`[Scenario ${this.scenarioId}] Executing unhold action`)
        this.holdButton = this.page.locator('.holdAgent')
        await this.holdButton.click()
        await this.simulateAsyncOperation(100)
        return {
            onHold: false,
            callId: 'call-' + Math.floor(Math.random() * 10000)
        }
    }

    private async executeHangup (action: HangupAction): Promise<HangupEventData> {
        console.log(`[Scenario ${this.scenarioId}] Executing hangup action`)
        //this.hangupButton = this.page.locator('#call-undefined > button:nth-child(4)')
        this.hangupButton = this.page.getByRole('button', { name: 'Hangup' })
        await this.hangupButton.click()
        return {
            hungUp: true,
            callId: 'call-' + Math.floor(Math.random() * 10000)
        }
    }
    private async executeSendDTMF (action: SendDTMFAction): Promise<SendDTMFEventData> {
        console.log(`[Scenario ${this.scenarioId}] Executing send DTMF action`)
        this.DTMFInput= this.page.locator('#dtmfInput')
        this.DTMFSendButton= this.page.locator('#dtmfSendButton')
        await this.DTMFInput.fill(action.data.dtmf)
        await this.DTMFSendButton.click()

        this.simulateAsyncOperation(200)
        return {
            dtmf: action.data.dtmf,
            callId: 'call-' + Math.floor(Math.random() * 10000),
            success: true,
        }
    }
    private async executeTransfer (action: TransferAction): Promise<TransferEventData> {
        console.log(`[Scenario ${this.scenarioId}] Executing transfer action`)
        this.transferButton = this.page.getByRole('button', { name: 'Transfer' })
        await this.transferButton.click()
        this.page.once('dialog', dialog => {
            console.log(`Dialog message: ${dialog.message()}`)
            dialog.accept(action.data.success).catch(e => console.error('Error accepting dialog:', e))
        })
        await this.simulateAsyncOperation(200)
        return {
            callId: 'call-' + Math.floor(Math.random() * 10000),
            target: action.data.success,
            success: true
        }
    }

    private async executeUnregister (action: UnregisterAction): Promise<UnregisterEventData> {
        console.log(`[Scenario ${this.scenarioId}] Executing unregister action`)
        this.logoutButton = this.page.locator('#logoutButton')

        const metrics = await this.page.evaluate(() => {
            const lastStats = window.callMetrics.stats[window.callMetrics.stats.length - 1]
            return {
                setupTime: window.callMetrics.connectionTime,
                totalDuration: Date.now() - window.callMetrics.startTime,
                connectionSuccessful: window.callMetrics.connected,
                audioMetrics: lastStats?.audio || null,
                allStats: window.callMetrics.stats
            }
        })

        // Clicking the logout button
        await this.logoutButton.click()
        console.log('button clicked')

        // Log metrics
        console.log(`Call Metrics ${this.scenarioId}:`, {
            'Setup Time (ms)': metrics.setupTime,
            'Total Duration (ms)': metrics.totalDuration,
            'Connection Successful': metrics.connectionSuccessful,
            'Audio Statistics': metrics.audioMetrics,
        })

        // Close browser and log after actually closing
        await this.page.close()
        await this.browser.close()
        console.log(`[Scenario ${this.scenarioId}] Browser closed`)

        return { unregistered: true }
    }

    private async executePlaySound (action: PlaySoundAction): Promise<PlaySoundEventData> {
        const soundPath = action.data.sound
        console.log(`[Scenario ${this.scenarioId}] Playing sound`, action.data.sound)

        const path = require('path')
        const soundFileName = path.basename(soundPath)

        // Read the file as a Buffer
        const fs = require('fs').promises
        const fileData = await fs.readFile(soundPath)

        // Determine MIME type based on file extension
        const mimeTypes = {
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg',
            '.m4a': 'audio/mp4',
            // Add more as needed
        }
        const ext = path.extname(soundPath).toLowerCase()
        const mimeType = mimeTypes[ext] || 'audio/mpeg'

        // Create a data URL
        const base64Data = fileData.toString('base64')
        const dataUrl = `data:${mimeType};base64,${base64Data}`

        // Pass the dataUrl to the browser's playClip function instead of just the filename
        await this.page.evaluate(url => window.playClip(url), dataUrl)

        console.log(`[Scenario ${this.scenarioId}] Sound played: ${soundFileName}`)
        await this.simulateAsyncOperation(action.data.sound.length * 100)
        return {
            played: true,
            sound: action.data.sound
        }
    }

    // Utility method to simulate async operations
    private simulateAsyncOperation (ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    // Execute a scenario
    public async executeScenario (scenario: TestScenario): Promise<void> {
        console.log(`[Scenario ${this.scenarioId}] Executing scenario:`, scenario)

        // First, set up event handlers for all events in the scenario
        for (const [ eventName, actions ] of Object.entries(scenario)) {
            this.addEventListener(eventName, async (name, eventData) => {
                // Should react to event if either the SCENARIO_THAT_TRIGGERED_EVENT_KEY is not in event data, meaning it was triggered as shared, or the SCENARIO_THAT_TRIGGERED_EVENT_KEY is in the data and its value eq to current scenario ID, meaning it is an event for this scenario
                const shouldReactToEvent = this.shouldReactToEvent(eventData)

                if (shouldReactToEvent) {
                    console.log(`[Scenario ${this.scenarioId}] Handling event: ${eventName}.`)

                    if (actions) {
                        for (const action of actions) {
                            await this.executeAction(action, eventName as keyof EventDataTypes, eventData)
                        }
                    }
                }
            })
        }

        this.browser = await chromium.launch({
            headless: true, // This makes the browser visible
            args: [
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream',
                '--allow-file-access',
                '--autoplay-policy=no-user-gesture-required',
                `--use-file-for-fake-audio-capture=${audioPathAlex}`,
            ]
        })
        console.log('browser started')
        const context = await this.browser.newContext()
        this.page = await context.newPage()

        // in your test file, before `page.goto()`:
        await this.page.addInitScript(() => {
            // keep the real one for non-audio calls
            const realGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
            // one AudioContext + one destination node to drive our fake mic
            const ctx  = new AudioContext()
            const dest = ctx.createMediaStreamDestination()

            // override getUserMedia
            navigator.mediaDevices.getUserMedia = async constraints => {
                if (constraints.audio) {
                    return dest.stream         // always give our fake-mic stream
                }
                return realGUM(constraints)  // e.g. video or whatever
            }

            // helper: fetch + decode + play into the destination
            window.playClip = async url => {
                const data = await fetch(url).then(r => r.arrayBuffer())
                const buf  = await ctx.decodeAudioData(data)
                const src  = ctx.createBufferSource()
                src.buffer = buf
                src.connect(dest)
                src.start()
                // optional: return a promise that resolves when playback ends
                return new Promise(res => src.onended = res)
            }
        })

        await this.page.goto('http://localhost:5173')

        // Wait a moment to ensure all listeners are registered
        await this.simulateAsyncOperation(100)

        // Trigger the 'ready' event to start the scenario
        console.log(`[Scenario ${this.scenarioId}] Triggering ready event`)
        this.triggerLocalEventListener('ready', { timestamp: Date.now() })
    }
}

/**
 * ScenarioManager - Manages the execution of multiple test scenarios
 */
class ScenarioManager {
    private scenarios: TestScenarios
    private eventBus: EventBus

    constructor (scenarios: TestScenarios) {
        this.scenarios = scenarios
        this.eventBus = EventBus.getInstance()
    }

    public async runScenarios (): Promise<void> {
        console.log(`Running ${this.scenarios.length} test scenarios`)

        const executors: TestExecutor[] = []

        // Create an executor for each scenario
        for (let i = 0; i < this.scenarios.length; i++) {
            const scenarioId = `scenario-${i + 1}`
            console.log(scenarioId, 'created')
            executors.push(new TestExecutor(scenarioId))
        }

        console.log('executors', executors)

        // Execute all scenarios in parallel
        await Promise.all(this.scenarios.map((scenario, index) =>
            executors[index].executeScenario(scenario)
        ))

        console.log('All scenarios completed')
    }
}

/**
 * Base class for defining test scenarios
 */
abstract class TestScenariosBuilder {
    // Action creator methods with typed filters
    protected register (props: Omit<RegisterAction, 'type'>): RegisterAction {
        return {
            type: 'register',
            ...props
        }
    }

    protected dial (props: Omit<DialAction, 'type'>): DialAction {
        return {
            type: 'dial',
            ...props
        }
    }

    protected wait (props: Omit<WaitAction, 'type'>): WaitAction {
        return {
            type: 'wait',
            ...props
        }
    }

    protected play_sound (props: Omit<PlaySoundAction, 'type'>): PlaySoundAction {
        return {
            type: 'play_sound',
            ...props
        }
    }

    protected answer (props: Omit<AnswerAction, 'type'> = {}): AnswerAction {
        return {
            type: 'answer',
            ...props
        }
    }

    protected hold (props: Omit<HoldAction, 'type'> = {}): HoldAction {
        return {
            type: 'hold',
            ...props
        }
    }

    protected unhold (props: Omit<UnholdAction, 'type'> = {}): UnholdAction {
        return {
            type: 'unhold',
            ...props
        }
    }

    protected hangup (props: Omit<HangupAction, 'type'> = {}): HangupAction {
        return {
            type: 'hangup',
            ...props
        }
    }

    protected unregister (props: Omit<UnregisterAction, 'type'> = {}): UnregisterAction {
        return {
            type: 'unregister',
            ...props
        }
    }

    // Event handler creator - ensures type safety for specific events
    protected on<E extends keyof EventMap> (
        event: E,
        handler: EventHandler<E>
    ): { event: E, handler: EventHandler<E> } {
        return {
            event,
            handler
        }
    }

    // Create a scenario from event handlers
    protected createScenario (...eventHandlers: Array<{ event: keyof EventMap, handler: any }>): TestScenario {
        const scenario: TestScenario = {}
        eventHandlers.forEach(({ event, handler }) => {
            scenario[event] = handler
            console.log(`Scenario created for event: ${event}`)
        })
        return scenario
    }

    // Abstract method that must be implemented to define scenarios
    abstract init(): TestScenarios;

    // Method to execute the scenarios
    async run (): Promise<void> {
        const scenarios = this.init()
        const manager = new ScenarioManager(scenarios)
        await manager.runScenarios()
    }
}

/**
 * Example implementation of test scenarios
 */
class CallTestScenarios extends TestScenariosBuilder {
    init (): TestScenarios {
        return [
            // First scenario - caller
            this.createScenario(
                this.on('ready', [
                    // this.wait({
                    //     data: { time: 100 },
                    //     waitUntil: { event: 'callee_registered' }
                    // }),
                    this.register({
                        data: {
                            sip_domain: 'sip09.voicenter.co',
                            username: 'tb0gDYPk',
                            password: 'F7W3Nkr1ZG3B6CUs',
                        },
                    }),
                    // this.dial({
                    //     data: { target: '36' },
                    //     customSharedEvent: 'call_initiated'
                    // })
                ]),
                this.on('incoming', [
                    this.answer({
                        customSharedEvent: 'call_answered',
                    })
                ])
                // this.on('call_answered', [
                //     this.wait({ data: { time: 1000 } }),
                //     this.hold({
                //         customSharedEvent: 'call_on_hold',
                //         // Type-safe filter using AnswerEventData
                //         // filter: (data: AnswerEventData) => data.answered === true
                //     }),
                //     this.wait({ data: { time: 1000 } }),
                //     this.unhold(),
                //     this.wait({ data: { time: 1000 } }),
                //     this.play_sound({
                //         data: { sound: audioPathSara },
                //         customSharedEvent: 'sound_played'
                //     }),
                //     this.wait({ data: { time: 1000 } }),
                //     this.hangup({
                //         customSharedEvent: 'call_ended'
                //     }),
                //     this.unregister(),
                // ])
            ),
            // Second scenario - callee
            // this.createScenario(
                // this.on('ready', [
                //     this.register({
                //         data: {
                //             sip_domain: '',
                //             username: '',
                //             password: ''
                //         },
                //         customSharedEvent: 'callee_registered'
                //     })
                // ]),
                // this.on('call_initiated', [
                //     this.wait({
                //         data: { time: 500 },
                //         // Type-safe filter for custom event data
                //         // filter: (data: CustomSharedEventData<DialEventData>) =>
                //         //     data.result.target === 123456 && data.result.success
                //     })
                //     // The incoming event will be triggered by the system
                // ]),
                // this.on('incoming', [
                //     this.answer({
                //         customSharedEvent: 'call_answered',
                //         // Type-safe filter using IncomingEventData
                //         // filter: (data: IncomingEventData) => data.callerId === 'caller' || true // Just an example condition
                //     })
                // ]),
                // this.on('call_on_hold', [
                //     this.wait({
                //         data: { time: 500 },
                //         // Type-safe filter for custom event data
                //         // filter: (data: CustomSharedEventData<HoldEventData>) =>
                //         //     data.originScenario === 'scenario-1' && data.result.onHold
                //     })
                // ]),
                // this.on('sound_played', [
                //     // Type-safe filter for custom event data with PlaySoundEventData
                //     this.wait({
                //         data: { time: 200 },
                //         // filter: (data: CustomSharedEventData<PlaySoundEventData>) =>
                //         //     data.result.sound === 'greeting.wav' && data.result.played
                //     })
                // ]),
                // this.on('call_ended', [
                //     this.unregister({
                //         // Type-safe filter for custom events
                //         // filter: (data: CustomSharedEventData<HangupEventData>) =>
                //         //     data.originScenario === 'scenario-1' && data.result.hungUp
                //     }),
                // ])
            // )
        ]
    }
}

// Run the test
async function runTest () {
    console.log('Starting test execution')
    try {
        const testRunner = new CallTestScenarios()
        await testRunner.run()
        console.log('Test execution completed successfully')
    } catch (error) {
        console.error('Test execution failed:', error)
    }
}

// Start the test
runTest().catch(err => console.error('Unhandled error in test execution:', err))
