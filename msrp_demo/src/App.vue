<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { vsipAPI } from './composables'
import { MODULES } from '../../src/enum/modules'
import { MSRP_EVT } from '../../src/modules/msrp'
import { exportConversation, hasApiToken, setApiToken } from './api'
import EmojiPicker from './components/EmojiPicker.vue'

const QUICK_REACTION_EMOJIS = [ '👍', '❤️', '😂', '😮', '😢', '🙏' ] as const

const LS_DOMAIN = 'sipDomain'
const LS_USERNAME = 'sipUsername'
const LS_PASSWORD = 'sipPassword'
const LS_MSRP_DOMAIN = 'msrpDomain'
const LS_API_TOKEN = 'voicenterApiToken'

const domain = ref<string>(localStorage.getItem(LS_DOMAIN) ?? '')
const username = ref<string>(localStorage.getItem(LS_USERNAME) ?? '')
const password = ref<string>(localStorage.getItem(LS_PASSWORD) ?? '')
const msrpDomain = ref<string>(localStorage.getItem(LS_MSRP_DOMAIN) ?? '')
const apiToken = ref<string>(localStorage.getItem(LS_API_TOKEN) ?? '')

if (apiToken.value.trim()) {
    setApiToken(apiToken.value.trim())
}

const connectError = ref<string>('')
const isConnecting = ref<boolean>(false)

const { state, actions } = vsipAPI

async function handleConnect () {
    connectError.value = ''
    const d = domain.value.trim()
    const u = username.value.trim()
    const p = password.value.trim()
    if (!d || !u || !p) {
        connectError.value = 'Please fill all SIP connection fields.'
        return
    }

    localStorage.setItem(LS_DOMAIN, d)
    localStorage.setItem(LS_USERNAME, u)
    localStorage.setItem(LS_PASSWORD, p)
    if (msrpDomain.value.trim()) {
        localStorage.setItem(LS_MSRP_DOMAIN, msrpDomain.value.trim())
    }

    const trimmedToken = apiToken.value.trim()
    if (trimmedToken) {
        localStorage.setItem(LS_API_TOKEN, trimmedToken)
        setApiToken(trimmedToken)
    } else {
        localStorage.removeItem(LS_API_TOKEN)
        setApiToken(null)
    }

    isConnecting.value = true
    try {
        await actions.init(
            {
                username: u,
                password: p,
                domain: d,
                modules: [ MODULES.MSRP ],
                msrpDomain: msrpDomain.value.trim() || undefined,
                msrpWs: !!msrpDomain.value.trim()
            },
            undefined,
            {
                session_timers: true,
                session_timers_refresh_method: 'UPDATE',
                session_timers_force_refresher: true,
                register_expires: 60,
            },
            console
        )
    } catch (e) {
        connectError.value = e instanceof Error ? e.message : String(e)
    } finally {
        isConnecting.value = false
    }
}

function handleLogout () {
    actions.disconnect()
    localStorage.removeItem(LS_PASSWORD)
    password.value = ''
}

function handleForget () {
    localStorage.removeItem(LS_DOMAIN)
    localStorage.removeItem(LS_USERNAME)
    localStorage.removeItem(LS_PASSWORD)
    localStorage.removeItem(LS_MSRP_DOMAIN)
    localStorage.removeItem(LS_API_TOKEN)
    domain.value = ''
    username.value = ''
    password.value = ''
    msrpDomain.value = ''
    apiToken.value = ''
    setApiToken(null)
}

function handleStartMSRPSession () {
    actions.initMSRP()
}

const newConversationTarget = ref<string>('')

function handleCreateConversation () {
    const target = newConversationTarget.value.trim()
    if (!target) return
    const ok = actions.sendCreateConversationMessage(target)
    if (ok) newConversationTarget.value = ''
}

function handleSelectConversation (id: number | string) {
    actions.setActiveConversation(String(id))
}

function handleLeaveConversation (id: number | string) {
    actions.leaveConversation(id)
}

function handleCloseConversation (id: number | string) {
    actions.closeConversation(id)
}

const isExporting = ref<boolean>(false)
const exportError = ref<string>('')

