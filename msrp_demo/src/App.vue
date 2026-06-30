<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { vsipAPI } from './composables'
import { MODULES } from '../../src/enum/modules'
import { MSRP_QUICK_REACTION_EMOJIS } from '../../src/modules/msrp'

// =====================================================================
// LOCAL STORAGE KEYS - mirrors demo_example/main.js naming
// =====================================================================
const LS_DOMAIN = 'sipDomain'
const LS_USERNAME = 'sipUsername'
const LS_PASSWORD = 'sipPassword'
const LS_MSRP_DOMAIN = 'msrpDomain'

// =====================================================================
// LOGIN FORM (localStorage-backed, just like demo_example/main.js)
// =====================================================================
const domain = ref<string>(localStorage.getItem(LS_DOMAIN) ?? '')
const username = ref<string>(localStorage.getItem(LS_USERNAME) ?? '')
const password = ref<string>(localStorage.getItem(LS_PASSWORD) ?? '')
const msrpDomain = ref<string>(localStorage.getItem(LS_MSRP_DOMAIN) ?? '')

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
            { session_timers: false },
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
    domain.value = ''
    username.value = ''
    password.value = ''
    msrpDomain.value = ''
}

// =====================================================================
// MSRP SESSION JOIN - mirrors demo_example/main.js btn-join-conversation
// =====================================================================
function handleStartMSRPSession () {
    actions.initMSRP()
}

// =====================================================================
// CONVERSATION LIST + CURRENT CONVERSATION
// =====================================================================
const newConversationTarget = ref<string>('')

function handleCreateConversation () {
    const target = newConversationTarget.value.trim()
    if (!target) return
    const ok = actions.sendCreateConversationMessage(target)
    if (ok) newConversationTarget.value = ''
}

function handleSelectConversation (key: string) {
    actions.setActiveConversation(key)
}

function handleLeaveConversation (key: string) {
    actions.leaveConversation(key)
}

function handleCloseConversation (key: string) {
    actions.closeConversation(key)
}

function handleAcceptInvite (key: string) {
    actions.acceptInvite(key)
    actions.setActiveConversation(key)
}

