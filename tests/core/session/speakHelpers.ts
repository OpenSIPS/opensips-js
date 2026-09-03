import type { AudioEffects } from './types'

export function hasAudioEffects (effects?: AudioEffects): effects is AudioEffects {
    if (!effects) {
        return false
    }

    return effects.volume !== undefined
        || effects.noise !== undefined
        || effects.packetLoss !== undefined
}

/** Call-level defaults merged with per-utterance overrides (LLM wins on conflict). */
export function mergeAudioEffects (
    base?: AudioEffects,
    override?: AudioEffects
): AudioEffects | undefined {
    if (!base && !override) {
        return undefined
    }

    const merged: AudioEffects = {
        ...base,
        ...override,
    }

    return hasAudioEffects(merged) ? merged : undefined
}
