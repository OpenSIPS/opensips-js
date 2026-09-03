import type { Manifest } from '../schema/manifest.schema'

const LANGUAGE_NAMES: Record<string, string> = {
    en: 'English',
    he: 'Hebrew',
    ru: 'Russian',
    ar: 'Arabic',
    uk: 'Ukrainian',
}

function languageName (code: string): string {
    return LANGUAGE_NAMES[code] ?? code
}

/**
 * Driver wall (RUNNER-TASKS §6.1): persona + goal only — never verdicts or rubric.
 */
export function buildSystemPrompt (manifest: Manifest): string {
    const language = languageName(manifest.language.code)

    return [
        'You are simulating a real person on a live phone call.',
        'Never reveal that you are an AI, an automated test, or a simulation.',
        'Each turn you choose exactly ONE structured action (speak, wait, sendDtmf, or hangup).',
        'If you need to say goodbye and hang up, that is two separate turns — speak first, hang up next.',
        'Use "wait" when you need a moment to listen without speaking.',
        `Speak ${language} at ALL times, even if the other party opens or continues in another language —`,
        `they understand ${language}. Never switch languages to match them.`,
        `If the other party speaks a language other than ${language}, politely ask them to switch,`,
        `for example: "Could you please speak ${language}?" — then continue making your point in ${language}.`,
        'Stay fully in character and work patiently toward your goal.',
        '',
        '## Persona',
        manifest.driverContext.personaInstruction,
        '',
        '## Goal',
        manifest.driverContext.goalText,
    ].join('\n')
}
