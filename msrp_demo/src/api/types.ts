// Shared response DTOs. The backend has not published a formal schema
// for these endpoints yet, so shapes below capture the fields we expect
// based on route names + provisioning flow descriptions. Unknown extra
// fields are preserved via the `[key: string]: unknown` index signature
// so consumers can display them without type friction.

export type ProvisioningType = 'oauth_popup' | 'qr_polling' | 'did_select' | string

export interface Provider {
    id: string | number
    type: string
    name?: string
    display_name?: string
    enabled?: boolean
    provisioning_type?: ProvisioningType
    icon_url?: string
    [key: string]: unknown
}

export interface Channel {
    id: string | number
    channel_id?: string | number
    provider_id?: string | number
    provider_type?: string
    display_name?: string
    phone_number?: string
    status?: string
    created_at?: string
    updated_at?: string
    [key: string]: unknown
}

// ---------- Provisioning ----------

export interface MetaProvisionPhone {
    id: string | number
    phone_number: string
    display_name?: string
    verified_name?: string
    quality_rating?: string
    [key: string]: unknown
}

export interface MetaProvisionPhonesResponse {
    session_id: string
    phones: MetaProvisionPhone[]
    [key: string]: unknown
}

export interface MetaProvisionCompleteBody {
    phone_id: string | number
    display_name?: string
    [key: string]: unknown
}

export interface GreenApiProvisionStartResponse {
    session_id: string
    qr_code?: string
    qr_code_base64?: string
    expires_in?: number
    [key: string]: unknown
}

export type GreenApiProvisionStatus = 'pending' | 'scanned' | 'authorized' | 'expired' | 'failed' | string

export interface GreenApiProvisionStatusResponse {
    status: GreenApiProvisionStatus
    qr_code?: string
    qr_code_base64?: string
    phone_number?: string
    display_name?: string
    [key: string]: unknown
}

export interface GreenApiProvisionCompleteBody {
    display_name?: string
    [key: string]: unknown
}

export interface SmsProvisionStartResponse {
    session_id: string
    available_dids?: Array<{ did: string, country?: string, price?: string, [key: string]: unknown }>
    [key: string]: unknown
}

export interface SmsProvisionCompleteBody {
    session_id: string
    did: string
    display_name?: string
    [key: string]: unknown
}

// ---------- Conversations ----------

export interface ConversationSummary {
    conversation_id: number | string
    display_name?: string
    channel_type?: string
    channel_id?: string | number
    last_message_preview?: string
    last_message_at?: string | number
    unread_count?: number
    status?: string
    created_at?: string | number
    updated_at?: string | number
    [key: string]: unknown
}

export interface ConversationListResponse {
    conversations: ConversationSummary[]
    next_cursor?: string
    total?: number
    [key: string]: unknown
}

// The message shape mirrors the MSRP `m.conversation.message` payload
// received over WebSocket. Not narrowing further here — the demo
// re-uses the same rendering pipeline as MSRP messages.
export interface MessageDto {
    event_id: string
    conversation_id: number | string
    sender: string
    origin_server_ts?: number
    type?: string
    content?: {
        message_type?: string
        content?: string
        in_reply_to?: { event_id: string, [key: string]: unknown }
        attachments?: unknown[]
        reactions_summary?: unknown[]
        is_deleted?: boolean
        edited_at?: number
        status?: string
        [key: string]: unknown
    }
    unsigned?: Record<string, unknown>
    [key: string]: unknown
}

export interface MessagesListResponse {
    messages: MessageDto[]
    next_cursor?: string
    total?: number
    [key: string]: unknown
}

export interface MessagesSearchResponse {
    results: MessageDto[]
    total?: number
    [key: string]: unknown
}

export interface Member {
    uri: string
    display_name?: string
    role?: string
    membership?: string
    last_seen_at?: string | number
    [key: string]: unknown
}

export interface MembersResponse {
    members: Member[]
    [key: string]: unknown
}

export interface ConversationSearchHit {
    conversation_id: number | string
    match?: MessageDto
    snippet?: string
    [key: string]: unknown
}

export interface ConversationSearchResponse {
    results: ConversationSearchHit[]
    total?: number
    [key: string]: unknown
}

// ---------- Common query params ----------

export interface PaginationParams {
    limit?: number
    cursor?: string
    before?: string | number
    after?: string | number
}

export interface ConversationListParams extends PaginationParams {
    status?: string
    channel_type?: string
    unread_only?: boolean
}

export interface MessagesListParams extends PaginationParams {
    include_deleted?: boolean
}

export type ExportFormat = 'txt' | 'json'
