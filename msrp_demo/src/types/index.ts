import type { ComputedRef, Ref } from 'vue'
import type {
    CustomLoggerType,
    IOpenSIPSConfiguration
} from '../../../src/types/rtc'
import type { IMessage } from '../../../src/types/msrp'
import type {
    MSRPConversationRef,
    MSRPConversationState,
    MSRPMemberRole,
    MSRPReactionAction,
    MSRPSendMessageOptions,
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

export interface MSRPPresenceState {
    presence: string | null
    lastActiveAt: number | null
    updatedAt: number
}

export interface VsipAPIState {
    isInitialized: Ref<boolean>
    isOpenSIPSReady: Ref<boolean>
    isOpenSIPSReconnecting: Ref<boolean>
    isMSRPInitializing: Ref<boolean>
    currentMsrpSession: Ref<IMessage | null>
    hasActiveMsrpSession: ComputedRef<boolean>
    conversations: Ref<{ [conversationId: string]: MSRPConversationState }>
    messagesByConversation: Ref<{ [conversationId: string]: any[] }>
    currentConversationId: Ref<string | null>
    currentConversation: ComputedRef<MSRPConversationState | null>
    currentMessages: ComputedRef<any[]>
    sortedConversations: ComputedRef<MSRPConversationState[]>
    typingByConversation: Ref<{ [conversationId: string]: MSRPTypingState }>
    presenceBySender: Ref<{ [sender: string]: MSRPPresenceState }>
    /**
     * Per-conversation unread count, derived from
     * `MSRPConversationState.currentUserLastReadMessageId` + local timeline.
     * Only conversations with count > 0 appear in the map.
     */
    unreadByConversation: ComputedRef<UnreadCounts>
    /**
     * event_id of the first unread message per conversation. Consumers use
     * this to place a "— New messages —" divider inside the open chat.
     */
    firstUnreadByConversation: ComputedRef<Record<string, string>>
}

export interface VsipAPIActions {
    init (
        connectOptions: ConnectOptions,
        pnExtraHeaders?: PnExtraHeaders,
        opensipsConfiguration?: Partial<IOpenSIPSConfiguration>,
        logger?: CustomLoggerType
    ): Promise<OpenSIPSJS>
    register (): void
    unregister (): void
    disconnect (): void
    initMSRP (options?: object): void
    initMSRPAndSendMessage (target: string, body: string, options?: object): void
    msrpAnswer (callId: string): void
    messageTerminate (callId: string): void
    sendMSRP (msrpSessionId: string, body: string): void
    safeSendMSRP (body: string): boolean
    sendCreateConversationMessage (targetSip: string | string[]): boolean
    sendTextMessage (conversationRef: MSRPConversationRef, text: string, options?: MSRPSendMessageOptions): boolean
    sendInternalNote (
        conversationRef: MSRPConversationRef,
        text: string,
        options?: Omit<MSRPSendMessageOptions, 'messageType'>
    ): boolean
    editMessage (conversationRef: MSRPConversationRef, targetEventId: string, newText: string): boolean
    deleteMessage (conversationRef: MSRPConversationRef, targetEventId: string): boolean
    forwardMessage (
        sourceMessage: any,
        targetConversationRef: MSRPConversationRef,
        forwardedFromLabel?: string
    ): boolean
    sendMediaMessage (
        conversationRef: MSRPConversationRef,
        uploadResult: MSRPUploadResult,
        caption?: string
    ): boolean
    sendReaction (
        conversationRef: MSRPConversationRef,
        targetEventId: string,
        emoji: string,
        action?: MSRPReactionAction
    ): boolean
    removeReaction (conversationRef: MSRPConversationRef, targetEventId: string, emoji: string): boolean
    sendTypingIndicator (conversationRef: MSRPConversationRef): boolean
    startTypingKeepAlive (conversationRef: MSRPConversationRef): void
    stopTypingKeepAlive (): void
    /**
     * Mark the whole conversation as unread (server-side pointer → null).
     */
    markConversationAsUnread (conversationRef: MSRPConversationRef): boolean
    /**
     * Mark the given message and every later message as unread. The pointer
     * is moved to the message immediately preceding `targetEventId` in the
     * local timeline; if the target is the very first message the pointer
     * becomes null (whole conversation unread).
     */
    markAsUnreadFromMessage (conversationRef: MSRPConversationRef, targetEventId: string): boolean
    closeConversation (conversationRef: MSRPConversationRef, reason?: string, cause?: string): boolean
    changeMemberRole (conversationRef: MSRPConversationRef, targetUri: string, newRole: MSRPMemberRole): boolean
    acceptInvite (conversationRef: MSRPConversationRef): boolean
    rejectInvite (conversationRef: MSRPConversationRef): boolean
    leaveConversation (conversationRef: MSRPConversationRef): boolean
    setActiveConversation (conversationId: string | null): void
    requestUploadUrl (
        conversationRef: MSRPConversationRef,
        filename: string,
        mimeType: string,
        fileSize: number
    ): Promise<MSRPUploadResult>
    requestFileAccess (conversationRef: MSRPConversationRef, eventId: string): Promise<string>
    uploadFile (conversationRef: MSRPConversationRef, file: File, caption?: string): Promise<MSRPUploadResult>
}

export interface VsipAPI {
    state: VsipAPIState
    actions: VsipAPIActions
}
