/**
 * T4.4(а): scripted unit smoke for the ConversationDriver turn machine — fake
 * speech provider, fake call, fake LLM. No SIP, no browser, no network.
 *
 * Covers the overlapping-audio bug class:
 *  - turn 1: normal silence-triggered turn, clip completes;
 *  - turn 2: barge-in DURING TTS synthesis → the zombie turn must never start
 *    its clip and must never reach history;
 *  - turn 3: barge-in DURING playback → clip stopped, history gets [interrupted];
 *  - turn 4: barge-in confirmed by interim-only transcripts (carried text is
 *    empty) → the silence timer must still re-arm (no stall until hard stop);
 *  - turn 5: hangup ends the run.
 * Throughout: at most ONE clip audible at any moment.
 */
import { ConversationDriver, type DriverSessionDeps, type GenerateTurn } from './ConversationDriver'
import type { coreActionTools } from '../../core/actions/coreActions'
import type { TypedToolCall } from 'ai'
import type {
    SpeechProvider,
    TranscriptListener,
} from '../../core/services/speech/BaseSpeechProvider'
import type {
    ActiveCall,
    CallEndInfo,
    ClipPlaybackResult,
    ClipPlaybackStatus,
    PcmStreamClip,
    PlayingClip,
} from '../../core/session/types'
import type { Page } from 'playwright'

const SILENCE_MS = 100
const UTTERANCE_END_MS = 60
const BARGE_CONFIRM_MS = 40

function delay (ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor (label: string, condition: () => boolean, timeoutMs = 3000): Promise<void> {
    const startedAt = Date.now()

    while (!condition()) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error(`Timed out waiting for: ${label}`)
        }
        await delay(5)
    }
}

function assert (condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(`ASSERT FAILED: ${message}`)
    }
}

// --- fakes ------------------------------------------------------------------

