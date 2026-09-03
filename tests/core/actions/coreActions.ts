import { tool } from 'ai'

import type { AssertNever } from '../types/actions'
import type { ActionContext } from './ActionContext'
import {
    hangupPayloadSchema,
    sendDtmfPayloadSchema,
    speakPayloadSchema,
    waitPayloadSchema,
    type HangupPayload,
    type SendDtmfPayload,
    type SpeakPayload,
    type WaitPayload,
} from './schemas/runnerPayloads.schema'

/**
 * SSOT action catalog (RUNNER-TASKS §5.0/§5.2): description + zod schema + execute,
 * one entry per action. Payload types are inferred from the schemas, so
 * schema↔type drift is impossible by construction.
 */
export const coreActions = {
    speak: {
        description: 'Say something to the other party out loud.',
        params: speakPayloadSchema,
        execute: (input: SpeakPayload, ctx: ActionContext): Promise<void> => ctx.call.speak(input),
    },
    sendDtmf: {
        description: 'Send touch-tone digits, for example to navigate an IVR menu.',
        params: sendDtmfPayloadSchema,
        execute: (input: SendDtmfPayload, ctx: ActionContext): Promise<void> => ctx.call.sendDTMF(input.digits),
    },
    hangup: {
        description: 'End the call when the goal is reached or the conversation truly cannot progress.',
        params: hangupPayloadSchema,
        execute: async (input: HangupPayload, ctx: ActionContext): Promise<void> => {
            ctx.log({
                type: 'hangupReason',
                reason: input.reason,
            })
            await ctx.call.hangup()
        },
    },
    wait: {
        description: 'Stay silent and listen without taking another action for a short time.',
        params: waitPayloadSchema,
        execute: (input: WaitPayload): Promise<void> =>
            new Promise((resolve) => setTimeout(resolve, input.durationMs)),
    },
}

/**
 * The same catalog exposed as an AI SDK toolset for generateText. Tools carry no
 * execute on purpose: the driver dispatches by toolName itself, so it can check
 * barge-in interruption between the LLM response and the action side effects.
 */
export const coreActionTools = {
    speak: tool({
        description: coreActions.speak.description,
        inputSchema: coreActions.speak.params,
    }),
    sendDtmf: tool({
        description: coreActions.sendDtmf.description,
        inputSchema: coreActions.sendDtmf.params,
    }),
    hangup: tool({
        description: coreActions.hangup.description,
        inputSchema: coreActions.hangup.params,
    }),
    wait: tool({
        description: coreActions.wait.description,
        inputSchema: coreActions.wait.params,
    }),
}

// Catalog ↔ toolset membership guard: adding an action to one object without
// the other fails to compile, so the LLM can never silently miss an action.
export type _ActionsMissingFromTools = AssertNever<Exclude<keyof typeof coreActions, keyof typeof coreActionTools>>
export type _ToolsMissingFromActions = AssertNever<Exclude<keyof typeof coreActionTools, keyof typeof coreActions>>