function handleRejectInvite (key: string) {
    actions.rejectInvite(key)
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

// =====================================================================
// COMPOSE BAR
// =====================================================================
const draft = ref<string>('')
const chatMessagesEl = ref<HTMLDivElement | null>(null)

function handleSend () {
    const key = state.currentConversationKey.value
    const text = draft.value.trim()
    if (!key || !text) return
    const ok = actions.sendTextMessage(key, text)
    if (ok) {
        draft.value = ''
        actions.stopTypingKeepAlive(true)
    }
}

function handleDraftInput () {
    const key = state.currentConversationKey.value
    if (!key) return
    if (draft.value.trim()) {
        actions.startTypingKeepAlive(key)
    } else {
        actions.stopTypingKeepAlive(true)
    }
}

// =====================================================================
// FILE UPLOAD
// =====================================================================
const uploadInputRef = ref<HTMLInputElement | null>(null)
const isUploading = ref<boolean>(false)
const uploadError = ref<string>('')

async function handleFileSelected (event: Event) {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return
    const key = state.currentConversationKey.value
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

// =====================================================================
// REACTIONS
// =====================================================================
function handleAddReaction (eventId: string, emoji: string) {
    const key = state.currentConversationKey.value
    if (!key || !eventId) return
    actions.sendReaction(key, eventId, emoji)
}

// =====================================================================
// ROLE MANAGEMENT
// =====================================================================
function handleChangeRole (targetUri: string, newRole: string) {
    const key = state.currentConversationKey.value
    if (!key) return
    actions.changeMemberRole(key, targetUri, newRole as 'in_charge' | 'manager' | 'assigned')
}

// =====================================================================
// AUTO-SCROLL CHAT ON NEW MESSAGE
// =====================================================================
const sortedMessages = computed(() => {
    return [ ...state.currentMessages.value ].sort(
        (a, b) => (a.origin_server_ts || 0) - (b.origin_server_ts || 0)
    )
})

watch(sortedMessages, async () => {
    await nextTick()
    if (chatMessagesEl.value) {
        chatMessagesEl.value.scrollTop = chatMessagesEl.value.scrollHeight
    }
})

// =====================================================================
// HELPERS
// =====================================================================
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
    return MSRP_QUICK_REACTION_EMOJIS
}

// =====================================================================
// DEBUG PANEL - live JSON view of reactive state.
// Map/Set values are not JSON-serialisable by default, so we coerce
// them via a custom replacer.
// =====================================================================
function debugReplacer (_key: string, value: unknown): unknown {
    if (value instanceof Map) return Object.fromEntries(value.entries())
    if (value instanceof Set) return Array.from(value)
    return value
}

const debugConversations = computed(() =>
    JSON.stringify(state.conversations.value, debugReplacer, 2)
)
const debugCurrentConversationKey = computed(() =>
    JSON.stringify(state.currentConversationKey.value, debugReplacer, 2)
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

// Reset draft + typing when active conversation changes
watch(() => state.currentConversationKey.value, (next, prev) => {
    if (prev) actions.stopTypingKeepAlive(false)
    draft.value = ''
})

onBeforeUnmount(() => {
    actions.stopTypingKeepAlive(false)
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

        <!-- ====================== LOGIN ====================== -->
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

            <div class="row">
                <button class="primary" :disabled="isConnecting" @click="handleConnect">
                    {{ isConnecting ? 'Connecting...' : 'Connect' }}
                </button>
                <button class="ghost" @click="handleForget">Forget credentials</button>
            </div>

            <p v-if="connectError" class="error">{{ connectError }}</p>
        </section>

        <!-- ====================== MAIN UI ====================== -->
        <main v-else class="main">
            <!-- Sidebar -->
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
                        :key="conv.conversationKey"
                        :class="{
                            active: conv.conversationKey === state.currentConversationKey.value,
                            invite: conv.currentUserStatus === 'invite'
                        }"
                    >
                        <div v-if="conv.currentUserStatus === 'invite'" class="invite-card">
                            <div class="invite-title">📨 {{ conv.conversationKey }}</div>
                            <div v-if="conv.creator" class="invite-from">
                                From: {{ extractSipUser(conv.creator) }}
                            </div>
                            <div class="invite-actions">
                                <button class="primary small" @click="handleAcceptInvite(conv.conversationKey)">
                                    Accept
                                </button>
                                <button class="ghost small" @click="handleRejectInvite(conv.conversationKey)">
                                    Reject
                                </button>
                            </div>
                        </div>
                        <button
                            v-else
                            class="conversation-btn"
                            @click="handleSelectConversation(conv.conversationKey)"
                        >
                            <span class="name">{{ conv.conversationKey }}</span>
                            <span
                                v-if="state.unreadByConversation.value[conv.conversationKey]"
                                class="unread"
                            >
                                {{ state.unreadByConversation.value[conv.conversationKey] }}
                            </span>
                        </button>
                    </li>
                </ul>
                <p v-else class="hint">
                    No conversations yet. {{
                        state.hasActiveMsrpSession.value
                            ? 'Invite someone to start.'
                            : 'Start an MSRP session first.'
                    }}
                </p>

                <!-- ============ DEBUG PANEL (temporary) ============ -->
                <details class="debug-panel" open>
                    <summary>Debug · reactive state</summary>
                    <div class="debug-block">
                        <div class="debug-label">currentConversationKey</div>
                        <pre class="debug-json">{{ debugCurrentConversationKey }}</pre>
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

            <!-- Chat panel -->
            <section class="chat-panel">
                <div v-if="!state.currentConversation.value" class="empty-state">
                    <p>Select or create a conversation to start chatting.</p>
                </div>

                <template v-else>
                    <header class="chat-header">
                        <div>
                            <h2>{{ state.currentConversation.value.conversationKey }}</h2>
                            <p class="subtitle">
                                {{ state.currentConversation.value.members.size }}
                                member{{ state.currentConversation.value.members.size === 1 ? '' : 's' }}
                                <span v-if="myRoleLabel"> · You: {{ myRoleLabel }}</span>
                                <span v-if="isCurrentConversationClosed" class="badge warn">closed</span>
                            </p>
                        </div>
                        <div class="header-actions">
                            <button
                                v-if="!isCurrentConversationClosed
                                    && (state.currentConversation.value.currentUserRole === 'in_charge'
                                        || state.currentConversation.value.currentUserRole === 'manager')"
                                class="ghost small"
                                @click="handleCloseConversation(state.currentConversation.value.conversationKey)"
                            >
                                Close
                            </button>
                            <button
                                class="ghost small"
                                @click="handleLeaveConversation(state.currentConversation.value.conversationKey)"
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
                        <div
                            v-for="msg in sortedMessages"
                            :key="msg.event_id ?? `${msg.origin_server_ts}-${msg.sender}`"
                            class="message"
                            :class="{ mine: extractSipUser(msg.sender) === username }"
                        >
                            <div class="message-meta">
                                <span class="sender">{{ extractSipUser(msg.sender) }}</span>
                                <span class="time">{{ formatTime(msg.origin_server_ts) }}</span>
                                <span class="status">{{ statusIcon(msg.content?.status) }}</span>
                            </div>
                            <div class="message-body">{{ msg.content?.content }}</div>
                            <div
                                v-if="msg.content?.attachments?.length"
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
                                v-if="msg.content?.reactions_summary?.length"
                                class="reactions"
                            >
                                <span
                                    v-for="r in msg.content.reactions_summary"
                                    :key="r.emoji ?? r.key"
                                    class="reaction"
                                >
                                    {{ r.emoji ?? r.key }} {{ r.count }}
                                </span>
                            </div>
                            <div v-if="msg.event_id" class="reaction-picker">
                                <button
                                    v-for="emoji in quickReactions()"
                                    :key="emoji"
                                    class="emoji-btn"
                                    @click="handleAddReaction(msg.event_id, emoji)"
                                >
                                    {{ emoji }}
                                </button>
                            </div>
                        </div>
                        <p v-if="!sortedMessages.length" class="hint center">
                            No messages yet. Say hello.
                        </p>
                    </div>

                    <div
                        v-if="state.typingByConversation.value[state.currentConversation.value.conversationKey]"
                        class="typing-indicator"
                    >
                        {{ extractSipUser(
                            state.typingByConversation.value[state.currentConversation.value.conversationKey].sender
                        ) }} is typing…
                    </div>

                    <footer v-if="canSend" class="compose-bar">
                        <label class="upload-btn" :class="{ disabled: isUploading }">
                            📎
                            <input
                                ref="uploadInputRef"
                                type="file"
                                hidden
                                :disabled="isUploading"
                                @change="handleFileSelected"
                            />
                        </label>
                        <input
                            v-model="draft"
                            class="draft"
                            placeholder="Type a message…"
                            @input="handleDraftInput"
                            @keypress.enter="handleSend"
                        />
                        <button class="primary" :disabled="!draft.trim()" @click="handleSend">
                            ➤
                        </button>
                    </footer>
                    <footer v-else class="compose-bar disabled">
                        <span class="hint">
                            {{
                                isCurrentConversationClosed
                                    ? 'This conversation is closed.'
                                    : 'Managers cannot send customer-visible messages.'
                            }}
                        </span>
                    </footer>

                    <p v-if="uploadError" class="error small">{{ uploadError }}</p>
                    <p v-if="isUploading" class="hint small">Uploading…</p>
                </template>
            </section>
        </main>
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

/* ---------- Login ---------- */
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
.row { display: flex; gap: 0.5rem; margin-top: 0.5rem; }

/* ---------- Main layout ---------- */
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

.invite-card {
    background: #fef3c7;
    border: 1px solid #fbbf24;
    border-radius: 0.5rem;
    padding: 0.6rem;
}
.invite-title { font-weight: 600; }
.invite-from { font-size: 0.8rem; color: #6b7280; margin: 0.25rem 0; }
.invite-actions { display: flex; gap: 0.35rem; }

/* ---------- Chat panel ---------- */
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

.chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
}
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
.reactions { display: flex; gap: 0.25rem; margin-top: 0.3rem; }
.reaction {
    font-size: 0.8rem;
    padding: 1px 6px;
    background: #ffffff;
    border-radius: 999px;
    border: 1px solid #e5e7eb;
}
.reaction-picker {
    display: flex;
    gap: 0.15rem;
    margin-top: 0.3rem;
    opacity: 0;
    transition: opacity 0.15s;
}
.message:hover .reaction-picker { opacity: 1; }
.emoji-btn {
    background: transparent;
    border: 1px solid transparent;
    padding: 1px 4px;
    font-size: 0.95rem;
    cursor: pointer;
    border-radius: 0.3rem;
}
.emoji-btn:hover { background: #f3f4f6; border-color: #e5e7eb; }

.typing-indicator {
    padding: 0.25rem 1rem;
    font-size: 0.8rem;
    color: #6b7280;
    font-style: italic;
}

.compose-bar {
    display: flex;
    gap: 0.4rem;
    padding: 0.6rem 0.75rem;
    border-top: 1px solid #e5e7eb;
    align-items: center;
}
.compose-bar.disabled { color: #6b7280; }
.compose-bar .draft {
    flex: 1;
    padding: 0.5rem 0.7rem;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    font-size: 0.95rem;
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

.empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
}

/* ---------- buttons ---------- */
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

/* ---------- text ---------- */
.hint { color: #6b7280; font-size: 0.85rem; }
.hint.small { font-size: 0.75rem; }
.hint.center { text-align: center; margin: auto; }
.error { color: #b91c1c; font-size: 0.85rem; margin: 0.5rem 0 0; }
.error.small { font-size: 0.75rem; padding: 0 0.75rem 0.5rem; }

/* ---------- debug panel (temporary) ---------- */
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
</style>
