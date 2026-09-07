import { computed, ref, watch } from 'vue'

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
    MSRPTag,
    MSRPTagAction,
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

const hideError = ref<string>('')

const HIDE_ECHO_TIMEOUT_MS = 5000
const pendingHides = new Map<string, {
    cid: string
    eventId: string
    snapshot: any
    index: number
    timer: ReturnType<typeof setTimeout>
}>()

function pendingHideKey (cid: string, eventId: string): string {
    return `${cid}:${eventId}`
}

function replaceConversationMessages (cid: string, next: any[]): void {
    messagesByConversation.value = {
        ...messagesByConversation.value,
        [cid]: next
    }
}

function clearPendingHide (cid: string, eventId: string): void {
    const key = pendingHideKey(cid, eventId)
    const pending = pendingHides.get(key)
    if (!pending) return
    clearTimeout(pending.timer)
    pendingHides.delete(key)
}

function restoreHiddenMessage (cid: string, eventId: string): void {
    const key = pendingHideKey(cid, eventId)
    const pending = pendingHides.get(key)
    if (!pending) return
    clearTimeout(pending.timer)
    pendingHides.delete(key)
    const list = messagesByConversation.value[cid]
    if (!list) {
        replaceConversationMessages(cid, [ pending.snapshot ])
        return
    }
    if (list.some((m: any) => m?.event_id === eventId)) return
    const insertAt = Math.min(Math.max(pending.index, 0), list.length)
    const next = [ ...list ]
    next.splice(insertAt, 0, pending.snapshot)
    replaceConversationMessages(cid, next)
}

const hasActiveMsrpSession = computed(() => currentMsrpSession.value !== null)

function onlyRealMessages (list: any[] | undefined) {
    if (!list?.length) return [] as any[]
    return list.filter((e: any) => e?.type === MSRP_EVT.MESSAGE)
}

function findLastIndexByEventId (list: any[], eventId: string): number {
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i]?.event_id === eventId) return i
    }
    return -1
}

function sortMessagesByTimestamp (list: any[]): any[] {
    return [ ...list ].sort(
        (a, b) => (a?.origin_server_ts || 0) - (b?.origin_server_ts || 0)
    )
}

function normalizeTagName (name: unknown): string {
    return typeof name === 'string' ? name.trim().toLowerCase() : ''
}

function applyTag (
    tags: MSRPTag[] | undefined,
    action: MSRPTagAction,
    tag: MSRPTag
): MSRPTag[] {
    const name = normalizeTagName(tag?.name)
    const list = Array.isArray(tags) ? [ ...tags ] : []
    if (!name) return list
    if (action === 'remove') {
        return list.filter((t) => normalizeTagName(t.name) !== name)
    }
    if (list.some((t) => normalizeTagName(t.name) === name)) return list
    return [ ...list, {
        ...tag,
        name
    } ]
}

function computeUnreadCount (
    messages: any[] | undefined,
    lastReadMessageId: string | null | undefined
): number {
    const real = onlyRealMessages(messages)
    if (!real.length) return 0
    if (lastReadMessageId === null) return real.length
    if (lastReadMessageId === undefined) return 0
    const idx = findLastIndexByEventId(real, lastReadMessageId)
    if (idx === -1) return real.length
    return real.length - idx - 1
}

function computeFirstUnreadEventId (
    messages: any[] | undefined,
    lastReadMessageId: string | null | undefined
): string | null {
    const real = onlyRealMessages(messages)
    if (!real.length) return null
    if (lastReadMessageId === null) return real[0]?.event_id ?? null
    if (lastReadMessageId === undefined) return null
    const idx = findLastIndexByEventId(real, lastReadMessageId)
    if (idx === -1) return real[0]?.event_id ?? null
    return real[idx + 1]?.event_id ?? null
}

const unreadByConversation = computed<UnreadCounts>(() => {
    const result: UnreadCounts = {}
    for (const [ cid, conv ] of Object.entries(conversations.value)) {
        const count = computeUnreadCount(
            messagesByConversation.value[cid],
            conv?.currentUserLastReadMessageId
        )
        if (count > 0) result[cid] = count
    }
    return result
})

