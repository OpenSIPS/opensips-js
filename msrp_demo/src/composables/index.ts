import { computed, ref } from 'vue'

import OpenSIPSJS from '../../../src/index'
import type {
    CustomLoggerType,
    IOpenSIPSConfiguration,
    IOpenSIPSJSOptions
} from '../../../src/types/rtc'
import type { IMessage } from '../../../src/types/msrp'
import type {
    MSRPConversationState,
    MSRPMemberRole,
    MSRPUploadResult
} from '../../../src/modules/msrp'
import { MSRP_EVT } from '../../../src/modules/msrp'

import type {
    ConnectOptions,
    MSRPTypingState,
    PnExtraHeaders,
    UnreadCounts,
    VsipAPI
} from '../types'

let openSIPSJS: OpenSIPSJS | undefined = undefined

const isInitialized = ref<boolean>(false)
const isOpenSIPSReady = ref<boolean>(false)
const isOpenSIPSReconnecting = ref<boolean>(false)

const currentMsrpSession = ref<IMessage | null>(null)
const isMSRPInitializing = ref<boolean>(false)

const conversations = ref<{ [key: string]: MSRPConversationState }>({})
const messagesByConversation = ref<{ [conversationKey: string]: any[] }>({})
const typingByConversation = ref<{ [conversationKey: string]: MSRPTypingState }>({})

const currentConversationKey = ref<string | null>(null)
const unreadByConversation = ref<UnreadCounts>({})

const hasActiveMsrpSession = computed(() => currentMsrpSession.value !== null)

const currentConversation = computed<MSRPConversationState | null>(() => {
    const key = currentConversationKey.value
    if (!key) return null
    return conversations.value[key] ?? null
})

const currentMessages = computed<any[]>(() => {
    const key = currentConversationKey.value
    if (!key) return []
    return messagesByConversation.value[key] ?? []
})

const sortedConversations = computed<MSRPConversationState[]>(() => {
    return Object.values(conversations.value).sort(
        (a, b) => (b.updated_at || 0) - (a.updated_at || 0)
    )
})

// LOCAL HELPERS
function findMessage (messages: any[], eventId: string) {
    return messages.find((msg: any) => msg.event_id === eventId)
}

function applyReaction (
    target: any,
    emoji: string,
    action: 'add' | 'remove',
    sender: string,
    viewerUri: string
): void {
    if (!target?.content) return
    if (!Array.isArray(target.content.reactions_summary)) {
        target.content.reactions_summary = []
    }
    const summary = target.content.reactions_summary as any[]
    // Lookup tolerates legacy entries that used `key` instead of `emoji`.
    const existing = summary.find((r) => (r?.emoji || r?.key) === emoji)

    if (action === 'remove') {
        if (!existing) return
        const userIds: string[] = Array.isArray(existing.user_ids) ? existing.user_ids : []
        if (!userIds.includes(sender)) return
        existing.user_ids = userIds.filter((u) => u !== sender)
        existing.count = existing.user_ids.length
        if (existing.count === 0) {
            target.content.reactions_summary = summary.filter(
                (r) => (r?.emoji || r?.key) !== emoji
            )
            return
        }
        existing.viewer_reacted = existing.user_ids.includes(viewerUri)
        return
    }

    if (existing) {
        const userIds: string[] = Array.isArray(existing.user_ids) ? existing.user_ids : []
        if (userIds.includes(sender)) return
        existing.user_ids = [ ...userIds, sender ]
        existing.count = existing.user_ids.length
        if (!existing.emoji) existing.emoji = emoji
        existing.viewer_reacted = existing.user_ids.includes(viewerUri)
        return
    }

    summary.push({
        emoji,
        count: 1,
        user_ids: [ sender ],
        viewer_reacted: sender === viewerUri
    })
}

