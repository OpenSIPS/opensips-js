import { apiClient, apiGet, buildApiUrl } from './client'
import type {
    ConversationListParams,
    ConversationListResponse,
    ConversationSearchResponse,
    ExportFormat,
    MembersResponse,
    MessagesListParams,
    MessagesListResponse,
    MessagesSearchResponse
} from './types'

function encodeId (id: string | number): string {
    return encodeURIComponent(String(id))
}

// ---------- Conversation list ----------

export function listConversations (
    params?: ConversationListParams
): Promise<ConversationListResponse> {
    return apiGet<ConversationListResponse>('/conversations', { params })
}

// ---------- Messages (paginated) ----------

export function listMessages (
    conversationId: string | number,
    params?: MessagesListParams
): Promise<MessagesListResponse> {
    return apiGet<MessagesListResponse>(
        `/conversations/${encodeId(conversationId)}/messages`,
        { params }
    )
}

// ---------- Search within a conversation ----------

export function searchMessagesInConversation (
    conversationId: string | number,
    query: string,
    params?: { limit?: number, cursor?: string }
): Promise<MessagesSearchResponse> {
    return apiGet<MessagesSearchResponse>(
        `/conversations/${encodeId(conversationId)}/messages/search`,
        { params: { q: query, ...(params ?? {}) } }
    )
}

// ---------- Members / participants ----------

export function listConversationMembers (
    conversationId: string | number
): Promise<MembersResponse> {
    return apiGet<MembersResponse>(
        `/conversations/${encodeId(conversationId)}/members`
    )
}

// ---------- Export / download transcript ----------

/**
 * Fetch the raw export payload. Returns a Blob so the caller can
 * hand it straight to `URL.createObjectURL()` and trigger a
 * download-as-file link.
 */
export async function exportConversation (
    conversationId: string | number,
    format: ExportFormat = 'txt'
): Promise<Blob> {
    const { data } = await apiClient.get<Blob>(
        `/conversations/${encodeId(conversationId)}/export`,
        {
            params: { format },
            responseType: 'blob'
        }
    )
    return data
}

/**
 * Direct download URL for the transcript. Useful when the caller wants
 * to hand the browser an <a href download> rather than fetch the blob
 * itself (note: the browser will need the JWT — usually attached via
 * cookie or a signed URL; this helper simply builds the URL string).
 */
export function getConversationExportUrl (
    conversationId: string | number,
    format: ExportFormat = 'txt'
): string {
    return buildApiUrl(
        `/conversations/${encodeId(conversationId)}/export`,
        { format }
    )
}

// ---------- Global full-text search ----------

export function searchConversations (
    query: string,
    params?: { limit?: number, cursor?: string }
): Promise<ConversationSearchResponse> {
    return apiGet<ConversationSearchResponse>(
        '/conversations/search',
        { params: { q: query, ...(params ?? {}) } }
    )
}
