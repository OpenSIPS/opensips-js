import { Page } from 'playwright'

import ActionsExecutor from '../services/ActionsExecutor'
import WindowMethodsWorker from '../services/WindowMethodsWorker'
import { ConnectionImpairment } from '../services/ConnectionImpairment'
import SessionEmitter from './SessionEmitter'
import { getDefaultExpectations } from './defaultExpectations'
import { hasAudioEffects } from './speakHelpers'
import {
    ActionResponse,
    ActionType,
    BaseActionSuccessResponse,
    isActionError,
} from '../types/actions'
import {
    callEndInfoSchema,
    ActiveCall as ActiveCallInterface,
    CallEndInfo,
    PcmStreamClip,
    PlayingClip,
    SpeakPayload,
    Unsubscribe,
} from './types'

/**
 * Thin facade over ActionsExecutor/WindowMethodsWorker exposing the ActiveCall
 * surface from RUNNER-TASKS §4.1. No action logic is reimplemented here — each
 * method delegates to the existing executor and reproduces the same default
 * expectation chain (INVITE 200, BYE 200, ...) that TestExecutor applied.
 */
export default class ActiveCall implements ActiveCallInterface {
    private endedResolve!: (info: CallEndInfo) => void
    private isEnded = false
    private streamClipSeq = 0
    public readonly ended: Promise<CallEndInfo>

    public readonly audio: ActiveCallInterface['audio']

    constructor (
        private readonly actionsExecutor: ActionsExecutor,
        private readonly windowMethodsWorker: WindowMethodsWorker,
        private readonly page: Page,
        private readonly emitter: SessionEmitter
    ) {
        this.ended = new Promise<CallEndInfo>((resolve) => {
            this.endedResolve = resolve
        })

        this.emitter.once('callEnded', (data) => {
            const parsed = callEndInfoSchema.safeParse(data)
            this.resolveEnded(parsed.success ? parsed.data : { reason: 'callEnded' })
        })

        this.audio = {
            captureRemote: (onChunk: (chunk: Buffer) => void): Unsubscribe => {
                void this.windowMethodsWorker.startRemoteAudioCapture(async (base64Chunk) => {
                    onChunk(Buffer.from(base64Chunk, 'base64'))
                })

                return () => {
                    void this.windowMethodsWorker.stopRemoteAudioCapture()
                }
            },
            playClip: (dataUrl: string): PlayingClip => {
                const done = this.windowMethodsWorker.playClip(dataUrl)

                let stopped = false

                return {
                    done,
                    stop: () => {
                        if (stopped) {
                            return
                        }
                        stopped = true
                        void this.windowMethodsWorker.stopCurrentClip()
                    },
                }
            },
            openPcmStream: (sampleRate: number): PcmStreamClip => {
                this.streamClipSeq++
                const clipId = `stream-${this.streamClipSeq}`
                const started = this.windowMethodsWorker.startStreamClip(clipId, sampleRate)
                const done = started.then(() => this.windowMethodsWorker.waitStreamClipDone(clipId))

                let stopped = false

                return {
                    done,
                    append: async (chunk: Buffer) => {
                        await started
                        await this.windowMethodsWorker.appendStreamClipChunk(clipId, chunk.toString('base64'))
                    },
                    end: async () => {
                        await started
                        await this.windowMethodsWorker.endStreamClip(clipId)
                    },
                    stop: () => {
                        if (stopped) {
                            return
                        }
                        stopped = true
                        void started
                            .then(() => this.windowMethodsWorker.stopStreamClip(clipId))
                            .catch(() => { /* the page may already be gone during teardown */ })
                    },
                }
            }
        }
    }

    public async hangup (): Promise<void> {
        const result = await this.actionsExecutor.hangup()
        await this.runExpectations('hangup', result)
        this.resolveEnded({ reason: 'hangup' })
    }

    public async sendDTMF (digits: string): Promise<void> {
        const result = await this.actionsExecutor.sendDTMF({ dtmf: digits })
        await this.runExpectations('sendDTMF', result)
    }

    public async hold (): Promise<void> {
        const result = await this.actionsExecutor.hold()
        await this.runExpectations('hold', result)
    }

    public async unhold (): Promise<void> {
        const result = await this.actionsExecutor.unhold()
        await this.runExpectations('unhold', result)
    }

    public async transfer (target: string): Promise<void> {
        const result = await this.actionsExecutor.transfer({ target })
        await this.runExpectations('transfer', result)
    }

    public async speak (payload: SpeakPayload): Promise<void> {
        const impairment = new ConnectionImpairment(this.page)

        try {
            if (hasAudioEffects(payload.effects)) {
                await impairment.installOutgoing()

                if (payload.effects.volume !== undefined) {
                    await impairment.setVolume(payload.effects.volume)
                }
                if (payload.effects.noise !== undefined) {
                    await impairment.addNoise(payload.effects.noise)
                }
                if (payload.effects.packetLoss !== undefined) {
                    await impairment.setPacketLoss(payload.effects.packetLoss)
                }
            }

            const dataUrl = await this.actionsExecutor.synthesizeToDataUrl(payload.text)
            const clip = this.audio.playClip(dataUrl)
            await clip.done
        } finally {
            await impairment.clearOutgoing()
        }
    }

    private resolveEnded (info: CallEndInfo): void {
        if (this.isEnded) {
            return
        }

        this.isEnded = true
        this.endedResolve(info)
    }

    private async runExpectations (
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