const firstUnreadByConversation = computed<Record<string, string>>(() => {
    const result: Record<string, string> = {}
    for (const [ cid, conv ] of Object.entries(conversations.value)) {
        const eventId = computeFirstUnreadEventId(
            messagesByConversation.value[cid],
            conv?.currentUserLastReadMessageId
        )
        if (eventId) result[cid] = eventId
    }
    return result
})

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

const INCOMING_TYPING_EXPIRY_MS = 5000
const incomingTypingTimers = new Map<string, ReturnType<typeof setTimeout>>()

function typingTimerKey (cid: string, sender: string): string {
    return `${cid}:${sender}`
}

function clearTypingIndicator (cid: string, sender: string): void {
    const key = typingTimerKey(cid, sender)
    const existing = incomingTypingTimers.get(key)
    if (existing) {
        clearTimeout(existing)
        incomingTypingTimers.delete(key)
    }
    const current = typingByConversation.value[cid]
    if (current?.sender !== sender) return
    const next = { ...typingByConversation.value }
    delete next[cid]
    typingByConversation.value = next
}

function restartTypingTimeout (cid: string, sender: string): void {
    const key = typingTimerKey(cid, sender)
    const existing = incomingTypingTimers.get(key)
    if (existing) clearTimeout(existing)
    incomingTypingTimers.set(
        key,
        setTimeout(() => clearTypingIndicator(cid, sender), INCOMING_TYPING_EXPIRY_MS)
    )
}

function clearAllTypingTimersForConversation (cid: string): void {
    const prefix = `${cid}:`
    for (const key of incomingTypingTimers.keys()) {
        if (key.startsWith(prefix)) {
            clearTimeout(incomingTypingTimers.get(key)!)
            incomingTypingTimers.delete(key)
        }
    }
}

