// Local type contracts for the msrp_demo composable.
//
// In the main project these live at `@/types`; here we mirror the shape so
// the slice can later be lifted straight into that file. Keep field names
// identical to the main composable's VsipAPI - only the MSRP + shared
// connection surface is included (audio/video deliberately omitted).

import type { ComputedRef, Ref } from 'vue'
import type {
    CustomLoggerType,
    IOpenSIPSConfiguration
} from '../../../src/types/rtc'
import type { IMessage } from '../../../src/types/msrp'
import type {
    MSRPConversationState,
    MSRPMemberRole,
    MSRPUploadResult
} from '../../../src/modules/msrp'

export type UnreadCounts = Record<string, number>
import type { MODULES } from '../../../src/enum/modules'
import type OpenSIPSJS from '../../../src/index'

export type ModuleName = typeof MODULES[keyof typeof MODULES]

export interface ConnectOptions {
    username: string
    password: string
    domain: string
    authorization_jwt?: string
    modules: Array<ModuleName>
    msrpDomain?: string
    msrpWs?: boolean
}

export type PnExtraHeaders = Record<string, string> | undefined

export interface MSRPTypingState {
    sender: string
    isTyping: boolean
    updatedAt: number
}

export interface VsipAPIState {
    // ---------- Shared connection lifecycle ----------
    isInitialized: Ref<boolean>
    isOpenSIPSReady: Ref<boolean>
    isOpenSIPSReconnecting: Ref<boolean>

    // ---------- MSRP session ----------
    isMSRPInitializing: Ref<boolean>
    currentMsrpSession: Ref<IMessage | null>
    hasActiveMsrpSession: ComputedRef<boolean>

    // ---------- MSRP conversations / messages ----------
    // Conversation metadata only - chat history lives in its own store
    // (`messagesByConversation`) to keep slow-moving protocol data
    // decoupled from fast-moving message updates.
    conversations: Ref<{ [key: string]: MSRPConversationState }>
    messagesByConversation: Ref<{ [conversationKey: string]: any[] }>
    // The "currently focused" conversation is a UI concern (the protocol
    // module exposes the full conversations map and lets the consumer
    // decide which one is active). We track it here so the demo's UI can
    // reactively highlight it.
    currentConversationKey: Ref<string | null>
    currentConversation: ComputedRef<MSRPConversationState | null>
    currentMessages: ComputedRef<any[]>
    sortedConversations: ComputedRef<MSRPConversationState[]>
    typingByConversation: Ref<{ [conversationKey: string]: MSRPTypingState }>
    // Same UI-concern story as currentConversationKey: unread tallying is
    // not part of the MSRP protocol so it lives here.
    unreadByConversation: Ref<UnreadCounts>
}

export interface VsipAPIActions {
    // ---------- Shared connection lifecycle ----------
    init (
        connectOptions: ConnectOptions,
        pnExtraHeaders?: PnExtraHeaders,
        opensipsConfiguration?: Partial<IOpenSIPSConfiguration>,
        logger?: CustomLoggerType
    ): Promise<OpenSIPSJS>
    register (): void
    unregister (): void
    disconnect (): void

    // ---------- MSRP session ----------
    initMSRP (options?: object): void
    initMSRPAndSendMessage (target: string, body: string, options?: object): void
    msrpAnswer (callId: string): void
    messageTerminate (callId: string): void
    sendMSRP (msrpSessionId: string, body: string): void
    safeSendMSRP (body: string): boolean

    // ---------- MSRP - one method per UI action ----------
    sendCreateConversationMessage (targetSip: string | string[]): boolean
    sendTextMessage (conversationKey: string, text: string): boolean
    sendMediaMessage (
        conversationKey: string,
        uploadResult: MSRPUploadResult,
        caption?: string
    ): boolean
    sendReaction (conversationKey: string, targetEventId: string, emoji: string): boolean
    sendTypingIndicator (conversationKey: string, isTyping: boolean): boolean
    startTypingKeepAlive (conversationKey: string): void
    stopTypingKeepAlive (sendStop?: boolean): void
    sendReadReceipt (conversationKey: string): boolean
    closeConversation (conversationKey: string, reason?: string, cause?: string): boolean
    changeMemberRole (conversationKey: string, targetUri: string, newRole: MSRPMemberRole): boolean
    acceptInvite (conversationKey: string): boolean
    rejectInvite (conversationKey: string): boolean
    leaveConversation (conversationKey: string): boolean
    setActiveConversation (conversationKey: string | null): void
    requestUploadUrl (
        conversationKey: string,
        filename: string,
        mimeType: string,
        fileSize: number
    ): Promise<MSRPUploadResult>
    requestFileAccess (conversationKey: string, eventId: string): Promise<string>
    uploadFile (conversationKey: string, file: File, caption?: string): Promise<MSRPUploadResult>
}

export interface VsipAPI {
    state: VsipAPIState
    actions: VsipAPIActions
}