function createFakeSpeech () {
    const listeners = new Set<TranscriptListener>()

    const provider: SpeechProvider = {
        textToSpeech: async (text) => ({ audio: `fake-audio:${text}` }),
        startRecording: async () => { /* nothing to start */ },
        writeAudioChunk: async () => { /* chunks are ignored */ },
        stopRecording: async () => { /* nothing to stop */ },
        onTranscript: (listener) => {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
    }

    return {
        provider,
        emit (text: string, isFinal: boolean): void {
            for (const listener of listeners) {
                listener(text, isFinal)
            }
        },
    }
}

interface FakeClipEntry {
    url: string
    stopped: boolean
    finish: () => void
}

function createFakeCall () {
    const clips: FakeClipEntry[] = []
    let activeClips = 0
    let maxConcurrentClips = 0

    let resolveEnded: (info: CallEndInfo) => void = () => { /* replaced by the promise executor */ }
    const ended = new Promise<CallEndInfo>((resolve) => {
        resolveEnded = resolve
    })

    const call: ActiveCall = {
        hangup: async () => {
            resolveEnded({ reason: 'hangup' })
        },
        sendDTMF: async () => { /* not exercised */ },
        hold: async () => { /* not exercised */ },
        unhold: async () => { /* not exercised */ },
        transfer: async () => { /* not exercised */ },
        speak: async () => {
            throw new Error('the driver must use its own performSpeak facade, not call.speak')
        },
        audio: {
            captureRemote: () => () => { /* no audio stream in the fake */ },
            openPcmStream: (): PcmStreamClip => {
                throw new Error('streaming path is not exercised: the fake provider has no textToSpeechStream')
            },
            playClip: (dataUrl: string): PlayingClip => {
                activeClips++
                maxConcurrentClips = Math.max(maxConcurrentClips, activeClips)

                let settled = false
                let resolveDone: (result: ClipPlaybackResult) => void = () => { /* replaced below */ }
                const done = new Promise<ClipPlaybackResult>((resolve) => {
                    resolveDone = resolve
                })

                const settle = (status: ClipPlaybackStatus): void => {
                    if (settled) {
                        return
                    }
                    settled = true
                    activeClips--
                    resolveDone({ status })
                }

                const entry: FakeClipEntry = {
                    url: dataUrl,
                    stopped: false,
                    finish: () => settle('completed'),
                }
                clips.push(entry)

                return {
                    done,
                    stop: () => {
                        entry.stopped = true
                        settle('interrupted')
                    },
                }
            },
        },
        ended,
    }

    return {
        call,
        clips,
        maxConcurrent: () => maxConcurrentClips,
    }
}

// --- scripted LLM ------------------------------------------------------------

interface ScriptedTurn {
    expectInput: string
    toolCalls: TypedToolCall<typeof coreActionTools>[]
}

let toolCallSeq = 0

function speakCall (text: string): TypedToolCall<typeof coreActionTools> {
    toolCallSeq++
    return {
        type: 'tool-call',
        toolCallId: `tc-${toolCallSeq}`,
        toolName: 'speak',
        input: { text },
    }
}

function hangupCall (reason: string): TypedToolCall<typeof coreActionTools> {
    toolCallSeq++
    return {
        type: 'tool-call',
        toolCallId: `tc-${toolCallSeq}`,
        toolName: 'hangup',
        input: { reason },
    }
}

// --- the scenario -------------------------------------------------------------

async function main (): Promise<void> {
    const fakeSpeech = createFakeSpeech()
    const fakeCall = createFakeCall()

    const synthDelaysMs: Record<string, number> = {
        One: 10,
        Two: 500, // long synthesis — the barge-in window of the original bug
        Three: 10,
        Four: 10,
    }

    const session: DriverSessionDeps = {
        getPage (): Page {
            throw new Error('the page must not be touched in the unit scenario (no effects used)')
        },
        getActionsExecutor: () => ({
            synthesizeToDataUrl: async (text: string) => {
                await delay(synthDelaysMs[text] ?? 10)
                return `data:audio/fake;text=${text}`
            },
        }),
    }

    const script: ScriptedTurn[] = [
        {
            expectInput: '[4s of silence]',
            toolCalls: [ speakCall('One') ] 
        },
        {
            expectInput: '[4s of silence]',
            toolCalls: [ speakCall('Two') ] 
        },
        {
            expectInput: 'Hello.',
            toolCalls: [ speakCall('Three') ] 
        },
        {
            expectInput: 'Wait.Stop.',
            toolCalls: [ speakCall('Four') ] 
        },
        {
            expectInput: '[4s of silence]',
            toolCalls: [ hangupCall('scenario finished') ] 
        },
    ]

    let generateCalls = 0
    const generateTurn: GenerateTurn = async ({ messages }) => {
        const step = script[generateCalls]
        generateCalls++

        if (!step) {
            throw new Error(`Unexpected extra LLM turn #${generateCalls} — a zombie turn survived`)
        }

        const lastUser = [ ...messages ].reverse().find((message) => message.role === 'user')
        const content = typeof lastUser?.content === 'string' ? lastUser.content : ''

        if (content !== step.expectInput) {
            throw new Error(`Turn #${generateCalls}: expected input "${step.expectInput}", got "${content}"`)
        }

        return step.toolCalls
    }

    const driver = new ConversationDriver({
        call: fakeCall.call,
        session,
        speech: fakeSpeech.provider,
        prompt: 'unit-test prompt',
        hardStopSec: 30,
        silenceMs: SILENCE_MS,
        utteranceEndMs: UTTERANCE_END_MS,
        bargeInConfirmMs: BARGE_CONFIRM_MS,
        generateTurn,
    })

    const runPromise = driver.run()

    // --- turn 1: silence → speak('One'), clip completes normally
    await waitFor('clip One starts', () => fakeCall.clips.length === 1)
    fakeCall.clips[0].finish()
    await waitFor('user One in history', () =>
        driver.report().history.some((m) => m.role === 'user' && m.content === 'One'))

    // --- turn 2: silence → speak('Two') with slow synthesis; barge-in mid-synthesis
    await waitFor('turn 2 asked the LLM', () => generateCalls === 2)
    fakeSpeech.emit('He', false)
    fakeSpeech.emit('Hello.', true)

    // --- turn 3 fires from the carried text while the zombie is still synthesizing
    await waitFor('clip Three starts', () => fakeCall.clips.length === 2)
    assert(fakeCall.clips[1].url.includes('Three'), 'second clip must be "Three", not the zombie "Two"')

    // barge-in during playback of Three
    fakeSpeech.emit('Wait.', true)
    fakeSpeech.emit('Stop.', true)
    await waitFor('clip Three stopped by barge-in', () => fakeCall.clips[1].stopped)
    await waitFor('user "Three [interrupted]" in history', () =>
        driver.report().history.some((m) => m.role === 'user' && m.content === 'Three [interrupted]'))

    // --- turn 4: speak('Four'); barge-in confirmed by interim-only transcripts
    await waitFor('clip Four starts', () => fakeCall.clips.length === 3)
    fakeSpeech.emit('mm', false)
    fakeSpeech.emit('hm', false)
    await waitFor('clip Four stopped by interim-only barge-in', () => fakeCall.clips[2].stopped)

    // --- turn 5: silence after the empty-carried barge must still fire → hangup
    const report = await runPromise

    // give the zombie's slow synthesis time to (incorrectly) start a clip if the fix regressed
    await delay(600)

    // --- asserts ---------------------------------------------------------------
    assert(generateCalls === script.length, `expected ${script.length} LLM turns, got ${generateCalls}`)
    assert(report.stopReason === 'hangup', `expected stopReason hangup, got ${report.stopReason}`)
    assert(fakeCall.maxConcurrent() === 1, `clips overlapped: maxConcurrent=${fakeCall.maxConcurrent()}`)
    assert(fakeCall.clips.length === 3, `expected 3 clips (One, Three, Four), got ${fakeCall.clips.length}`)
    assert(!fakeCall.clips.some((clip) => clip.url.includes('Two')), 'zombie clip "Two" must never play')
    assert(!report.history.some((m) => m.content.includes('Two')), 'zombie text "Two" must never reach history')

    const expectedHistory = [
        'assistant::[4s of silence]',
        'user::One',
        'assistant::[4s of silence]',
        'assistant::Hello.',
        'user::Three [interrupted]',
        'assistant::Wait.Stop.',
        'user::Four [interrupted]',
        'assistant::[4s of silence]',
    ]
    const actualHistory = report.history.map((m) => `${m.role}::${m.content}`)
    assert(
        JSON.stringify(actualHistory) === JSON.stringify(expectedHistory),
        `history mismatch:\nexpected: ${JSON.stringify(expectedHistory, null, 2)}\nactual:   ${JSON.stringify(actualHistory, null, 2)}`
    )

    const hangupReason = report.logEntries.find((entry) => entry.type === 'hangupReason')
    assert(hangupReason?.reason === 'scenario finished', 'hangup reason must be logged')

    console.log('turn-machine smoke OK:')
    console.log(`  turns: ${generateCalls}, clips: ${fakeCall.clips.length}, max concurrent clips: ${fakeCall.maxConcurrent()}`)
    for (const line of actualHistory) {
        console.log(`  ${line}`)
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('turn-machine smoke FAILED:', error instanceof Error ? error.message : error)
        process.exit(1)
    })