function clearAllTypingTimers (): void {
    incomingTypingTimers.forEach((handle) => clearTimeout(handle))
    incomingTypingTimers.clear()
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

let lastRequestedReadEventIdByConv: Record<string, string> = {}

const autoReadExclusions = new Set<string>()

watch(currentConversationId, (_newId, oldId) => {
    if (oldId) autoReadExclusions.delete(oldId)
})

watch(
    () => {
        const cid = currentConversationId.value
        if (!cid) return null
        if (autoReadExclusions.has(cid)) return null
        const conv = conversations.value[cid]
        if (!conv) return null
        const latestEventId = resolveLastEventId(cid)
        if (!latestEventId) return null
        return {
            cid,
            pointer: conv.currentUserLastReadMessageId,
            latestEventId
        }
    },
    (payload) => {
        if (!openSIPSJS || !payload) return
        const { cid, pointer, latestEventId } = payload
        if (pointer === latestEventId) return
        if (lastRequestedReadEventIdByConv[cid] === latestEventId) return
        lastRequestedReadEventIdByConv[cid] = latestEventId
        const ok = openSIPSJS.msrp.sendReadReceipt(cid, latestEventId)
        if (ok) applyOptimisticPointer(cid, latestEventId)
    },
    { immediate: true }
)

function applyOptimisticPointer (cid: string, pointerValue: string | null): void {
    const conv = conversations.value[cid]
    if (!conv) return
    if (conv.currentUserLastReadMessageId === pointerValue) return
    conv.currentUserLastReadMessageId = pointerValue
}

function beginUnreadOverride (cid: string): void {
    autoReadExclusions.add(cid)
    delete lastRequestedReadEventIdByConv[cid]
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
        unreadByConversation,
        firstUnreadByConversation,
        hideError
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
                        session_timers: false,
                        uri: `sip:${connectOptions.username}@${connectOptions.domain}`,
                        password: connectOptions.password,
                        ...opensipsConfiguration,
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
                            if (!session) {
                                clearAllTypingTimers()
                                typingByConversation.value = {}
                            }
                        })
                        .on('isMSRPInitializingChanged', (value: boolean) => {
                            isMSRPInitializing.value = value
                        })
                        .on('msrpSyncCompleted', (payload) => {
                            conversations.value = { ...payload.conversations }
                            const nextMessages = { ...messagesByConversation.value }
                            const incoming = payload.messagesByConversation ?? {}
                            for (const [ cid, historicalList ] of Object.entries(incoming)) {
                                const serverList = sortMessagesByTimestamp(historicalList as any[])
                                const pendingIds = new Set<string>()
                                for (const [ key, pending ] of pendingHides) {
                                    if (pending.cid !== cid) continue
                                    pendingIds.add(pending.eventId)
                                    const stillOnServer = serverList.some(
                                        (m: any) => m?.event_id === pending.eventId
                                    )
                                    if (!stillOnServer) {
                                        clearTimeout(pending.timer)
                                        pendingHides.delete(key)
                                    }
                                }
                                nextMessages[cid] = serverList.filter(
                                    (m: any) => !pendingIds.has(m?.event_id)
                                )
                            }
                            messagesByConversation.value = nextMessages
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
                            if (cid in lastRequestedReadEventIdByConv) {
                                const next = { ...lastRequestedReadEventIdByConv }
                                delete next[cid]
                                lastRequestedReadEventIdByConv = next
                            }
                            clearAllTypingTimersForConversation(cid)
                            if (cid in typingByConversation.value) {
                                const nextTyping = { ...typingByConversation.value }
                                delete nextTyping[cid]
                                typingByConversation.value = nextTyping
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
                            if (!messagesByConversation.value[cid]) {
                                messagesByConversation.value[cid] = []
                            }
                            const list = messagesByConversation.value[cid]
                            const incomingEventId = payload.message?.event_id
                            if (incomingEventId) {
                                const existingIdx = list.findIndex(
                                    (m: any) => m?.event_id === incomingEventId
                                )
                                if (existingIdx !== -1) {
                                    list.splice(existingIdx, 1, {
                                        ...list[existingIdx],
                                        ...payload.message,
                                        content: {
                                            ...(list[existingIdx]?.content ?? {}),
                                            ...(payload.message?.content ?? {})
                                        }
                                    })
                                    c.updated_at = payload.message.origin_server_ts || Date.now()
                                    return
                                }
                            }
                            list.push(payload.message)
                            c.updated_at = payload.message.origin_server_ts || Date.now()
                            const senderUri = payload.message?.sender
                            if (senderUri) clearTypingIndicator(cid, senderUri)
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
                        .on('msrpMessageHidden', (payload) => {
                            const cid = idKey(payload.conversation_id)
                            if (!cid || !payload.eventId) return
                            clearPendingHide(cid, payload.eventId)
                            const messages = messagesByConversation.value[cid]
                            if (messages) {
                                replaceConversationMessages(
                                    cid,
                                    messages.filter((m: any) => m?.event_id !== payload.eventId)
                                )
                            }
                            const c = conversations.value[cid]
                            if (c) c.updated_at = payload.updatedAt
                        })
                        .on('msrpConversationTagged', (payload) => {
                            const cid = idKey(payload.conversation_id)
                            if (!cid) return
                            const c = conversations.value[cid]
                            if (!c) return
                            c.tags = applyTag(c.tags, payload.action, payload.tag)
                            c.updated_at = payload.updatedAt
                        })
                        .on('msrpMessageTagged', (payload) => {
                            const cid = idKey(payload.conversation_id)
                            if (!cid) return
                            const messages = messagesByConversation.value[cid]
                            if (messages) {
                                const m = findMessage(messages, payload.eventId)
                                if (m) {
                                    if (!m.content) m.content = {}
                                    m.content.tags = applyTag(m.content.tags, payload.action, payload.tag)
                                }
                            }
                            const c = conversations.value[cid]
                            if (c) c.updated_at = payload.updatedAt
                        })
                        .on('msrpError', (payload) => {
                            const cid = idKey(payload.conversation_id)
                            hideError.value = payload.error
                                ? `MSRP error: ${payload.error}`
                                : 'MSRP error'
                            if (!cid) return
                            for (const pending of [ ...pendingHides.values() ]) {
                                if (pending.cid === cid) {
                                    restoreHiddenMessage(pending.cid, pending.eventId)
                                }
                            }
                        })
                        .on('msrpTyping', (payload: { conversation_id?: number, sender: string, isTyping: boolean }) => {
                            const cid = idKey(payload.conversation_id)
                            if (!cid || !payload.sender) return
                            if (payload.isTyping) {
                                typingByConversation.value = {
                                    ...typingByConversation.value,
                                    [cid]: {
                                        sender: payload.sender,
                                        isTyping: true,
                                        updatedAt: Date.now()
                                    }
                                }
                                restartTypingTimeout(cid, payload.sender)
                            } else {
                                clearTypingIndicator(cid, payload.sender)
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
        hideMessage (conversationRef: MSRPConversationRef, targetEventId: string) {
            const cid = idKey(Number(conversationRef))
            if (!cid || !targetEventId) return false
            hideError.value = ''
            const list = messagesByConversation.value[cid]
            const index = list?.findIndex((m: any) => m?.event_id === targetEventId) ?? -1
            const snapshot = index >= 0 ? list[index] : null
            if (index >= 0) {
                const next = [ ...list ]
                next.splice(index, 1)
                replaceConversationMessages(cid, next)
            }
            const ok = openSIPSJS?.msrp.hideMessage(conversationRef, targetEventId) ?? false
            if (!ok) {
                const current = messagesByConversation.value[cid]
                if (snapshot && current && !current.some((m: any) => m?.event_id === targetEventId)) {
                    const restored = [ ...current ]
                    restored.splice(Math.min(index, restored.length), 0, snapshot)
                    replaceConversationMessages(cid, restored)
                }
                hideError.value = 'Hide failed to send'
                return false
            }
            if (snapshot) {
                clearPendingHide(cid, targetEventId)
                const timer = setTimeout(() => {
                    restoreHiddenMessage(cid, targetEventId)
                    hideError.value = 'Hide timed out — message restored'
                }, HIDE_ECHO_TIMEOUT_MS)
                pendingHides.set(pendingHideKey(cid, targetEventId), {
                    cid,
                    eventId: targetEventId,
                    snapshot,
                    index,
                    timer
                })
            }
            return true
        },
        tagConversation (conversationRef: MSRPConversationRef, name: string, color?: string) {
            return openSIPSJS?.msrp.tagConversation(conversationRef, name, color) ?? false
        },
        untagConversation (conversationRef: MSRPConversationRef, name: string) {
            return openSIPSJS?.msrp.untagConversation(conversationRef, name) ?? false
        },
        tagMessage (
            conversationRef: MSRPConversationRef,
            targetEventId: string,
            name: string,
            color?: string
        ) {
            return openSIPSJS?.msrp.tagMessage(conversationRef, targetEventId, name, color) ?? false
        },
        untagMessage (conversationRef: MSRPConversationRef, targetEventId: string, name: string) {
            return openSIPSJS?.msrp.untagMessage(conversationRef, targetEventId, name) ?? false
        },
        forwardMessage (
            sourceMessage: any,
            targetConversationRef: MSRPConversationRef,
            forwardedFromLabel?: string
        ) {
            return openSIPSJS?.msrp.forwardMessage(sourceMessage, targetConversationRef, forwardedFromLabel) ?? false
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
        sendTypingIndicator (conversationRef: MSRPConversationRef) {
            return openSIPSJS?.msrp.sendTypingIndicator(conversationRef) ?? false
        },
        startTypingKeepAlive (conversationRef: MSRPConversationRef) {
            openSIPSJS?.msrp.startTypingKeepAlive(conversationRef)
        },
        stopTypingKeepAlive () {
            openSIPSJS?.msrp.stopTypingKeepAlive()
        },
        markConversationAsUnread (conversationRef: MSRPConversationRef) {
            const cid = idKey(Number(conversationRef))
            if (cid) beginUnreadOverride(cid)
            const ok = openSIPSJS?.msrp.markAsUnread(conversationRef, null) ?? false
            if (ok && cid) applyOptimisticPointer(cid, null)
            return ok
        },
        markAsUnreadFromMessage (
            conversationRef: MSRPConversationRef,
            targetEventId: string
        ) {
            const cid = idKey(Number(conversationRef))
            if (!cid || !targetEventId) return false
            const real = onlyRealMessages(messagesByConversation.value[cid])
            if (!real.length) return false
            const idx = findLastIndexByEventId(real, targetEventId)
            if (idx === -1) return false
            const prevEventId = idx > 0 ? real[idx - 1].event_id : null
            beginUnreadOverride(cid)
            const ok = openSIPSJS?.msrp.markAsUnread(conversationRef, prevEventId) ?? false
            if (ok) applyOptimisticPointer(cid, prevEventId)
            return ok
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
