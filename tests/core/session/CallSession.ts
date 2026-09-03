import { Browser, chromium, Page } from 'playwright'

import PageWebSocketWorker from '../services/PageWebSocketWorker'
import WindowMethodsWorker from '../services/WindowMethodsWorker'
import ActionsExecutor from '../services/ActionsExecutor'
import { TelemetryService } from '../services/TelemetryService'
import { INITIALIZE_METRICS_ANALYZE_SCRIPT } from '../services/WebRTCMetricsCollector'
import env from '../env'

import ActiveCall from './ActiveCall'
import SessionEmitter from './SessionEmitter'
import { getDefaultExpectations } from './defaultExpectations'
import {
    ActionResponse,
    ActionType,
    BaseActionSuccessResponse,
    GetActionPayload,
    GetActionResponse,
    AnswerAction,
    ChangeRoomAction,
    DialAction,
    DNDAction,
    HangupAction,
    HoldAction,
    PlaySoundAction,
    RegisterAction,
    RequestAction,
    SendDTMFAction,
    StartTranscriptionAction,
    StopTranscriptionAction,
    TextToSpeechAction,
    TransferAction,
    UnholdAction,
    UnregisterAction,
    WaitAction,
    Expectation,
    isActionError,
} from '../types/actions'
import {
    ActiveCall as ActiveCallInterface,
    CallSession as CallSessionInterface,
    SessionConfig,
    SipCredentials,
    Unsubscribe,
    WebRTCMetricsReport,
} from './types'

const SIP_EVENT_MAP: Record<string, string> = {
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
}

const EMPTY_METRICS_REPORT: WebRTCMetricsReport = {
    setupTime: null,
    totalDuration: 0,
    connectionSuccessful: false,
    audioMetrics: null,
    allStats: [],
}

/**
 * Shar 0 from RUNNER-TASKS §4.1: a call session that owns the browser, page and
 * workers (ownership moved here from TestExecutor) and exposes the public
 * CallSession surface. All method bodies delegate to the existing
 * ActionsExecutor/WindowMethodsWorker/PageWebSocketWorker — no action logic is
 * reimplemented.
 *
 * Raw `*Raw` methods return ActionResponse without checking expectations — the
 * declarative TestExecutor layer applies default/custom expectations itself.
 * Public `register`/`dial`/`ActiveCall.*` keep default expectations for the
 * runner API.
 */
export default class CallSession implements CallSessionInterface {
    private browser!: Browser
    private page!: Page
    private windowMethodsWorker!: WindowMethodsWorker
    private pageWebSocketWorker!: PageWebSocketWorker
    private actionsExecutor!: ActionsExecutor
    private telemetryService!: TelemetryService
    private ownsTelemetry = false

    private readonly emitter = new SessionEmitter()

    private readonly scenarioId: string
    private readonly scenarioName: string
    private readonly headless: boolean
    private readonly config: SessionConfig

    private constructor (config: SessionConfig) {
        this.config = config
        this.scenarioName = config.scenarioName ?? 'call-session'
        this.scenarioId = config.scenarioId ?? `session-${Date.now()}`
        this.headless = config.headless ?? false
    }

    public static async create (config: SessionConfig = {}): Promise<CallSession> {
        const session = new CallSession(config)
        await session.setup()
        return session
    }

    private async setup (): Promise<void> {
        this.browser = await chromium.launch({
            headless: this.headless,
            args: [
                '--allow-file-access',
                '--autoplay-policy=no-user-gesture-required',
                '--disable-web-security',
                '--allow-running-insecure-content'
            ],
        })

        const context = await this.browser.newContext({
            permissions: [ 'microphone' ]
        })

        this.page = await context.newPage()

        await this.page.addInitScript({ content: INITIALIZE_METRICS_ANALYZE_SCRIPT })

        if (this.config.onPageClose) {
            this.page.on('close', this.config.onPageClose)
        }

        this.windowMethodsWorker = new WindowMethodsWorker(this.page)

        if (this.config.telemetryService) {
            this.telemetryService = this.config.telemetryService
        } else {
            this.telemetryService = new TelemetryService(this.scenarioId, this.scenarioName)
            this.ownsTelemetry = true
        }

        this.pageWebSocketWorker = new PageWebSocketWorker(
            this.page,
            SIP_EVENT_MAP,
            (eventName: string, data?: unknown) => {
                this.emitter.emit(eventName, data)
            },
            this.telemetryService
        )

        this.actionsExecutor = new ActionsExecutor(
            this.scenarioId,
            this.scenarioName,
            this.pageWebSocketWorker,
            this.windowMethodsWorker,
            this.page,
            this.browser,
            this.config.speechProvider
        )


        await this.page.goto(`http://localhost:${env.PORT}`)
        await this.windowMethodsWorker.implementPlayClipMethod(this.config.monitorOutgoingAudio ?? false)

        if (!this.config.skipReadyEmit) {
            this.emitReady()
        }
    }

    public emitReady (): void {
        this.emitter.emit('ready', { timestamp: Date.now() })
    }

    public on (event: string, cb: (...args: unknown[]) => void): Unsubscribe {
        return this.emitter.on(event, (data) => cb(data))
    }

    public emit (event: string, data?: unknown): void {
        this.emitter.emit(event, data)
    }

    public waitFor (event: string, timeout?: number): Promise<unknown> {
        return this.emitter.waitFor(event, timeout)
    }

    public getPage (): Page {
        return this.page
    }