function resolveLastEventId (conversationKey: string): string | null {
    const messages = messagesByConversation.value[conversationKey]
    if (!messages?.length) return null
    const lastMsg = [ ...messages ]
        .filter((m: any) => m.type === MSRP_EVT.MESSAGE && m.event_id)
        .sort((a: any, b: any) => (a.origin_server_ts || 0) - (b.origin_server_ts || 0))
        .pop()
    return lastMsg?.event_id ?? null
}

export const vsipAPI: VsipAPI = {
    state: {
        isInitialized,
        isOpenSIPSReady,
        isOpenSIPSReconnecting,
        isMSRPInitializing,
        currentMsrpSession,
        hasActiveMsrpSession,
        conversations,
        messagesByConversation,
        currentConversationKey,
        currentConversation,
        currentMessages,
        sortedConversations,
        typingByConversation,
        unreadByConversation
    },
    actions: {
        init (
            connectOptions: ConnectOptions,
            pnExtraHeaders?: PnExtraHeaders,
            opensipsConfiguration: Partial<IOpenSIPSConfiguration> = {},
            logger?: CustomLoggerType
        ) {
            return new Promise<OpenSIPSJS>((resolve, reject) => {
                try {
                    const configuration: IOpenSIPSConfiguration = {
                        ...opensipsConfiguration,
                        session_timers: false,
                        uri: `sip:${connectOptions.username}@${connectOptions.domain}`,
                        password: connectOptions.password
                    }

                    if (connectOptions.authorization_jwt) {
                        configuration.authorization_jwt = connectOptions.authorization_jwt
                    }

                    const additionalOptions: Partial<IOpenSIPSJSOptions> = {}

                    if (connectOptions.msrpDomain) {
                        additionalOptions.msrpDomain = connectOptions.msrpDomain
                    }

                    if (connectOptions.msrpWs) {
                        additionalOptions.msrpWs = connectOptions.msrpWs
                    }

                    openSIPSJS = new OpenSIPSJS({
                        configuration,
                        socketInterfaces: [ `wss://${connectOptions.domain}` ],
                        sipDomain: `${connectOptions.domain}`,
                        sipOptions: {
                            session_timers: false,
                            extraHeaders: [ 'X-Bar: bar' ],
                            pcConfig: {}
                        },
                        modules: connectOptions.modules,
                        pnExtraHeaders,
                        ...additionalOptions
                    }, logger)

                    openSIPSJS
                        .on('connection', (value: boolean) => {
                            isInitialized.value = true
                            isOpenSIPSReady.value = value

                            resolve(openSIPSJS as OpenSIPSJS)
                        })
                        .on('reconnecting', (value: boolean) => {
                            isOpenSIPSReconnecting.value = value
                        })
                        .on('changeMsrpSession', (session: IMessage | null) => {
                            currentMsrpSession.value = session
                        })
                        .on('isMSRPInitializingChanged', (value: boolean) => {
                            isMSRPInitializing.value = value
                        })
                        .on('msrpSyncCompleted', (payload) => {
                            conversations.value = { ...payload.conversations }
                            messagesByConversation.value = { ...(payload.messagesByConversation ?? {}) }

                            const nextUnread: UnreadCounts = {}
                            for (const k of Object.keys(unreadByConversation.value)) {
                                if (payload.conversations[k]) nextUnread[k] = unreadByConversation.value[k]
                            }
                            unreadByConversation.value = nextUnread
                        })
                        .on('msrpConversationCreated', (payload) => {
                            conversations.value = {
                                ...conversations.value,
                                [payload.conversationKey]: payload.conversation
                            }
                            if (!messagesByConversation.value[payload.conversationKey]) {
                                messagesByConversation.value = {
                                    ...messagesByConversation.value,
                                    [payload.conversationKey]: []
                                }
                            }
                        })
                        .on('msrpConversationRemoved', (payload) => {
                            if (payload.conversationKey in conversations.value) {
                                const next = { ...conversations.value }
                                delete next[payload.conversationKey]
                                conversations.value = next
                            }
                            if (payload.conversationKey in messagesByConversation.value) {
                                const nextMsgs = { ...messagesByConversation.value }
                                delete nextMsgs[payload.conversationKey]
                                messagesByConversation.value = nextMsgs
                            }
                            if (unreadByConversation.value[payload.conversationKey]) {
                                const u = { ...unreadByConversation.value }
                                delete u[payload.conversationKey]
                                unreadByConversation.value = u
                            }
                        })
                        .on('msrpConversationUpdated', (payload) => {
                            const c = conversations.value[payload.conversationKey]
                            if (!c) return
                            Object.assign(c, payload.patch)
                        })
                        .on('msrpMessageAdded', (payload) => {
                            const c = conversations.value[payload.conversationKey]
                            if (!c) return
                            // Ensure the message bucket exists - it may not
                            // if the message arrives before a sync.
                            if (!messagesByConversation.value[payload.conversationKey]) {
                                messagesByConversation.value[payload.conversationKey] = []
                            }
                            messagesByConversation.value[payload.conversationKey].push(payload.message)
                            c.updated_at = payload.message.origin_server_ts || Date.now()

                            if (payload.conversationKey === currentConversationKey.value) return
                            const myUri = openSIPSJS?.configuration?.uri?.toString?.() ?? ''
                            if (payload.message?.sender && payload.message.sender === myUri) return
                            unreadByConversation.value = {
                                ...unreadByConversation.value,
                                [payload.conversationKey]:
                                    (unreadByConversation.value[payload.conversationKey] || 0) + 1
                            }
                        })
                        .on('msrpReceiptChanged', (payload) => {
                            const messages = messagesByConversation.value[payload.conversationKey]
                            if (messages) {
                                const m = findMessage(messages, payload.eventId)
                                if (m?.content) m.content.status = payload.status
                            }
                            const c = conversations.value[payload.conversationKey]
                            if (c) c.updated_at = payload.updatedAt
                        })
                        .on('msrpReactionChanged', (payload) => {
                            const messages = messagesByConversation.value[payload.conversationKey]
                            if (messages) {
                                const m = findMessage(messages, payload.eventId)
                                const viewerUri = openSIPSJS?.configuration?.uri?.toString?.() ?? ''
                                applyReaction(m, payload.emoji, payload.action, payload.sender, viewerUri)
                                if (m?.content) m.content.updated_at = payload.updatedAt
                            }
                            const c = conversations.value[payload.conversationKey]
                            if (c) c.updated_at = payload.updatedAt
                        })
                        .on('msrpTyping', (payload: { conversationKey: string, sender: string, isTyping: boolean }) => {
                            if (payload.isTyping) {
                                typingByConversation.value = {
                                    ...typingByConversation.value,
                                    [payload.conversationKey]: {
                                        sender: payload.sender,
                                        isTyping: true,
                                        updatedAt: Date.now()
                                    }
                                }
                            } else {
                                const next = { ...typingByConversation.value }
                                delete next[payload.conversationKey]
                                typingByConversation.value = next
                            }
                        })
                        .begin()

                    resolve(openSIPSJS)
                } catch (e) {
                    console.error(e)

                    reject(e)
                }
            })
        },
        unregister () {
            openSIPSJS?.unregister()
        },
        register () {
            openSIPSJS?.register()
        },
        disconnect () {
            openSIPSJS?.disconnect()
        },
        initMSRP (options: object = {}) {
            openSIPSJS?.msrp.initMSRP(options)
        },
        initMSRPAndSendMessage (target: string, body: string, options: object = {}) {
            openSIPSJS?.msrp.initMSRPAndSendMessage(target, body, options)
        },
        msrpAnswer (callId: string) {
            openSIPSJS?.msrp.msrpAnswer(callId)
        },
        messageTerminate (callId: string) {
            openSIPSJS?.msrp.messageTerminate(callId)
        },
        sendMSRP (msrpSessionId: string, body: string) {
            openSIPSJS?.msrp.sendMSRP(msrpSessionId, body)
        },
        safeSendMSRP (body: string) {
            return openSIPSJS?.msrp.safeSendMSRP(body) ?? false
        },
        sendCreateConversationMessage (targetSip: string | string[]) {
            return openSIPSJS?.msrp.sendCreateConversationMessage(targetSip) ?? false
        },
        sendTextMessage (conversationKey: string, text: string) {
            return openSIPSJS?.msrp.sendTextMessage(conversationKey, text) ?? false
        },
        sendMediaMessage (conversationKey: string, uploadResult: MSRPUploadResult, caption = '') {
            return openSIPSJS?.msrp.sendMediaMessage(conversationKey, uploadResult, caption) ?? false
        },
        sendReaction (conversationKey: string, targetEventId: string, emoji: string) {
            return openSIPSJS?.msrp.sendReaction(conversationKey, targetEventId, emoji) ?? false
        },
        sendTypingIndicator (conversationKey: string, isTyping: boolean) {
            return openSIPSJS?.msrp.sendTypingIndicator(conversationKey, isTyping) ?? false
        },
        startTypingKeepAlive (conversationKey: string) {
            openSIPSJS?.msrp.startTypingKeepAlive(conversationKey)
        },
        stopTypingKeepAlive (sendStop = true) {
            openSIPSJS?.msrp.stopTypingKeepAlive(sendStop)
        },
        sendReadReceipt (conversationKey: string) {
            const lastEventId = resolveLastEventId(conversationKey)
            if (!lastEventId) return false
            return openSIPSJS?.msrp.sendReadReceipt(conversationKey, lastEventId) ?? false
        },
        closeConversation (conversationKey: string, reason?: string, cause?: string) {
            return openSIPSJS?.msrp.closeConversation(conversationKey, reason, cause) ?? false
        },
        changeMemberRole (conversationKey: string, targetUri: string, newRole: MSRPMemberRole) {
            return openSIPSJS?.msrp.changeMemberRole(conversationKey, targetUri, newRole) ?? false
        },
        acceptInvite (conversationKey: string) {
            return openSIPSJS?.msrp.acceptInvite(conversationKey) ?? false
        },
        rejectInvite (conversationKey: string) {
            return openSIPSJS?.msrp.rejectInvite(conversationKey) ?? false
        },
        leaveConversation (conversationKey: string) {
            return openSIPSJS?.msrp.leaveConversation(conversationKey) ?? false
        },
        setActiveConversation (conversationKey: string | null) {
            if (currentConversationKey.value === conversationKey) return
            currentConversationKey.value = conversationKey
            if (conversationKey) {
                const lastEventId = resolveLastEventId(conversationKey)
                if (lastEventId) {
                    openSIPSJS?.msrp.sendReadReceipt(conversationKey, lastEventId)
                }
                if (unreadByConversation.value[conversationKey]) {
                    const next = { ...unreadByConversation.value }
                    delete next[conversationKey]
                    unreadByConversation.value = next
                }
            }
        },
        requestUploadUrl (conversationKey: string, filename: string, mimeType: string, fileSize: number) {
            if (!openSIPSJS) return Promise.reject(new Error('OpenSIPSJS not initialized'))
            return openSIPSJS.msrp.requestUploadUrl(conversationKey, filename, mimeType, fileSize)
        },
        requestFileAccess (conversationKey: string, eventId: string) {
            if (!openSIPSJS) return Promise.reject(new Error('OpenSIPSJS not initialized'))
            return openSIPSJS.msrp.requestFileAccess(conversationKey, eventId)
        },
        uploadFile (conversationKey: string, file: File, caption = '') {
            if (!openSIPSJS) return Promise.reject(new Error('OpenSIPSJS not initialized'))
            return openSIPSJS.msrp.uploadFile(conversationKey, file, caption)
        }
    }
}
