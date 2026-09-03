import axios from 'axios'
import { z } from 'zod'

import type { SipCredentials } from '../../core/session/types'

const LOGIN_URL = 'https://loginapi.voicenter.com/Auth/Login/Voicenter/Chrome'
const SETTINGS_URL = 'https://loginapi.voicenter.com/Application/GetSettings'

const loginResponseSchema = z.object({
    Data: z.object({
        AccessToken: z.string().min(1),
    }),
})

const settingsResponseSchema = z.object({
    WebRTCData: z.object({
        domain: z.string().min(1),
        extension_user: z.string().min(1),
        extension_pass: z.string().min(1),
    }),
})

function requireEnv (name: string): string {
    const value = process.env[name]

    if (!value) {
        throw new Error(`Missing required env var ${name}`)
    }

    return value
}

/**
 * SIP credentials for voicebot runs.
 * Prefers direct SMOKE_SIP_* vars; falls back to Voicenter API login.
 */
export async function loginAndFetchSip (): Promise<SipCredentials> {
    if (
        process.env.SMOKE_SIP_DOMAIN
        && process.env.SMOKE_SIP_USERNAME
        && process.env.SMOKE_SIP_PASSWORD
    ) {
        return {
            sip_domain: process.env.SMOKE_SIP_DOMAIN,
            username: process.env.SMOKE_SIP_USERNAME,
            password: process.env.SMOKE_SIP_PASSWORD,
        }
    }

    const email = requireEnv('VOICEBOT_API_EMAIL')
    const password = requireEnv('VOICEBOT_API_PASSWORD')

    const loginResponse = await axios.post(LOGIN_URL, {
        email,
        password
    })
    const login = loginResponseSchema.safeParse(loginResponse.data)

    if (!login.success) {
        throw new Error('Login succeeded but AccessToken is missing from response')
    }

    const settingsResponse = await axios.get(SETTINGS_URL, {
        headers: { Authorization: `Bearer ${login.data.Data.AccessToken}` },
    })

    const settings = settingsResponseSchema.safeParse(settingsResponse.data)

    if (!settings.success) {
        throw new Error('GetSettings response is missing WebRTCData SIP credentials')
    }

    const webrtc = settings.data.WebRTCData

    return {
        sip_domain: webrtc.domain,
        username: webrtc.extension_user,
        password: webrtc.extension_pass,
    }
}
