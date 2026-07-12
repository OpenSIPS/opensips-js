import {
    apiDelete,
    apiGet,
    apiPost,
    buildApiUrl,
    getApiToken
} from './client'
import type {
    Channel,
    GreenApiProvisionCompleteBody,
    GreenApiProvisionStartResponse,
    GreenApiProvisionStatusResponse,
    MetaProvisionCompleteBody,
    MetaProvisionPhonesResponse,
    Provider,
    SmsProvisionCompleteBody,
    SmsProvisionStartResponse
} from './types'

// ---------- Provider catalogue ----------

export function listProviders (): Promise<Provider[]> {
    return apiGet<Provider[]>('/providers')
}

// ---------- Channels ----------

export function listChannels (): Promise<Channel[]> {
    return apiGet<Channel[]>('/channels')
}

export function deleteChannel (channelId: string | number): Promise<void> {
    return apiDelete<void>(`/channels/${encodeURIComponent(String(channelId))}`)
}

export function deactivateChannel (channelId: string | number): Promise<void> {
    return apiPost<void>(`/channels/${encodeURIComponent(String(channelId))}/deactivate`)
}

// ---------- Meta (WhatsApp Cloud API) provisioning ----------
// The Meta OAuth flow runs in a popup window. The consumer opens
// `getMetaProvisionStartUrl()` in a popup, waits for the callback to
// message back a `sessionId`, then continues with `listMetaProvisionPhones()`
// + `completeMetaProvision()`.

export function getMetaProvisionStartUrl (): string {
    const token = getApiToken()
    if (!token) {
        throw new Error('API token is not set - cannot build Meta provisioning URL')
    }
    return buildApiUrl('/provision/meta/start', { token })
}

export function listMetaProvisionPhones (sessionId: string): Promise<MetaProvisionPhonesResponse> {
    return apiGet<MetaProvisionPhonesResponse>(
        `/provision/meta/${encodeURIComponent(sessionId)}/phones`
    )
}

export function completeMetaProvision (
    sessionId: string,
    body: MetaProvisionCompleteBody
): Promise<Channel> {
    return apiPost<Channel>(
        `/provision/meta/${encodeURIComponent(sessionId)}/complete`,
        body
    )
}

// ---------- GreenAPI (WhatsApp via QR) provisioning ----------
// The GreenAPI flow returns a session_id + QR code. The consumer polls
// `getGreenApiProvisionStatus()` until it flips to 'authorized', then
// calls `completeGreenApiProvision()` to persist the new channel.

export function startGreenApiProvision (body?: Record<string, unknown>): Promise<GreenApiProvisionStartResponse> {
    return apiPost<GreenApiProvisionStartResponse>('/provision/greenapi/start', body ?? {})
}

export function getGreenApiProvisionStatus (sessionId: string): Promise<GreenApiProvisionStatusResponse> {
    return apiGet<GreenApiProvisionStatusResponse>(
        `/provision/greenapi/${encodeURIComponent(sessionId)}/status`
    )
}

export function completeGreenApiProvision (
    sessionId: string,
    body?: GreenApiProvisionCompleteBody
): Promise<Channel> {
    return apiPost<Channel>(
        `/provision/greenapi/${encodeURIComponent(sessionId)}/complete`,
        body ?? {}
    )
}

// ---------- SMS provisioning (DID select) ----------

export function startSmsProvision (body?: Record<string, unknown>): Promise<SmsProvisionStartResponse> {
    return apiPost<SmsProvisionStartResponse>('/provision/sms/start', body ?? {})
}

export function completeSmsProvision (body: SmsProvisionCompleteBody): Promise<Channel> {
    return apiPost<Channel>('/provision/sms/complete', body)
}
