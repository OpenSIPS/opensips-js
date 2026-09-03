import { z } from 'zod'

export const audioEffectsSchema = z.object({
    volume: z.number().min(0).max(1)
        .optional()
        .describe('Output volume from 0 (silent) to 1 (full).'),
    noise: z.number().min(0).max(1)
        .optional()
        .describe('Background noise gain 0–1, applied directly (no scaling). Source is full-scale white noise, so values like 0.005–0.02 are typical for subtle hiss.'),
    packetLoss: z.number().min(0).max(1)
        .optional()
        .describe('Simulated packet loss on outgoing audio, 0 to 1.'),
})

export type AudioEffects = z.infer<typeof audioEffectsSchema>