async function handleExportConversation (id: number | string) {
    if (!hasApiToken()) {
        exportError.value = 'API token missing - fill the "Token" field on the login form and reconnect.'
        return
    }

    exportError.value = ''
    isExporting.value = true
    try {
        const blob = await exportConversation(id, 'json')
        const filename = `conversation-${id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filename
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        URL.revokeObjectURL(url)
    } catch (e) {
        exportError.value = e instanceof Error ? e.message : String(e)
    } finally {
        isExporting.value = false
    }
}

function handleAcceptInvite (id: number | string) {
    actions.acceptInvite(id)
    actions.setActiveConversation(String(id))
}

function handleRejectInvite (id: number | string) {
    actions.rejectInvite(id)
}

const isCurrentConversationClosed = computed<boolean>(() => {
    const c = state.currentConversation.value
    if (!c?.state_events) return false
    return !!c.state_events['m.conversation.closed']?.['']
})

const myRoleLabel = computed<string>(() => {
    const c = state.currentConversation.value
    if (!c) return ''
    switch (c.currentUserRole) {
        case 'in_charge': return '⚡ in_charge'
        case 'manager': return '👁 manager'
        default: return '👤 assigned'
    }
})

const canSend = computed<boolean>(() => {
    const c = state.currentConversation.value
    if (!c) return false
    if (isCurrentConversationClosed.value) return false
    return c.currentUserRole !== 'manager'
})

const draft = ref<string>('')
const chatMessagesEl = ref<HTMLDivElement | null>(null)
const draftEl = ref<HTMLTextAreaElement | null>(null)

const DRAFT_MAX_LINES = 3

function autoResizeDraft () {
    const el = draftEl.value
    if (!el) return
    el.style.height = 'auto'
    const style = window.getComputedStyle(el)
    const lineHeight = parseFloat(style.lineHeight) || 20
    const paddingY = (parseFloat(style.paddingTop) || 0)
        + (parseFloat(style.paddingBottom) || 0)
    const borderY = (parseFloat(style.borderTopWidth) || 0)
        + (parseFloat(style.borderBottomWidth) || 0)
    const maxHeight = lineHeight * DRAFT_MAX_LINES + paddingY + borderY
    const nextHeight = Math.min(el.scrollHeight + borderY, maxHeight)
    el.style.height = `${nextHeight}px`
    el.style.overflowY = el.scrollHeight + borderY > maxHeight ? 'auto' : 'hidden'
}

const replyingToMessage = ref<any | null>(null)

const editingMessageId = ref<string | null>(null)

const sendAsInternalNote = ref<boolean>(false)

function isMyMessage (msg: any): boolean {
    return !!msg?.sender && extractSipUser(msg.sender) === username.value
}

function messageBodyText (msg: any): string {
    return String(msg?.content?.content ?? '')
}

function beginReply (msg: any) {
    if (!msg?.event_id) return
    editingMessageId.value = null
    replyingToMessage.value = msg
}

function cancelReply () {
    replyingToMessage.value = null
}

function beginEdit (msg: any) {
    if (!msg?.event_id || !isMyMessage(msg)) return
    replyingToMessage.value = null
    editingMessageId.value = msg.event_id
    draft.value = messageBodyText(msg)
    nextTick(() => {
        autoResizeDraft()
        draftEl.value?.focus()
    })
}

function cancelEdit () {
    editingMessageId.value = null
    draft.value = ''
    nextTick(() => autoResizeDraft())
}

function handleDelete (msg: any) {
    if (!msg?.event_id || !isMyMessage(msg)) return
    const key = state.currentConversationId.value
    if (!key) return
    if (!window.confirm('Delete this message for everyone?')) return
    actions.deleteMessage(key, msg.event_id)
}

const sendError = ref<string>('')

function handleSend () {
    sendError.value = ''
    const key = state.currentConversationId.value
    const text = draft.value.trim()
    if (!key || !text) return

    let ok = false
    let mode: 'edit' | 'note' | 'reply' | 'text' = 'text'
    if (editingMessageId.value) {
        mode = 'edit'
        ok = actions.editMessage(key, editingMessageId.value, text)
        if (ok) editingMessageId.value = null
    } else if (sendAsInternalNote.value) {
        mode = 'note'
        ok = actions.sendInternalNote(key, text, {
            replyToEventId: replyingToMessage.value?.event_id
        })
    } else {
        mode = replyingToMessage.value?.event_id ? 'reply' : 'text'
        ok = actions.sendTextMessage(key, text, {
            replyToEventId: replyingToMessage.value?.event_id
        })
    }

    if (ok) {
        draft.value = ''
        replyingToMessage.value = null
        actions.stopTypingKeepAlive()
        nextTick(() => autoResizeDraft())
    } else {
        sendError.value = `Send failed (mode: ${mode}). SDK returned false — the MSRP session may be down, or the module rejected the payload. Check console.`
    }
}

function handleDraftInput () {
    autoResizeDraft()
    const key = state.currentConversationId.value
    if (!key) return
    if (draft.value.trim()) {
        actions.startTypingKeepAlive(key)
    } else {
        actions.stopTypingKeepAlive()
    }
}

function handleDraftFocus () {
    const key = state.currentConversationId.value
    if (!key) return
    if (draft.value.trim()) actions.startTypingKeepAlive(key)
}

function handleDraftBlur () {
    actions.stopTypingKeepAlive()
}

function handleDraftKeydown (e: KeyboardEvent) {
    if (e.key !== 'Enter') return
    if (e.isComposing || e.shiftKey) return
    e.preventDefault()
    handleSend()
}

const uploadInputRef = ref<HTMLInputElement | null>(null)
const isUploading = ref<boolean>(false)
const uploadError = ref<string>('')

async function handleFileSelected (event: Event) {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return
    const key = state.currentConversationId.value
    if (!key) {
        uploadError.value = 'Select a conversation first.'
        return
    }

    isUploading.value = true
    uploadError.value = ''
    try {
        await actions.uploadFile(key, file)
    } catch (e) {
        uploadError.value = e instanceof Error ? e.message : String(e)
    } finally {
        isUploading.value = false
        if (uploadInputRef.value) uploadInputRef.value.value = ''
    }
}

function handleAddReaction (eventId: string, emoji: string) {
    const key = state.currentConversationId.value
    if (!key || !eventId) return
    actions.sendReaction(key, eventId, emoji)
}

function handleToggleReaction (msg: any, emoji: string) {
    const key = state.currentConversationId.value
    if (!key || !msg?.event_id) return
    const summary = (msg.content?.reactions_summary || []) as any[]
    const existing = summary.find((r) => (r?.emoji || r?.key) === emoji)
    if (existing?.viewer_reacted) {
        actions.removeReaction(key, msg.event_id, emoji)
    } else {
        actions.sendReaction(key, msg.event_id, emoji, 'add')
    }
}

const emojiPickerOpen = ref<boolean>(false)
const emojiPickerTargetEventId = ref<string | null>(null)
const emojiPickerPos = ref<{ x: number, y: number }>({ x: 0, y: 0 })
const EMOJI_PICKER_WIDTH = 320
const EMOJI_PICKER_HEIGHT = 360

function openEmojiPicker (msg: any, e: MouseEvent) {
    if (!msg?.event_id) return
    const trigger = e.currentTarget as HTMLElement | null
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()

    const viewportH = window.innerHeight
    const viewportW = window.innerWidth
    const spaceAbove = rect.top
    const openAbove = spaceAbove >= EMOJI_PICKER_HEIGHT + 8

    let y = openAbove
        ? rect.top - EMOJI_PICKER_HEIGHT - 6
        : rect.bottom + 6

    let x = rect.left
    if (x + EMOJI_PICKER_WIDTH > viewportW - 8) {
        x = Math.max(8, viewportW - EMOJI_PICKER_WIDTH - 8)
    }
    if (y < 8) y = 8
    if (y + EMOJI_PICKER_HEIGHT > viewportH - 8) {
        y = Math.max(8, viewportH - EMOJI_PICKER_HEIGHT - 8)
    }

    emojiPickerPos.value = { x, y }
    emojiPickerTargetEventId.value = msg.event_id
    emojiPickerOpen.value = true
}

function closeEmojiPicker () {
    emojiPickerOpen.value = false
    emojiPickerTargetEventId.value = null
}

function handleEmojiPicked (emoji: string) {
    const targetId = emojiPickerTargetEventId.value
    if (targetId) handleAddReaction(targetId, emoji)
    closeEmojiPicker()
}

const forwardPickerOpen = ref<boolean>(false)
const forwardPickerSourceMsg = ref<any | null>(null)
const forwardPickerPos = ref<{ x: number, y: number }>({ x: 0, y: 0 })
const FORWARD_PICKER_WIDTH = 260
const FORWARD_PICKER_MAX_HEIGHT = 320

function messageHasAttachments (msg: any): boolean {
    return !!msg?.content?.attachments?.length
}

function isClosedConversation (c: any): boolean {
    return !!c?.state_events?.['m.conversation.closed']?.['']
}

const forwardEligibleConversations = computed(() => {
    return state.sortedConversations.value.filter((c) => {
        if (!c || c.currentUserStatus !== 'join') return false
        if (isClosedConversation(c)) return false
        if (c.currentUserRole === 'manager') return false
        return true
    })
})

function openForwardPicker (msg: any, e: MouseEvent) {
    if (!msg?.event_id) return
    if (messageHasAttachments(msg)) return
    closeEmojiPicker()

    const trigger = e.currentTarget as HTMLElement | null
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewportH = window.innerHeight
    const viewportW = window.innerWidth

    let y = rect.bottom + 6
    if (y + FORWARD_PICKER_MAX_HEIGHT > viewportH - 8) {
        y = Math.max(8, rect.top - FORWARD_PICKER_MAX_HEIGHT - 6)
    }
    if (y < 8) y = 8

    let x = rect.left
    if (x + FORWARD_PICKER_WIDTH > viewportW - 8) {
        x = Math.max(8, viewportW - FORWARD_PICKER_WIDTH - 8)
    }

    forwardPickerPos.value = { x, y }
    forwardPickerSourceMsg.value = msg
    forwardPickerOpen.value = true
}

function closeForwardPicker () {
    forwardPickerOpen.value = false
    forwardPickerSourceMsg.value = null
}

function handleForwardToConversation (targetConversationId: number | string) {
    const src = forwardPickerSourceMsg.value
    if (!src) return
    const label = extractSipUser(src.sender)
    const ok = actions.forwardMessage(src, targetConversationId, label)
    if (!ok) {
        sendError.value = 'Forward failed. The SDK returned false — check the MSRP session or console.'
    }
    closeForwardPicker()
}

function handleChangeRole (targetUri: string, newRole: string) {
    const key = state.currentConversationId.value
    if (!key) return
    actions.changeMemberRole(key, targetUri, newRole as 'in_charge' | 'manager' | 'assigned')
}

const sortedMessages = computed(() => {
    return [ ...state.currentMessages.value ].sort(
        (a, b) => (a.origin_server_ts || 0) - (b.origin_server_ts || 0)
    )
})

const sortedRealMessages = computed(() =>
    sortedMessages.value.filter((m: any) => m?.type === MSRP_EVT.MESSAGE)
)

const currentReadPointer = computed<string | null | undefined>(() => {
    return state.currentConversation.value?.currentUserLastReadMessageId
})

const currentReadPointerIndex = computed<number>(() => {
    const pointer = currentReadPointer.value
    if (pointer === null || pointer === undefined) return -1
    const list = sortedRealMessages.value
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i]?.event_id === pointer) return i
    }
    return -1
})

const firstUnreadEventIdInCurrent = computed<string | null>(() => {
    const cid = state.currentConversationId.value
    if (!cid) return null
    return state.firstUnreadByConversation.value[cid] ?? null
})

function canMarkMessageAsUnread (msg: any): boolean {
    if (!msg?.event_id) return false
    const pointer = currentReadPointer.value
    // Absent pointer means the backend hasn't shared read state yet — hide
    // to avoid confusing the user with an action of unclear effect.
    if (pointer === undefined) return false
    // Already whole-conversation unread → nothing would change.
    if (pointer === null) return false
    const list = sortedRealMessages.value
    if (!list.length) return false
    const pointerIdx = currentReadPointerIndex.value
    const msgIdx = list.findIndex((m: any) => m?.event_id === msg.event_id)
    if (msgIdx === -1) return false
    // Must be a message the agent already read AND must not be the most-
    // recent message (per FRONTEND_MARK_AS_UNREAD_GUIDE §7b).
    if (msgIdx > pointerIdx) return false
    if (msgIdx === list.length - 1) return false
    return true
}

function canMarkConversationAsUnread (conv: any): boolean {
    if (!conv) return false
    if (conv.currentUserStatus !== 'join') return false
    // Guide §7b: hidden when already fully unread.
    return conv.currentUserLastReadMessageId !== null
}

function handleMarkConversationAsUnread (
    conversationId: number | string | undefined,
    e?: MouseEvent
) {
    if (e) e.stopPropagation()
    if (conversationId === undefined || conversationId === null) return
    actions.markConversationAsUnread(conversationId as any)
}

function handleMarkAsUnreadFromMessage (msg: any) {
    const cid = state.currentConversationId.value
    if (!cid || !msg?.event_id) return
    actions.markAsUnreadFromMessage(cid, msg.event_id)
}

watch(sortedMessages, async () => {
    await nextTick()
    if (chatMessagesEl.value) {
        chatMessagesEl.value.scrollTop = chatMessagesEl.value.scrollHeight
    }
})

function extractSipUser (uri: string | null | undefined): string {
    if (!uri) return 'unknown'
    const match = String(uri).match(/^sip:([^@]+)@/)
    return match ? match[1] : String(uri)
}

function formatTime (ts: number | undefined): string {
    if (!ts) return ''
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function statusIcon (status: string | undefined): string {
    switch (status) {
        case 'pending': return '⏳'
        case 'sent': return '✓'
        case 'delivered': return '✓✓'
        case 'read': return '✓✓ (read)'
        case 'failed': return '⚠️'
        default: return ''
    }
}

function quickReactions () {
    return QUICK_REACTION_EMOJIS
}

function isEdited (msg: any): boolean {
    if (msg?.content?.edited_at) return true
    return !!msg?.unsigned?.['m.relations']?.['m.replace']
}

function isDeleted (msg: any): boolean {
    return !!msg?.content?.is_deleted
}

function isInternalNote (msg: any): boolean {
    return msg?.content?.message_type === 'internal_note'
}

function forwardedFromLabel (msg: any): string | null {
    const label = msg?.content?.forwarded_from
    if (typeof label !== 'string') return null
    const trimmed = label.trim()
    return trimmed || null
}

function replyPreviewFor (msg: any): { sender: string, text: string } | null {
    const parentId = msg?.content?.in_reply_to?.event_id
    if (!parentId) return null
    const parent = state.currentMessages.value.find((m: any) => m.event_id === parentId)
    if (!parent) {
        return { sender: 'unknown', text: '(message not loaded)' }
    }
    return {
        sender: extractSipUser(parent.sender),
        text: isDeleted(parent) ? '(deleted)' : messageBodyText(parent).slice(0, 120)
    }
}

function presenceClass (uri: string): string {
    const p = state.presenceBySender.value[uri]?.presence
    switch (p) {
        case 'online': return 'presence online'
        case 'away': return 'presence away'
        case 'offline': return 'presence offline'
        default: return 'presence unknown'
    }
}

function debugReplacer (_key: string, value: unknown): unknown {
    if (value instanceof Map) return Object.fromEntries(value.entries())
    if (value instanceof Set) return Array.from(value)
    return value
}

const debugConversations = computed(() =>
    JSON.stringify(state.conversations.value, debugReplacer, 2)
)
const debugCurrentConversationId = computed(() =>
    JSON.stringify(state.currentConversationId.value, debugReplacer, 2)
)
const debugCurrentConversation = computed(() =>
    JSON.stringify(state.currentConversation.value, debugReplacer, 2)
)
const debugCurrentMessages = computed(() =>
    JSON.stringify(state.currentMessages.value, debugReplacer, 2)
)
const debugMessagesByConversation = computed(() =>
    JSON.stringify(state.messagesByConversation.value, debugReplacer, 2)
)

watch(() => state.currentConversationId.value, (next, prev) => {
    if (prev) actions.stopTypingKeepAlive()
    draft.value = ''
    editingMessageId.value = null
    replyingToMessage.value = null
    sendAsInternalNote.value = false
    nextTick(() => autoResizeDraft())
})

onBeforeUnmount(() => {
    actions.stopTypingKeepAlive()
})
</script>

<template>
    <div class="app">
        <header class="app-header">
            <h1>opensips-js MSRP Demo</h1>
            <div class="conn-status">
                <span class="dot" :class="{
                    ready: state.isOpenSIPSReady.value,
                    reconnecting: state.isOpenSIPSReconnecting.value
                }" />
                {{
                    state.isOpenSIPSReconnecting.value
                        ? 'Reconnecting...'
                        : state.isOpenSIPSReady.value
                            ? 'Connected'
                            : state.isInitialized.value
                                ? 'Disconnected'
                                : 'Not connected'
                }}
                <span v-if="state.hasActiveMsrpSession.value" class="badge ok">MSRP session live</span>
                <span v-else-if="state.isMSRPInitializing.value" class="badge pending">MSRP initializing...</span>
            </div>
        </header>

        <section v-if="!state.isInitialized.value" class="login-card">
            <h2>Connect</h2>
            <p class="hint">Credentials are persisted to localStorage (same keys as demo_example/main.js).</p>
            <label>
                <span>SIP Domain</span>
                <input v-model="domain" placeholder="sip07.voicenter.co" autocomplete="off" />
            </label>
            <label>
                <span>Username</span>
                <input v-model="username" placeholder="extension or user" autocomplete="username" />
            </label>
            <label>
                <span>Password</span>
                <input v-model="password" type="password" autocomplete="current-password" />
            </label>
            <label>
                <span>MSRP Domain (optional)</span>
                <input v-model="msrpDomain" placeholder="185.138.169.99:2856" autocomplete="off" />
            </label>
            <label>
                <span>Token</span>
                <input
                    v-model="apiToken"
                    type="password"
                    placeholder="Voicenter Login JWT (Bearer)"
                    autocomplete="off"
                />
                <small class="hint">Used as <code>Authorization: Bearer &lt;token&gt;</code> for requests to
                    <code>wbi.voicenter.co/api/v1</code>.</small>
            </label>

            <div class="row">
                <button class="primary" :disabled="isConnecting" @click="handleConnect">
                    {{ isConnecting ? 'Connecting...' : 'Connect' }}
                </button>
                <button class="ghost" @click="handleForget">Forget credentials</button>
            </div>

            <p v-if="connectError" class="error">{{ connectError }}</p>
        </section>

        <main v-else class="main">
            <aside class="sidebar">
                <div class="sidebar-actions">
                    <button
                        v-if="!state.hasActiveMsrpSession.value"
                        class="primary block"
                        :disabled="state.isMSRPInitializing.value"
                        @click="handleStartMSRPSession"
                    >
                        {{ state.isMSRPInitializing.value ? 'Starting...' : 'Start MSRP session' }}
                    </button>

                    <div v-else class="create-conversation">
                        <input
                            v-model="newConversationTarget"
                            placeholder="SIP URI or extension to invite"
                            @keypress.enter="handleCreateConversation"
                        />
                        <button class="primary" @click="handleCreateConversation">
                            + New Conversation
                        </button>
                    </div>

                    <button class="ghost block" @click="handleLogout">Disconnect</button>
                </div>

                <h3 class="sidebar-title">Conversations</h3>
                <ul v-if="state.sortedConversations.value.length" class="conversation-list">
                    <li
                        v-for="conv in state.sortedConversations.value"
                        :key="conv.conversation_id"
                        :class="{
                            active: String(conv.conversation_id) === state.currentConversationId.value,
                            invite: conv.currentUserStatus === 'invite'
                        }"
                    >
                        <div v-if="conv.currentUserStatus === 'invite'" class="invite-card">
                            <div class="invite-title">📨 {{ conv.conversation_id }}</div>
                            <div v-if="conv.creator" class="invite-from">
                                From: {{ extractSipUser(conv.creator) }}
                            </div>
                            <div class="invite-actions">
                                <button class="primary small" @click="handleAcceptInvite(conv.conversation_id)">
                                    Accept
                                </button>
                                <button class="ghost small" @click="handleRejectInvite(conv.conversation_id)">
                                    Reject
                                </button>
                            </div>
                        </div>
                        <div v-else class="conv-row">
                            <button
                                class="conversation-btn"
                                @click="handleSelectConversation(conv.conversation_id)"
                            >
                                <span class="name">{{ conv.conversation_id }}</span>
                                <span
                                    v-if="state.unreadByConversation.value[String(conv.conversation_id)]"
                                    class="unread"
                                >
                                    {{ state.unreadByConversation.value[String(conv.conversation_id)] }}
                                </span>
                            </button>
                            <button
                                v-if="canMarkConversationAsUnread(conv)"
                                class="conv-row-action"
                                title="Mark conversation as unread"
                                @click="handleMarkConversationAsUnread(conv.conversation_id, $event)"
                            >
                                ✉
                            </button>
                        </div>
                    </li>
                </ul>
                <p v-else class="hint">
                    No conversations yet. {{
                        state.hasActiveMsrpSession.value
                            ? 'Invite someone to start.'
                            : 'Start an MSRP session first.'
                    }}
                </p>

                <details class="debug-panel" open>
                    <summary>Debug · reactive state</summary>
                    <div class="debug-block">
                        <div class="debug-label">currentConversationId</div>
                        <pre class="debug-json">{{ debugCurrentConversationId }}</pre>
                    </div>
                    <div class="debug-block">
                        <div class="debug-label">currentConversation</div>
                        <pre class="debug-json">{{ debugCurrentConversation }}</pre>
                    </div>
                    <div class="debug-block">
                        <div class="debug-label">currentMessages</div>
                        <pre class="debug-json">{{ debugCurrentMessages }}</pre>
                    </div>
                    <div class="debug-block">
                        <div class="debug-label">conversations</div>
                        <pre class="debug-json">{{ debugConversations }}</pre>
                    </div>
                    <div class="debug-block">
                        <div class="debug-label">messagesByConversation</div>
                        <pre class="debug-json">{{ debugMessagesByConversation }}</pre>
                    </div>
                </details>
            </aside>

            <section class="chat-panel">
                <div v-if="!state.currentConversation.value" class="empty-state">
                    <p>Select or create a conversation to start chatting.</p>
                </div>

                <template v-else>
                    <header class="chat-header">
                        <div>
                            <h2>{{ state.currentConversation.value.conversation_id }}</h2>
                            <p class="subtitle">
                                {{ state.currentConversation.value.members.size }}
                                member{{ state.currentConversation.value.members.size === 1 ? '' : 's' }}
                                <span v-if="myRoleLabel"> · You: {{ myRoleLabel }}</span>
                                <span v-if="isCurrentConversationClosed" class="badge warn">closed</span>
                            </p>
                        </div>
                        <div class="header-actions">
                            <button
                                class="ghost small"
                                :disabled="isExporting"
                                :title="isExporting ? 'Preparing…' : 'Download transcript (.json)'"
                                @click="handleExportConversation(state.currentConversation.value.conversation_id)"
                            >
                                {{ isExporting ? 'Preparing…' : 'Export' }}
                            </button>
                            <button
                                v-if="!isCurrentConversationClosed
                                    && (state.currentConversation.value.currentUserRole === 'in_charge'
                                        || state.currentConversation.value.currentUserRole === 'manager')"
                                class="ghost small"
                                @click="handleCloseConversation(state.currentConversation.value.conversation_id)"
                            >
                                Close
                            </button>
                            <button
                                class="ghost small"
                                @click="handleLeaveConversation(state.currentConversation.value.conversation_id)"
                            >
                                Leave
                            </button>
                        </div>
                    </header>

                    <details v-if="state.currentConversation.value.memberRoles.size > 0" class="members-panel">
                        <summary>👥 Members ({{ state.currentConversation.value.memberRoles.size }})</summary>
                        <div
                            v-for="[uri, role] in state.currentConversation.value.memberRoles"
                            :key="uri"
                            class="member-row"
                        >
                            <span
                                :class="presenceClass(uri)"
                                :title="state.presenceBySender.value[uri]?.presence || 'unknown presence'"
                            />
                            <span class="name">{{ extractSipUser(uri) }}</span>
                            <span class="role-tag" :class="role">{{ role }}</span>
                            <select
                                v-if="state.currentConversation.value.currentUserRole === 'in_charge'
                                    || state.currentConversation.value.currentUserRole === 'manager'"
                                :value="role"
                                @change="(e) => handleChangeRole(uri, (e.target as HTMLSelectElement).value)"
                            >
                                <option value="in_charge">⚡ in_charge</option>
                                <option value="manager">👁 manager</option>
                                <option value="assigned">👤 assigned</option>
                            </select>
                        </div>
                    </details>

                    <div ref="chatMessagesEl" class="chat-messages">
                        <template
                            v-for="msg in sortedMessages"
                            :key="msg.event_id ?? `${msg.origin_server_ts}-${msg.sender}`"
                        >
                            <div
                                v-if="msg.event_id
                                    && firstUnreadEventIdInCurrent
                                    && msg.event_id === firstUnreadEventIdInCurrent"
                                class="unread-divider"
                            >
                                <span>New messages</span>
                            </div>
                        <div
                            class="message"
                            :class="{
                                mine: isMyMessage(msg),
                                'internal-note': isInternalNote(msg),
                                'is-deleted': isDeleted(msg),
                                editing: editingMessageId === msg.event_id
                            }"
                        >
                            <div class="message-meta">
                                <span class="sender">{{ extractSipUser(msg.sender) }}</span>
                                <span v-if="isInternalNote(msg)" class="tag note-tag">note</span>
                                <span class="time">{{ formatTime(msg.origin_server_ts) }}</span>
                                <span v-if="isEdited(msg) && !isDeleted(msg)" class="tag edited-tag" title="Edited">edited</span>
                                <span class="status">{{ statusIcon(msg.content?.status) }}</span>
                            </div>

                            <div v-if="replyPreviewFor(msg)" class="reply-quote">
                                <span class="reply-quote-sender">
                                    ↩ {{ replyPreviewFor(msg)?.sender }}
                                </span>
                                <span class="reply-quote-body">
                                    {{ replyPreviewFor(msg)?.text }}
                                </span>
                            </div>

                            <div v-if="forwardedFromLabel(msg)" class="forwarded-label">
                                ↪ Forwarded from <b>{{ forwardedFromLabel(msg) }}</b>
                            </div>

                            <div v-if="isDeleted(msg)" class="message-body deleted-body">
                                🗑 This message was deleted
                            </div>
                            <div v-else class="message-body">{{ msg.content?.content }}</div>

                            <div
                                v-if="!isDeleted(msg) && msg.content?.attachments?.length"
                                class="attachments"
                            >
                                <span
                                    v-for="(att, idx) in msg.content.attachments"
                                    :key="idx"
                                    class="attachment"
                                >
                                    📎 {{ att.filename ?? att.kind }}
                                </span>
                            </div>

                            <div
                                v-if="!isDeleted(msg) && msg.content?.reactions_summary?.length"
                                class="reactions"
                            >
                                <button
                                    v-for="r in msg.content.reactions_summary"
                                    :key="r.emoji ?? r.key"
                                    class="reaction"
                                    :class="{ 'viewer-reacted': r.viewer_reacted }"
                                    :title="r.viewer_reacted ? 'Remove your reaction' : 'React with ' + (r.emoji ?? r.key)"
                                    @click="handleToggleReaction(msg, r.emoji ?? r.key)"
                                >
                                    {{ r.emoji ?? r.key }} {{ r.count }}
                                </button>
                            </div>

                            <div v-if="msg.event_id && !isDeleted(msg)" class="msg-actions">
                                <button
                                    v-for="emoji in quickReactions()"
                                    :key="emoji"
                                    class="emoji-btn"
                                    :title="'React ' + emoji"
                                    @click="handleAddReaction(msg.event_id, emoji)"
                                >
                                    {{ emoji }}
                                </button>
                                <button
                                    class="action-btn"
                                    title="More emoji…"
                                    :class="{ active: emojiPickerOpen && emojiPickerTargetEventId === msg.event_id }"
                                    @click="openEmojiPicker(msg, $event)"
                                >
                                    ➕
                                </button>
                                <button
                                    class="action-btn"
                                    title="Reply"
                                    @click="beginReply(msg)"
                                >
                                    ↩
                                </button>
                                <button
                                    class="action-btn"
                                    :title="messageHasAttachments(msg)
                                        ? 'Forwarding media is not supported yet'
                                        : 'Forward'"
                                    :disabled="messageHasAttachments(msg)"
                                    :class="{ active: forwardPickerOpen
                                        && forwardPickerSourceMsg?.event_id === msg.event_id }"
                                    @click="openForwardPicker(msg, $event)"
                                >
                                    ➡
                                </button>
                                <button
                                    v-if="canMarkMessageAsUnread(msg)"
                                    class="action-btn"
                                    title="Mark as unread from here"
                                    @click="handleMarkAsUnreadFromMessage(msg)"
                                >
                                    ✉
                                </button>
                                <template v-if="isMyMessage(msg)">
                                    <button
                                        class="action-btn"
                                        title="Edit"
                                        @click="beginEdit(msg)"
                                    >
                                        ✎
                                    </button>
                                    <button
                                        class="action-btn danger"
                                        title="Delete"
                                        @click="handleDelete(msg)"
                                    >
                                        🗑
                                    </button>
                                </template>
                            </div>
                        </div>
                        </template>
                        <p v-if="!sortedMessages.length" class="hint center">
                            No messages yet. Say hello.
                        </p>
                    </div>

                    <div
                        v-if="state.typingByConversation.value[String(state.currentConversation.value.conversation_id)]"
                        class="typing-indicator"
                    >
                        {{ extractSipUser(
                            state.typingByConversation.value[String(state.currentConversation.value.conversation_id)].sender
                        ) }} is typing…
                    </div>

                    <div v-if="canSend" class="compose-wrap">
                        <div v-if="editingMessageId" class="compose-banner edit">
                            <span class="banner-label">✎ Editing message</span>
                            <button class="ghost small" @click="cancelEdit">Cancel</button>
                        </div>
                        <div v-else-if="replyingToMessage" class="compose-banner reply">
                            <span class="banner-label">
                                ↩ Replying to <b>{{ extractSipUser(replyingToMessage.sender) }}</b>:
                                <span class="banner-preview">
                                    {{ messageBodyText(replyingToMessage).slice(0, 80) }}
                                </span>
                            </span>
                            <button class="ghost small" @click="cancelReply">Cancel</button>
                        </div>

                        <footer class="compose-bar" :class="{ note: sendAsInternalNote }">
                            <label class="upload-btn" :class="{ disabled: isUploading || !!editingMessageId }">
                                📎
                                <input
                                    ref="uploadInputRef"
                                    type="file"
                                    hidden
                                    :disabled="isUploading || !!editingMessageId"
                                    @change="handleFileSelected"
                                />
                            </label>
                            <label
                                v-if="!editingMessageId"
                                class="note-toggle"
                                :class="{ on: sendAsInternalNote }"
                                title="Internal note - operators only, never fanned out to external channels"
                            >
                                <input
                                    v-model="sendAsInternalNote"
                                    type="checkbox"
                                    hidden
                                />
                                📝 Note
                            </label>
                            <textarea
                                ref="draftEl"
                                v-model="draft"
                                class="draft"
                                rows="1"
                                :placeholder="editingMessageId
                                    ? 'Edit your message…'
                                    : sendAsInternalNote
                                        ? 'Internal note (not sent to customer)…'
                                        : 'Type a message…  (Shift+Enter = new line)'"
                                @input="handleDraftInput"
                                @keydown="handleDraftKeydown"
                                @focus="handleDraftFocus"
                                @blur="handleDraftBlur"
                            />
                            <button class="primary" :disabled="!draft.trim()" @click="handleSend">
                                {{ editingMessageId ? 'Save' : '➤' }}
                            </button>
                        </footer>
                    </div>
                    <footer v-else class="compose-bar disabled">
                        <span class="hint">
                            {{
                                isCurrentConversationClosed
                                    ? 'This conversation is closed.'
                                    : 'Managers cannot send customer-visible messages.'
                            }}
                        </span>
                    </footer>

                    <p v-if="sendError" class="error small">{{ sendError }}</p>
                    <p v-if="uploadError" class="error small">{{ uploadError }}</p>
                    <p v-if="exportError" class="error small">{{ exportError }}</p>
                    <p v-if="isUploading" class="hint small">Uploading…</p>
                </template>
            </section>
        </main>

        <EmojiPicker
            :open="emojiPickerOpen"
            :x="emojiPickerPos.x"
            :y="emojiPickerPos.y"
            @select="handleEmojiPicked"
            @close="closeEmojiPicker"
        />

        <template v-if="forwardPickerOpen">
            <div class="fp-backdrop" @click="closeForwardPicker" />
            <div
                class="forward-picker"
                :style="{ top: forwardPickerPos.y + 'px', left: forwardPickerPos.x + 'px' }"
                @click.stop
            >
                <div class="fp-header">
                    <span>Forward to…</span>
                    <button class="ghost small" @click="closeForwardPicker">✕</button>
                </div>
                <div v-if="forwardEligibleConversations.length" class="fp-list">
                    <button
                        v-for="c in forwardEligibleConversations"
                        :key="c.conversation_id"
                        class="fp-item"
                        :class="{ current: String(c.conversation_id) === state.currentConversationId.value }"
                        @click="handleForwardToConversation(c.conversation_id)"
                    >
                        <span class="fp-item-name">
                            #{{ c.conversation_id }}
                            <span
                                v-if="String(c.conversation_id) === state.currentConversationId.value"
                                class="fp-item-current-tag"
                            >
                                current
                            </span>
                        </span>
                        <span class="fp-item-meta">
                            {{ c.members.size }} member{{ c.members.size === 1 ? '' : 's' }}
                        </span>
                    </button>
                </div>
                <p v-else class="fp-empty hint small">
                    No other conversations available to forward to.
                </p>
            </div>
        </template>
    </div>
</template>

<style scoped>
.app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #1f2937;
    background: #f3f4f6;
}

.app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.5rem;
    background: #111827;
    color: #f9fafb;
    border-bottom: 1px solid #1f2937;
}

.app-header h1 { margin: 0; font-size: 1.1rem; font-weight: 600; }

.conn-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
}

.dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: #9ca3af;
}
.dot.ready { background: #10b981; }
.dot.reconnecting { background: #f59e0b; }

.badge {
    padding: 1px 7px;
    font-size: 0.7rem;
    border-radius: 999px;
    background: #374151;
    color: #f9fafb;
}
.badge.ok { background: #065f46; }
.badge.pending { background: #92400e; }
.badge.warn { background: #b91c1c; }

.login-card {
    margin: 2rem auto;
    background: #ffffff;
    padding: 1.5rem;
    border-radius: 0.75rem;
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
    max-width: 420px;
    width: calc(100% - 2rem);
}

.login-card h2 { margin: 0 0 0.25rem; }
.login-card label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0.75rem 0;
    font-size: 0.85rem;
    color: #374151;
}
.login-card input {
    padding: 0.5rem 0.7rem;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    font-size: 0.95rem;
}
.login-card small {
    color: #6b7280;
    font-size: 0.7rem;
    line-height: 1.35;
}
.login-card code {
    background: #f3f4f6;
    padding: 0 3px;
    border-radius: 3px;
    font-size: 0.68rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.row { display: flex; gap: 0.5rem; margin-top: 0.5rem; }

.main {
    flex: 1;
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 1rem;
    padding: 1rem;
    min-height: 0;
}

.sidebar {
    background: #ffffff;
    border-radius: 0.75rem;
    padding: 1rem;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);
    display: flex;
    flex-direction: column;
    min-height: 0;
}
.sidebar-actions { display: flex; flex-direction: column; gap: 0.5rem; }
.sidebar-title {
    margin: 1rem 0 0.5rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
}
.create-conversation { display: flex; flex-direction: column; gap: 0.25rem; }
.create-conversation input {
    padding: 0.45rem 0.6rem;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    font-size: 0.85rem;
}

.conversation-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;
}
.conversation-list li { margin-bottom: 0.35rem; }
.conversation-btn {
    width: 100%;
    text-align: left;
    background: #f9fafb;
    border: 1px solid transparent;
    padding: 0.5rem 0.7rem;
    border-radius: 0.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.conversation-btn:hover { background: #f3f4f6; }
.conversation-list li.active .conversation-btn {
    background: #eef2ff;
    border-color: #6366f1;
}
.conversation-list .unread {
    background: #ef4444;
    color: white;
    border-radius: 999px;
    padding: 0 6px;
    font-size: 0.75rem;
}

.conv-row {
    display: flex;
    align-items: stretch;
    gap: 0.25rem;
}
.conv-row .conversation-btn { flex: 1; min-width: 0; }
.conv-row-action {
    background: transparent;
    border: 1px solid transparent;
    padding: 0 0.55rem;
    border-radius: 0.5rem;
    cursor: pointer;
    color: #6b7280;
    font-size: 0.95rem;
    opacity: 0;
    transition: opacity 0.15s ease, background 0.15s ease;
}
.conv-row:hover .conv-row-action { opacity: 1; }
.conv-row-action:hover {
    background: #f3f4f6;
    color: #111827;
    border-color: #e5e7eb;
}

.invite-card {
    background: #fef3c7;
    border: 1px solid #fbbf24;
    border-radius: 0.5rem;
    padding: 0.6rem;
}
.invite-title { font-weight: 600; }
.invite-from { font-size: 0.8rem; color: #6b7280; margin: 0.25rem 0; }
.invite-actions { display: flex; gap: 0.35rem; }

.chat-panel {
    background: #ffffff;
    border-radius: 0.75rem;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
}
.chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid #e5e7eb;
}
.chat-header h2 { margin: 0; font-size: 1rem; }
.subtitle { margin: 0; font-size: 0.8rem; color: #6b7280; display: flex; gap: 0.5rem; align-items: center; }
.header-actions { display: flex; gap: 0.3rem; }

.members-panel {
    border-bottom: 1px solid #e5e7eb;
    padding: 0.4rem 1rem;
    font-size: 0.85rem;
}
.member-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
}
.member-row .name { flex: 1; }
.role-tag {
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 999px;
    background: #e5e7eb;
}
.role-tag.in_charge { background: #fef3c7; }
.role-tag.manager { background: #dbeafe; }

.presence {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: #9ca3af;
    flex-shrink: 0;
}
.presence.online { background: #10b981; }
.presence.away { background: #f59e0b; }
.presence.offline { background: #6b7280; }
.presence.unknown { background: #d1d5db; }

.chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
}
.unread-divider {
    align-self: stretch;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #ef4444;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0.25rem 0;
}
.unread-divider::before,
.unread-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #ef4444;
    opacity: 0.35;
}
.unread-divider span { white-space: nowrap; }
.message {
    background: #f3f4f6;
    border-radius: 0.6rem;
    padding: 0.5rem 0.7rem;
    max-width: 80%;
    align-self: flex-start;
    border: 1px solid transparent;
}
.message.mine {
    background: #eef2ff;
    border-color: #c7d2fe;
    align-self: flex-end;
}
.message.internal-note {
    background: #fef9c3;
    border-color: #fde68a;
}
.message.internal-note.mine {
    background: #fde68a;
    border-color: #f59e0b;
}
.message.editing {
    outline: 2px dashed #6366f1;
    outline-offset: 1px;
}
.message.is-deleted { opacity: 0.7; }
.deleted-body { font-style: italic; color: #6b7280; }
.tag {
    font-size: 0.65rem;
    padding: 1px 6px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}
.note-tag { background: #f59e0b; color: white; }
.edited-tag { background: #e5e7eb; color: #4b5563; }
.reply-quote {
    border-left: 3px solid #6366f1;
    padding: 0.15rem 0.4rem;
    margin: 0.15rem 0 0.25rem;
    background: rgba(99, 102, 241, 0.06);
    border-radius: 0.25rem;
    font-size: 0.78rem;
    color: #4b5563;
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
}
.reply-quote-sender { font-weight: 600; color: #4338ca; }
.reply-quote-body { white-space: pre-wrap; word-break: break-word; }
.forwarded-label {
    font-size: 0.72rem;
    color: #475569;
    background: rgba(148, 163, 184, 0.15);
    border-left: 3px solid #94a3b8;
    padding: 2px 6px;
    border-radius: 0.25rem;
    margin: 0.1rem 0 0.25rem;
}
.forwarded-label b { color: #1e293b; }
.message-meta {
    display: flex;
    gap: 0.5rem;
    font-size: 0.7rem;
    color: #6b7280;
    margin-bottom: 0.15rem;
}
.message-meta .sender { font-weight: 600; color: #374151; }
.message-body { font-size: 0.95rem; line-height: 1.35; white-space: pre-wrap; word-break: break-word; }
.attachments { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.25rem; }
.attachment {
    font-size: 0.78rem;
    padding: 2px 6px;
    background: #ffffff;
    border-radius: 0.3rem;
    border: 1px solid #e5e7eb;
}
.reactions { display: flex; gap: 0.25rem; margin-top: 0.3rem; flex-wrap: wrap; }
.reaction {
    font-size: 0.8rem;
    padding: 1px 6px;
    background: #ffffff;
    border-radius: 999px;
    border: 1px solid #e5e7eb;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
}
.reaction:hover { background: #f3f4f6; }
.reaction.viewer-reacted {
    background: #eef2ff;
    border-color: #6366f1;
    font-weight: 600;
}
.msg-actions {
    display: flex;
    gap: 0.15rem;
    margin-top: 0.3rem;
    opacity: 0;
    transition: opacity 0.15s;
    align-items: center;
    flex-wrap: wrap;
}
.message:hover .msg-actions { opacity: 1; }
.message.editing .msg-actions { opacity: 1; }
.emoji-btn,
.action-btn {
    background: transparent;
    border: 1px solid transparent;
    padding: 1px 5px;
    font-size: 0.95rem;
    cursor: pointer;
    border-radius: 0.3rem;
}
.emoji-btn:hover,
.action-btn:hover { background: #f3f4f6; border-color: #e5e7eb; }
.action-btn.active {
    background: #eef2ff;
    border-color: #6366f1;
}
.action-btn.danger:hover { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }

.typing-indicator {
    padding: 0.25rem 1rem;
    font-size: 0.8rem;
    color: #6b7280;
    font-style: italic;
}

.compose-wrap {
    border-top: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
}
.compose-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.35rem 0.75rem;
    font-size: 0.78rem;
    background: #f3f4f6;
    border-bottom: 1px solid #e5e7eb;
    gap: 0.5rem;
}
.compose-banner.reply { background: #eef2ff; color: #4338ca; }
.compose-banner.edit { background: #fef3c7; color: #92400e; }
.banner-label { display: inline-flex; gap: 0.35rem; align-items: center; flex: 1; overflow: hidden; }
.banner-preview {
    color: #4b5563;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 240px;
}
.compose-bar {
    display: flex;
    gap: 0.4rem;
    padding: 0.6rem 0.75rem;
    align-items: flex-end;
    border-top: 1px solid #e5e7eb;
}
.compose-wrap .compose-bar { border-top: none; }
.compose-bar.disabled { color: #6b7280; align-items: center; }
.compose-bar.note { background: #fef9c3; }
.compose-bar .draft {
    flex: 1;
    padding: 0.5rem 0.7rem;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    font-size: 0.95rem;
    font-family: inherit;
    line-height: 1.35;
    resize: none;
    overflow-y: hidden;
    min-height: calc(1.35em + 1rem + 2px);
    max-height: calc(1.35em * 3 + 1rem + 2px);
    display: block;
    box-sizing: border-box;
}
.upload-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.4rem 0.55rem;
    background: #f9fafb;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    cursor: pointer;
}
.upload-btn.disabled { opacity: 0.6; cursor: not-allowed; }
.note-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.4rem 0.55rem;
    background: #f9fafb;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 0.82rem;
    color: #4b5563;
    user-select: none;
}
.note-toggle:hover { background: #f3f4f6; }
.note-toggle.on {
    background: #fef3c7;
    border-color: #f59e0b;
    color: #92400e;
    font-weight: 600;
}

.empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
}

button {
    cursor: pointer;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    padding: 0.45rem 0.8rem;
    border-radius: 0.5rem;
    font-size: 0.85rem;
}
button:disabled { opacity: 0.6; cursor: not-allowed; }
button.primary {
    background: #4f46e5;
    color: white;
    border-color: #4338ca;
}
button.primary:hover:not(:disabled) { background: #4338ca; }
button.ghost { background: transparent; }
button.small { padding: 0.3rem 0.55rem; font-size: 0.78rem; }
button.block { width: 100%; }

.hint { color: #6b7280; font-size: 0.85rem; }
.hint.small { font-size: 0.75rem; }
.hint.center { text-align: center; margin: auto; }
.error { color: #b91c1c; font-size: 0.85rem; margin: 0.5rem 0 0; }
.error.small { font-size: 0.75rem; padding: 0 0.75rem 0.5rem; }

.debug-panel {
    margin-top: 1rem;
    border: 1px dashed #cbd5e1;
    border-radius: 0.5rem;
    background: #f8fafc;
    font-size: 0.75rem;
}
.debug-panel > summary {
    cursor: pointer;
    padding: 0.4rem 0.6rem;
    font-weight: 600;
    color: #475569;
    user-select: none;
}
.debug-block { padding: 0 0.6rem 0.5rem; }
.debug-label {
    font-weight: 600;
    color: #1e293b;
    margin: 0.4rem 0 0.2rem;
}
.debug-json {
    background: #0f172a;
    color: #e2e8f0;
    margin: 0;
    padding: 0.5rem;
    border-radius: 0.35rem;
    max-height: 200px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.7rem;
    line-height: 1.3;
}

.fp-backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    z-index: 40;
}
.forward-picker {
    position: fixed;
    z-index: 50;
    width: 260px;
    max-height: 320px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 0.6rem;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.fp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid #e5e7eb;
    font-size: 0.8rem;
    font-weight: 600;
    color: #374151;
    background: #f9fafb;
}
.fp-list {
    overflow-y: auto;
    padding: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
}
.fp-item {
    width: 100%;
    text-align: left;
    background: transparent;
    border: 1px solid transparent;
    padding: 0.4rem 0.5rem;
    border-radius: 0.4rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
}
.fp-item:hover {
    background: #eef2ff;
    border-color: #c7d2fe;
}
.fp-item-name {
    font-weight: 600;
    color: #1f2937;
    font-size: 0.85rem;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
}
.fp-item-current-tag {
    font-size: 0.62rem;
    padding: 1px 5px;
    border-radius: 999px;
    background: #eef2ff;
    color: #4338ca;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}
.fp-item-meta { font-size: 0.7rem; color: #6b7280; }
.fp-empty { padding: 0.75rem; text-align: center; }
</style>