    public getActionsExecutor (): ActionsExecutor {
        return this.actionsExecutor
    }

    // -------------------------------------------------------------------------
    // Runner API — default expectations applied
    // -------------------------------------------------------------------------

    public async register (creds: SipCredentials): Promise<void> {
        const result = await this.registerRaw(creds)
        await this.runDefaultExpectations('register', result)
    }

    public async dial (target: string): Promise<ActiveCallInterface> {
        const result = await this.dialRaw(target)
        await this.runDefaultExpectations('dial', result)

        return this.createActiveCall()
    }

    public async answer (): Promise<ActiveCallInterface> {
        const result = await this.answerRaw()
        await this.runDefaultExpectations('answer', result)

        return this.createActiveCall()
    }

    /**
     * Expectation checking for the declarative layer — keeps TestExecutor
     * behind the session facade instead of reaching into ActionsExecutor.
     */
    public checkExpectations<T extends BaseActionSuccessResponse> (
        expectations: Expectation<T>[][],
        result: ActionResponse<T>,
        actionType: ActionType
    ): Promise<boolean> {
        return this.actionsExecutor.checkExpectations(expectations, result, actionType)
    }

    private createActiveCall (): ActiveCallInterface {
        return new ActiveCall(
            this.actionsExecutor,
            this.windowMethodsWorker,
            this.page,
            this.emitter
        )
    }

    // -------------------------------------------------------------------------
    // Declarative layer — raw delegation to ActionsExecutor (no expectations)
    // -------------------------------------------------------------------------

    public registerRaw (data: NonNullable<GetActionPayload<RegisterAction>>): Promise<GetActionResponse<RegisterAction>> {
        return this.actionsExecutor.register(data)
    }

    public dialRaw (target: string): Promise<GetActionResponse<DialAction>> {
        return this.actionsExecutor.dial({ target })
    }

    public answerRaw (): Promise<GetActionResponse<AnswerAction>> {
        return this.actionsExecutor.answer()
    }

    public waitRaw (time: number): Promise<GetActionResponse<WaitAction>> {
        return this.actionsExecutor.wait({ time })
    }

    public holdRaw (): Promise<GetActionResponse<HoldAction>> {
        return this.actionsExecutor.hold()
    }

    public unholdRaw (): Promise<GetActionResponse<UnholdAction>> {
        return this.actionsExecutor.unhold()
    }

    public hangupRaw (): Promise<GetActionResponse<HangupAction>> {
        return this.actionsExecutor.hangup()
    }

    public playSoundRaw (sound: string): Promise<GetActionResponse<PlaySoundAction>> {
        return this.actionsExecutor.playSound({ sound })
    }

    public sendDTMFRaw (dtmf: string): Promise<GetActionResponse<SendDTMFAction>> {
        return this.actionsExecutor.sendDTMF({ dtmf })
    }

    public transferRaw (target: string): Promise<GetActionResponse<TransferAction>> {
        return this.actionsExecutor.transfer({ target })
    }

    public changeRoomRaw (
        fromRoom: number,
        toRoom: number
    ): Promise<GetActionResponse<ChangeRoomAction>> {
        return this.actionsExecutor.changeRoom({
            fromRoom,
            toRoom 
        })
    }

    public dndRaw (): Promise<GetActionResponse<DNDAction>> {
        return this.actionsExecutor.DND()
    }

    public unregisterRaw (): Promise<GetActionResponse<UnregisterAction>> {
        return this.actionsExecutor.unregister()
    }

    public requestRaw (
        data: NonNullable<GetActionPayload<RequestAction>>
    ): Promise<GetActionResponse<RequestAction>> {
        return this.actionsExecutor.request(data)
    }

    public textToSpeechRaw (text: string): Promise<GetActionResponse<TextToSpeechAction>> {
        return this.actionsExecutor.textToSpeech({ text })
    }

    public startTranscriptionRaw (): Promise<GetActionResponse<StartTranscriptionAction>> {
        return this.actionsExecutor.startTranscription()
    }

    public stopTranscriptionRaw (): Promise<GetActionResponse<StopTranscriptionAction>> {
        return this.actionsExecutor.stopTranscription()
    }

    public metrics (): WebRTCMetricsReport {
        return { ...EMPTY_METRICS_REPORT }
    }

    public async dispose (): Promise<void> {
        this.emitter.emit('callEnded', { reason: 'disposed' })

        try {
            if (this.windowMethodsWorker) {
                await this.windowMethodsWorker.cleanup()
            }
        } catch {
            // best-effort cleanup — the audio graph may already be torn down
        }

        if (this.page && !this.page.isClosed()) {
            await this.page.close()
        }

        if (this.browser) {
            await this.browser.close()
        }

        if (this.telemetryService && this.ownsTelemetry) {
            this.telemetryService.cleanup()
        }

        this.emitter.removeAllListeners()
    }

    private async runDefaultExpectations (
        actionType: ActionType,
        result: ActionResponse<BaseActionSuccessResponse>
    ): Promise<void> {
        if (isActionError(result)) {
            throw new Error(result.error)
        }

        const expectations = getDefaultExpectations(actionType)

        if (expectations.length > 0) {
            const passed = await this.actionsExecutor.checkExpectations(expectations, result, actionType)

            if (!passed) {
                throw new Error(`Expectations failed for action ${actionType}`)
            }
        }
    }
}

export function createCallSession (config: SessionConfig = {}): Promise<CallSession> {
    return CallSession.create(config)
}
