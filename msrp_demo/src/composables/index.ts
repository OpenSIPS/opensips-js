import { computed, ref } from 'vue'

import OpenSIPSJS from '../../../src/index'
import type {
    CustomLoggerType,
    IOpenSIPSConfiguration,
    IOpenSIPSJSOptions
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
import { MSRP_EVT } from '../../../src/modules/msrp'

import type {
    ConnectOptions,
    MSRPPresenceState,
    MSRPTypingState,
    PnExtraHeaders,
    UnreadCounts,
    VsipAPI
} from '../types'

let openSIPSJS: OpenSIPSJS | undefined = undefined
// Current user's SIP URI, captured at connect time. Used to detect the viewer's
// own messages/reactions without reaching into jssip UA internals.
let currentUserUri = ''

const isInitialized = ref<boolean>(false)
const isOpenSIPSReady = ref<boolean>(false)
const isOpenSIPSReconnecting = ref<boolean>(false)

const currentMsrpSession = ref<IMessage | null>(null)
const isMSRPInitializing = ref<boolean>(false)

const conversations = ref<{ [conversationId: string]: MSRPConversationState }>({})
const messagesByConversation = ref<{ [conversationId: string]: any[] }>({})
const typingByConversation = ref<{ [conversationId: string]: MSRPTypingState }>({})
const presenceBySender = ref<{ [sender: string]: MSRPPresenceState }>({})

const currentConversationId = ref<string | null>(null)
const unreadByConversation = ref<UnreadCounts>({})

const hasActiveMsrpSession = computed(() => currentMsrpSession.value !== null)

const currentConversation = computed<MSRPConversationState | null>(() => {
    const id = currentConversationId.value
    if (!id) return null
    return conversations.value[id] ?? null
})

const currentMessages = computed<any[]>(() => {
    const id = currentConversationId.value
    if (!id) return []
    return messagesByConversation.value[id] ?? []
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

function idKey (id: number | null | undefined): string | null {
    return id === undefined || id === null ? null : String(id)
}

function resolveLastEventId (conversationId: string): string | null {
    const messages = messagesByConversation.value[conversationId]
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
        currentConversationId,
        currentConversation,
        currentMessages,
        sortedConversations,
        typingByConversation,
        presenceBySender,
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

                    currentUserUri = `sip:${connectOptions.username}@${connectOptions.domain}`

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
                            const cid = idKey(payload.conversation.conversation_id)
                            if (!cid) return
                            conversations.value = {
                                ...conversations.value,
                                [cid]: payload.conversation
                            }
                            if (!messagesByConversation.value[cid]) {
                                messagesByConversation.value = {
                                    ...messagesByConversation.value,
                                    [cid]: []
                                }
                            }
                        })
                        .on('msrpConversationRemoved', (payload) => {
                            const cid = idKey(payload.conversation_id)
                            if (!cid) return
                            if (cid in conversations.value) {
                                const next = { ...conversations.value }
                                delete next[cid]
                                conversations.value = next
                            }
                            if (cid in messagesByConversation.value) {
                                const nextMsgs = { ...messagesByConversation.value }
                                delete nextMsgs[cid]
                                messagesByConversation.value = nextMsgs
                            }
                            if (unreadByConversation.value[cid]) {
                                const u = { ...unreadByConversation.value }
                                delete u[cid]
                                unreadByConversation.value = u
                            }
                        })
                        .on('msrpConversationUpdated', (payload) => {
                            const cid = idKey(payload.conversation_id)
                            if (!cid) return
                            const c = conversations.value[cid]
                            if (!c) return
                            Object.assign(c, payload.patch)
                        })
                        .on('msrpMessageAdded', (payload) => {
                            const cid = idKey(payload.conversation_id)
                            if (!cid) return
                            const c = conversations.value[cid]
                            if (!c) return
                            // Ensure the message bucket exists - it may not
                            // if the message arrives before a sync.
                            if (!messagesByConversation.value[cid]) {
                                messagesByConversation.value[cid] = []
                            }
                            messagesByConversation.value[cid].push(payload.message)
                            c.updated_at = payload.message.origin_server_ts || Date.now()

                            if (cid === currentConversationId.value) return
                            if (payload.message?.sender && payload.message.sender === currentUserUri) return
                            unreadByConversation.value = {
                                ...unreadByConversation.value,
                                [cid]:
                                    (unreadByConversation.value[cid] || 0) + 1
                            }
                        })
                        .on('msrpReceiptChanged', (payload) => {
                            const cid = idKey(payload.conversation_id)
                            if (!cid) return
                            const messages = messagesByConversation.value[cid]
                            if (messages) {
                                const m = findMessage(messages, payload.eventId)
                                if (m?.content) m.content.status = payload.status
                            }
                            const c = conversations.value[cid]
                            if (c) c.updated_at = payload.updatedAt
                        })
                        .on('msrpReactionChanged', (payload) => {
                            const cid = idKey(payload.conversation_id)
                            if (!cid) return
                            const messages = messagesByConversation.value[cid]
                            if (messages) {
                                const m = findMessage(messages, payload.eventId)
                                applyReaction(m, payload.emoji, payload.action, payload.sender, currentUserUri)
                                if (m?.content) m.content.updated_at = payload.updatedAt
                            }
                            const c = conversations.value[cid]
                            if (c) c.updated_at = payload.updatedAt
                        })
                        .on('msrpMessageEdited', (payload) => {
                            const cid = idKey(payload.conversation_id)
                            if (!cid) return
                            const messages = messagesByConversation.value[cid]
                            if (messages) {
                                const m = findMessage(messages, payload.eventId)
                                if (m?.content) {
                                    const newText = payload.newContent?.content
                                    if (typeof newText === 'string') m.content.content = newText
                                    m.content.edited_at = payload.updatedAt
                                    // Mirror the backend aggregation so relation-aware
                                    // consumers can read the latest replacement.
                                    m.unsigned = m.unsigned || {}
                                    m.unsigned['m.relations'] = {
                                        'm.replace': {
                                            event_id: payload.editEvent?.event_id,
                                            sender: payload.editEvent?.sender,
                                            origin_server_ts: payload.updatedAt,
                                            content: payload.newContent
                                        }
                                    }
                                }
                            }
                            const c = conversations.value[cid]
                            if (c) c.updated_at = payload.updatedAt
                        })
                        .on('msrpMessageDeleted', (payload) => {
                            const cid = idKey(payload.conversation_id)
                            if (!cid) return
                            const messages = messagesByConversation.value[cid]
                            if (messages) {
                                const m = findMessage(messages, payload.eventId)
                                if (m?.content) {
                                    m.content.is_deleted = true
                                    m.content.deleted_at = payload.updatedAt
                                    m.content.deleted_by = payload.deletedBy
                                }
                            }
                            const c = conversations.value[cid]
                            if (c) c.updated_at = payload.updatedAt
                        })
                        .on('msrpTyping', (payload: { conversation_id?: number, sender: string, isTyping: boolean }) => {
                            const cid = idKey(payload.conversation_id)
                            if (!cid) return
                            if (payload.isTyping) {
                                typingByConversation.value = {
                                    ...typingByConversation.value,
                                    [cid]: {
                                        sender: payload.sender,
                                        isTyping: true,
                                        updatedAt: Date.now()
                                    }
                                }
                            } else {
                                const next = { ...typingByConversation.value }
                                delete next[cid]
                                typingByConversation.value = next
                            }
                        })
                        .on('msrpPresence', (payload) => {
                            if (!payload?.sender) return
                            presenceBySender.value = {
                                ...presenceBySender.value,
                                [payload.sender]: {
                                    presence: payload.presence,
                                    lastActiveAt: payload.lastActiveAt,
                                    updatedAt: payload.updatedAt
                                }
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
        sendTextMessage (conversationRef: MSRPConversationRef, text: string, options: MSRPSendMessageOptions = {}) {
            return openSIPSJS?.msrp.sendTextMessage(conversationRef, text, options) ?? false
        },
        sendInternalNote (conversationRef: MSRPConversationRef, text: string, options: Omit<MSRPSendMessageOptions, 'messageType'> = {}) {
            return openSIPSJS?.msrp.sendInternalNote(conversationRef, text, options) ?? false
        },
        editMessage (conversationRef: MSRPConversationRef, targetEventId: string, newText: string) {
            return openSIPSJS?.msrp.editMessage(conversationRef, targetEventId, newText) ?? false
        },
        deleteMessage (conversationRef: MSRPConversationRef, targetEventId: string) {
            return openSIPSJS?.msrp.deleteMessage(conversationRef, targetEventId) ?? false
        },
        sendMediaMessage (conversationRef: MSRPConversationRef, uploadResult: MSRPUploadResult, caption = '') {
            return openSIPSJS?.msrp.sendMediaMessage(conversationRef, uploadResult, caption) ?? false
        },
        sendReaction (conversationRef: MSRPConversationRef, targetEventId: string, emoji: string, action: MSRPReactionAction = 'add') {
            return openSIPSJS?.msrp.sendReaction(conversationRef, targetEventId, emoji, action) ?? false
        },
        removeReaction (conversationRef: MSRPConversationRef, targetEventId: string, emoji: string) {
            return openSIPSJS?.msrp.removeReaction(conversationRef, targetEventId, emoji) ?? false
        },
        sendTypingIndicator (conversationRef: MSRPConversationRef, isTyping: boolean) {
            return openSIPSJS?.msrp.sendTypingIndicator(conversationRef, isTyping) ?? false
        },
        startTypingKeepAlive (conversationRef: MSRPConversationRef) {
            openSIPSJS?.msrp.startTypingKeepAlive(conversationRef)
        },
        stopTypingKeepAlive (sendStop = true) {
            openSIPSJS?.msrp.stopTypingKeepAlive(sendStop)
        },
        sendReadReceipt (conversationRef: MSRPConversationRef) {
            const conversationId = idKey(Number(conversationRef))
            if (!conversationId) return false
            const lastEventId = resolveLastEventId(conversationId)
            if (!lastEventId) return false
            return openSIPSJS?.msrp.sendReadReceipt(conversationRef, lastEventId) ?? false
        },
        closeConversation (conversationRef: MSRPConversationRef, reason?: string, cause?: string) {
            return openSIPSJS?.msrp.closeConversation(conversationRef, reason, cause) ?? false
        },
        changeMemberRole (conversationRef: MSRPConversationRef, targetUri: string, newRole: MSRPMemberRole) {
            return openSIPSJS?.msrp.changeMemberRole(conversationRef, targetUri, newRole) ?? false
        },
        acceptInvite (conversationRef: MSRPConversationRef) {
            return openSIPSJS?.msrp.acceptInvite(conversationRef) ?? false
        },
        rejectInvite (conversationRef: MSRPConversationRef) {
            return openSIPSJS?.msrp.rejectInvite(conversationRef) ?? false
        },
        leaveConversation (conversationRef: MSRPConversationRef) {
            return openSIPSJS?.msrp.leaveConversation(conversationRef) ?? false
        },
        setActiveConversation (conversationId: string | null) {
            if (currentConversationId.value === conversationId) return
            currentConversationId.value = conversationId
            if (conversationId) {
                const lastEventId = resolveLastEventId(conversationId)
                if (lastEventId) {
                    openSIPSJS?.msrp.sendReadReceipt(conversationId, lastEventId)
                }
                if (unreadByConversation.value[conversationId]) {
                    const next = { ...unreadByConversation.value }
                    delete next[conversationId]
                    unreadByConversation.value = next
                }
            }
        },
        requestUploadUrl (conversationRef: MSRPConversationRef, filename: string, mimeType: string, fileSize: number) {
            if (!openSIPSJS) return Promise.reject(new Error('OpenSIPSJS not initialized'))
            return openSIPSJS.msrp.requestUploadUrl(conversationRef, filename, mimeType, fileSize)
        },
        requestFileAccess (conversationRef: MSRPConversationRef, eventId: string) {
            if (!openSIPSJS) return Promise.reject(new Error('OpenSIPSJS not initialized'))
            return openSIPSJS.msrp.requestFileAccess(conversationRef, eventId)
        },
        uploadFile (conversationRef: MSRPConversationRef, file: File, caption = '') {
            if (!openSIPSJS) return Promise.reject(new Error('OpenSIPSJS not initialized'))
            return openSIPSJS.msrp.uploadFile(conversationRef, file, caption)
        }
    }
}
