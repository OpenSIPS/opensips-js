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
    isInitialized: Ref<boolean>
    isOpenSIPSReady: Ref<boolean>
    isOpenSIPSReconnecting: Ref<boolean>
    isMSRPInitializing: Ref<boolean>
    currentMsrpSession: Ref<IMessage | null>
    hasActiveMsrpSession: ComputedRef<boolean>
    conversations: Ref<{ [key: string]: MSRPConversationState }>
    messagesByConversation: Ref<{ [conversationKey: string]: any[] }>
    currentConversationKey: Ref<string | null>
    currentConversation: ComputedRef<MSRPConversationState | null>
    currentMessages: ComputedRef<any[]>
    sortedConversations: ComputedRef<MSRPConversationState[]>
    typingByConversation: Ref<{ [conversationKey: string]: MSRPTypingState }>
    unreadByConversation: Ref<UnreadCounts>
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
