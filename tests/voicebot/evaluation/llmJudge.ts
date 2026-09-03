import { generateObject } from 'ai'
import { z } from 'zod'

import { createVoicebotAnthropic, DEFAULT_VOICEBOT_MODEL } from '../llm/anthropicClient'
import type { HistoryMessage } from '../driver/types'

export interface JudgeQuestion {
    id: number
    question: string
}

export interface JudgeAnswer {
    answer: boolean
    reasoning: string
}

const judgeOutputSchema = z.object({
    answers: z.array(z.object({
        id: z.number().int()
            .describe('The id of the question being answered.'),
        answer: z.boolean()
            .describe('The strict boolean answer to the question, based only on the transcript.'),
        reasoning: z.string().min(1)
            .describe('One or two sentences citing the specific transcript lines that support the answer.'),
    })),
})

const JUDGE_SYSTEM_PROMPT = [
    'You are a strict post-call judge for automated voice-bot tests.',
    'You receive the transcript of a phone call between BOT (the system under test)',
    'and CALLER (a scripted test persona), followed by yes/no questions about the BOT\'s behavior.',
    'Answer every question strictly from the transcript. If the transcript does not contain',
    'clear evidence that the answer is yes, answer false. Reference specific lines in your reasoning.',
].join(' ')

/**
 * In driver history "user" is the test caller and "assistant" is the bot under test.
 */
export function renderTranscript (history: HistoryMessage[]): string {
    return history
        .map((message) => `${message.role === 'user' ? 'CALLER' : 'BOT'}: ${message.content}`)
        .join('\n')
}

export async function judgeTranscript (
    questions: JudgeQuestion[],
    history: HistoryMessage[],
    model: string = DEFAULT_VOICEBOT_MODEL
): Promise<Map<number, JudgeAnswer>> {
    if (questions.length === 0) {
        return new Map()
    }

    const questionList = questions
        .map((question) => `- [question id ${question.id}] ${question.question}`)
        .join('\n')

    const { object } = await generateObject({
        model: createVoicebotAnthropic()(model),
        schema: judgeOutputSchema,
        temperature: 0,
        system: JUDGE_SYSTEM_PROMPT,
        prompt: [
            '## Transcript',
            renderTranscript(history) || '(the call produced no transcript)',
            '',
            '## Questions',
            questionList,
            '',
            'Answer every question, one entry per question id.',
        ].join('\n'),
    })

    const answers = new Map<number, JudgeAnswer>()

    for (const entry of object.answers) {
        answers.set(entry.id, {
            answer: entry.answer,
            reasoning: entry.reasoning,
        })
    }

    const unanswered = questions.filter((question) => !answers.has(question.id))

    if (unanswered.length > 0) {
        throw new Error(
            `Judge did not answer questions: ${unanswered.map((q) => q.id).join(', ')}`
        )
    }

    return answers
}
