import { simplifyMessageObject } from '@/helpers/audio.helper'
import { CALL_EVENT_LISTENER_TYPE } from '@/enum/call.event.listener.type'
import { EndEvent, IncomingAckEvent, OutgoingAckEvent } from 'jssip/lib/RTCSession'
import { IMessage, MSRPSessionExtended, TriggerMSRPListenerOptions } from '@/types/msrp'
import MSRPMessage from '@/lib/msrp/message'
import { MSRPSessionEvent } from '@/helpers/UA'

// ---------- CONVERSATION EVENT TYPES (backend v3 — June 2026) ----------
export const MSRP_EVT = {
    CREATE: 'm.conversation.create',
    MESSAGE: 'm.conversation.message',
    MEMBER: 'm.conversation.member',
    CLOSED: 'm.conversation.closed',
    SYNC: 'm.sync',
    UPLOAD_REQUEST: 'm.upload.request',
    UPLOAD_RESPONSE: 'm.upload.response',
    FILE_ACCESS_REQUEST: 'm.file.access.request',
    FILE_ACCESS_RESPONSE: 'm.file.access.response',
    REACTION: 'm.reaction',
    TYPING: 'm.typing',
    SENT: 'm.sent',
    DELIVERED: 'm.delivered',
    READ: 'm.read',
    FAILED: 'm.failed',
    SENDING: 'm.sending'
} as const

export const MSRP_STATE_MEMBER = 'm.conversation.member'
export const MSRP_STATE_CREATE = 'm.conversation.create'
export const MSRP_STATE_CLOSED = 'm.conversation.closed'

export type MSRPMemberRole = 'in_charge' | 'manager' | 'assigned'
export type MSRPMembership = 'join' | 'leave' | 'invite' | 'ban'
export type MSRPMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface MSRPConversationState {
    conversationKey: string
    creator: string | null
    members: Set<string>
    memberRoles: Map<string, MSRPMemberRole>
    currentUserRole: MSRPMemberRole
    currentUserStatus: MSRPMembership | null
    state_events: { [key: string]: { [stateKey: string]: any } }
    created_at: number
    updated_at: number
    status?: string
}

export interface MSRPUploadResult {
    upload_url: string
    expires_in?: number
    mime_type: string
    request_id: string
    filename?: string
    preview_url?: string
    icon_url?: string
    transcription?: string
    media_type?: string
}

interface PendingPromise<T> {
    resolve: (value: T) => void
    reject: (reason?: any) => void
}

// Tiny RFC4122-ish UUID v4 fallback so the module works in any browser even
// when crypto.randomUUID() is unavailable.
function generateUuid (): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}

function generateRequestId (prefix = 'req'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function normalizeMessageContent (content: any) {
    if (!content) return content
    if (!Array.isArray(content.attachments)) {
        content.attachments = []
    }
    return content
}

function normalizeIncomingEvent (event: any) {
    if (!event) return event
    if (event.content) normalizeMessageContent(event.content)
    return event
}

function normalizeStateEvents (stateEvents: any) {
    return stateEvents ?? {}
}

function messageHasContent (content: any): boolean {
    if (!content) return false
    normalizeMessageContent(content)
    return !!(content.content || content.attachments?.length)
}

function getMessageTypeFromMime (mimeType?: string): string {
    if (!mimeType) return 'file'
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('video/')) return 'video'
    if (mimeType.startsWith('audio/')) return 'audio'
    return 'file'
}

export class MSRPModule {
    private context: any

    private msrpSession: IMessage | null = null
    private extendedSession: IMessage | null = null

    private isMSRPInitializingValue: boolean | undefined

    // ---------- CONVERSATION STATE ----------
    private conversationsMap: Map<string, MSRPConversationState> = new Map()

    // ---------- IN-FLIGHT REQUEST/RESPONSE TRACKING ----------
    private pendingUploads: Map<string, PendingPromise<MSRPUploadResult>> = new Map()
    private pendingFileAccessRequests: Map<string, PendingPromise<string>> = new Map()
    private uploadRequestTimeoutMs = 30000
    private fileAccessTimeoutMs = 30000

    // ---------- TYPING KEEPALIVE ----------
    private typingKeepAliveInterval: ReturnType<typeof setInterval> | null = null
    private typingKeepAliveConversationKey: string | null = null
    private typingKeepAliveIntervalMs = 2000

    constructor (context: any) {
        this.context = context

        this.context.on(
            this.context.newMSRPSessionEventName,
            this.newMSRPSessionCallback.bind(this)
        )
    }

    // =====================================================================
    // PUBLIC GETTERS
    // =====================================================================

    public get isMSRPInitializing () {
        return this.isMSRPInitializingValue
    }

    public get getMsrpSession () {
        return this.msrpSession
    }

    public get hasActiveSession (): boolean {
        return this.extendedSession !== null
    }

    public get conversations (): { [key: string]: MSRPConversationState } {
        const result: { [key: string]: MSRPConversationState } = {}
        this.conversationsMap.forEach((value, key) => {
            result[key] = value
        })
        return result
    }

    // =====================================================================
    // SESSION LIFECYCLE (existing)
    // =====================================================================

    public msrpAnswer (_callId: string) {
        if (!this.extendedSession) {
            return
        }

        // TODO: uncomment
        //this.extendedSession.answer(this.sipOptions)
        this.updateMSRPSession(this.extendedSession)
    }

    public updateMSRPSession (value: IMessage) {
        this.msrpSession = simplifyMessageObject(value) as IMessage
        this.context.emit('changeMsrpSession', this.msrpSession)
    }

    private setMSRPSession (value: IMessage) {
        this.msrpSession = simplifyMessageObject(value) as IMessage
        this.extendedSession = value
        this.context.emit('changeMsrpSession', this.msrpSession)
    }

    private addMSRPMessage (value: MSRPMessage, session: MSRPSessionExtended) {
        this.context.emit('newMSRPMessage', {
            message: value,
            session: session
        })
    }

    public messageTerminate (_callId: string) {
        if (!this.extendedSession) {
            return
        }

        if (this.extendedSession._status !== 8) {
            this.extendedSession.terminate()
        }
    }

    private addMessageSession (session: MSRPSessionExtended) {
        if (!session._id) {
            return
        }

        if (this.extendedSession?._id === session._id) {
            return
        }

        this.setMSRPSession(session as IMessage)
    }

    private triggerMSRPListener ({ listenerType, session, event }: TriggerMSRPListenerOptions) {
        const listeners = this.context.listenersList[listenerType]

        if (!listeners || !listeners.length) {
            return
        }

        listeners.forEach((listener: any) => {
            listener(session, event)
        })
    }

    private clearMSRPSession () {
        this.msrpSession = null
        this.extendedSession = null

        this.context.emit('changeMsrpSession', this.msrpSession)
    }

    private newMSRPSessionCallback (event: MSRPSessionEvent) {
        if (!event.session._id) {
            event.session._id = event.request.call_id + event.request.from._parameters.tag
        }
        const session = event.session as MSRPSessionExtended

        session.on('ended', (event: EndEvent) => {
            this.triggerMSRPListener({
                listenerType: CALL_EVENT_LISTENER_TYPE.CALL_ENDED,
                session,
                event
            })
            if (this.extendedSession?._id === session._id) {
                this.clearMSRPSession()
            }
        })

        session.on('failed', (event: EndEvent) => {
            this.triggerMSRPListener({
                listenerType: CALL_EVENT_LISTENER_TYPE.CALL_FAILED,
                session,
                event
            })

            if (this.extendedSession?._id === session._id) {
                this.clearMSRPSession()
            }
        })
        session.on('confirmed', (event: IncomingAckEvent | OutgoingAckEvent) => {
            this.triggerMSRPListener({
                listenerType: CALL_EVENT_LISTENER_TYPE.CALL_CONFIRMED,
                session,
                event
            })
            this.updateMSRPSession(session as IMessage)
        })

        session.on('newMessage', (msg: unknown) => {
            this.addMSRPMessage(msg as MSRPMessage, session)
            this.processIncomingMSRPMessage(msg)
        })

        this.addMessageSession(session)
    }

    private setIsMSRPInitializing (value: boolean) {
        this.isMSRPInitializingValue = value
        this.context.emit('isMSRPInitializingChanged', value)
    }

    private getUserUri (): string {
        if (!this.context.configuration?.uri) return ''
        return typeof this.context.configuration.uri === 'string'
            ? this.context.configuration.uri
            : this.context.configuration.uri.toString()
    }

    public initMSRP (options: any = {}) {
        const identity = this.extractSipUser(this.getUserUri())
        if (!identity) {
            return console.error('Cannot init MSRP: current user SIP identity not available')
        }

        const session = this.context.startMSRP(identity, options) as MSRPSessionExtended
        session.on('active', () => {
            this.addMessageSession(session)
            session.sendMSRP('')
            this.setIsMSRPInitializing(false)
        })

        this.setIsMSRPInitializing(true)
    }

    public initMSRPAndSendMessage (target: string, body: string, options: any = {}) {
        if (target.length === 0) {
            return console.error('Target must be a valid string')
        }

        const session = this.context.startMSRP(target, options) as MSRPSessionExtended
        session.on('active', () => {
            this.addMessageSession(session)
            session.sendMSRP(body)
            this.setIsMSRPInitializing(false)
        })

        this.setIsMSRPInitializing(true)
    }

    public sendMSRP (_msrpSessionId: string, body: string) {
        if (!this.extendedSession) {
            throw new Error('No active MSRP session')
        }

        this.extendedSession.sendMSRP(body)
    }

    /**
     * Safe wrapper around session.sendMSRP. Returns true when the message was
     * handed off to the session; false when there is no active session or the
     * underlying send threw.
     */
    public safeSendMSRP (body: string): boolean {
        if (!this.msrpSession || !this.extendedSession) {
            console.warn('safeSendMSRP: no active MSRP session - message dropped', body)
            return false
        }
        try {
            this.extendedSession.sendMSRP(body)
            return true
        } catch (err) {
            console.error('safeSendMSRP error:', err)
            this.clearMSRPSession()
            return false
        }
    }

    // EVENT BUILDERS
    private buildCreateConversationEvent (inviteeSipUris: string[]) {
        return {
            type: MSRP_EVT.CREATE,
            sender: this.getUserUri(),
            origin_server_ts: Date.now(),
            content: {
                creator: this.getUserUri(),
                invitee: inviteeSipUris
            }
        }
    }

    private buildTextMessageEvent (conversationKey: string, text: string) {
        return {
            type: MSRP_EVT.MESSAGE,
            conversationKey,
            sender: this.getUserUri(),
            origin_server_ts: Date.now(),
            content: {
                message_type: 'text',
                content: text,
                txn_id: generateUuid()
            }
        }
    }

    private buildMediaMessageEvent (conversationKey: string, uploadResult: MSRPUploadResult, caption = '') {
        const messageType = uploadResult.media_type || getMessageTypeFromMime(uploadResult.mime_type)
        const attachment: Record<string, any> = {
            kind: messageType,
            mime_type: uploadResult.mime_type,
            filename: uploadResult.filename
        }
        if (uploadResult.preview_url) attachment.preview_url = uploadResult.preview_url
        if (uploadResult.icon_url) attachment.icon_url = uploadResult.icon_url
        if (uploadResult.transcription) attachment.transcription = uploadResult.transcription

        return {
            type: MSRP_EVT.MESSAGE,
            conversationKey,
            sender: this.getUserUri(),
            origin_server_ts: Date.now(),
            content: {
                message_type: messageType,
                content: caption || uploadResult.filename || '',
                attachments: [ attachment ],
                txn_id: generateUuid()
            }
        }
    }

    private buildMemberEvent (
        conversationKey: string,
        stateKey: string,
        membership: MSRPMembership,
        role?: MSRPMemberRole
    ) {
        const evt: Record<string, any> = {
            type: MSRP_EVT.MEMBER,
            conversationKey,
            sender: this.getUserUri(),
            state_key: stateKey,
            origin_server_ts: Date.now(),
            content: { membership }
        }
        if (role) evt.content.role = role
        return evt
    }

    private buildCloseConversationEvent (
        conversationKey: string,
        reason = 'Conversation resolved',
        cause = 'resolved'
    ) {
        const now = Date.now()
        return {
            type: MSRP_EVT.CLOSED,
            conversationKey,
            sender: this.getUserUri(),
            origin_server_ts: now,
            content: {
                reason,
                cause,
                closed_by: this.getUserUri(),
                closed_at: now
            }
        }
    }

    private buildReactionEvent (conversationKey: string, targetEventId: string, emoji: string) {
        return {
            type: MSRP_EVT.REACTION,
            conversationKey,
            sender: this.getUserUri(),
            origin_server_ts: Date.now(),
            content: {
                relates_to: { event_id: targetEventId, key: emoji }
            }
        }
    }

    private buildTypingEvent (conversationKey: string, isTyping: boolean) {
        return {
            type: MSRP_EVT.TYPING,
            conversationKey,
            sender: this.getUserUri(),
            origin_server_ts: Date.now(),
            content: { typing: isTyping }
        }
    }

    private buildReadReceiptEvent (conversationKey: string, lastEventId: string) {
        return {
            type: MSRP_EVT.READ,
            event_id: lastEventId,
            conversationKey,
            sender: this.getUserUri(),
            origin_server_ts: Date.now(),
            content: { ts: Date.now(), up_to: true }
        }
    }

    // PUBLIC ACTIONS — outgoing requests
    public sendCreateConversationMessage (targetSip: string | string[]): boolean {
        if (!this.extendedSession) {
            console.warn('No MSRP session available for creating conversation')
            return false
        }

        const targets = Array.isArray(targetSip) ? targetSip : [ targetSip ]
        const sipUris = targets
            .map((t) => (t ?? '').trim())
            .filter((t) => t.length > 0)
            .map((t) => (t.startsWith('sip:') ? t : `sip:${t}@${this.context.sipDomain}`))

        if (sipUris.length === 0) {
            console.log('Room creation cancelled - invitee required')
            return false
        }

        return this.safeSendMSRP(JSON.stringify(this.buildCreateConversationEvent(sipUris)))
    }

    public sendTextMessage (conversationKey: string, text: string): boolean {
        const trimmed = (text ?? '').trim()
        if (!conversationKey || !trimmed) return false
        return this.safeSendMSRP(JSON.stringify(this.buildTextMessageEvent(conversationKey, trimmed)))
    }

    public sendMediaMessage (
        conversationKey: string,
        uploadResult: MSRPUploadResult,
        caption = ''
    ): boolean {
        if (!conversationKey || !uploadResult) return false
        return this.safeSendMSRP(JSON.stringify(this.buildMediaMessageEvent(conversationKey, uploadResult, caption)))
    }

    public sendReaction (conversationKey: string, targetEventId: string, emoji: string): boolean {
        if (!conversationKey || !targetEventId || !emoji) return false
        return this.safeSendMSRP(JSON.stringify(this.buildReactionEvent(conversationKey, targetEventId, emoji)))
    }

    public sendTypingIndicator (conversationKey: string, isTyping: boolean): boolean {
        if (!conversationKey) return false
        return this.safeSendMSRP(JSON.stringify(this.buildTypingEvent(conversationKey, isTyping)))
    }

    public startTypingKeepAlive (conversationKey: string): void {
        if (!conversationKey) return
        this.stopTypingKeepAlive(false)
        this.typingKeepAliveConversationKey = conversationKey
        this.sendTypingIndicator(conversationKey, true)
        this.typingKeepAliveInterval = setInterval(() => {
            if (this.typingKeepAliveConversationKey && this.hasActiveSession) {
                this.sendTypingIndicator(this.typingKeepAliveConversationKey, true)
            } else {
                this.stopTypingKeepAlive(true)
            }
        }, this.typingKeepAliveIntervalMs)
    }

    public stopTypingKeepAlive (sendStop = true): void {
        if (this.typingKeepAliveInterval) {
            clearInterval(this.typingKeepAliveInterval)
            this.typingKeepAliveInterval = null
        }
        const stoppedKey = this.typingKeepAliveConversationKey
        this.typingKeepAliveConversationKey = null
        if (sendStop && stoppedKey) {
            this.sendTypingIndicator(stoppedKey, false)
        }
    }

    public sendReadReceipt (conversationKey: string, lastEventId: string): boolean {
        if (!conversationKey || !lastEventId || !this.hasActiveSession) return false
        return this.safeSendMSRP(JSON.stringify(this.buildReadReceiptEvent(conversationKey, lastEventId)))
    }

    /**
     * Close a conversation. Only callers with role 'in_charge' or 'manager'
     * are allowed by the backend.
     */
    public closeConversation (
        conversationKey: string,
        reason = 'Conversation resolved',
        cause = 'resolved'
    ): boolean {
        const conversation = this.conversationsMap.get(conversationKey)
        if (!conversation || this.isConversationClosed(conversation)) return false

        const myRole = conversation.currentUserRole || 'assigned'
        if (myRole !== 'in_charge' && myRole !== 'manager') return false

        return this.safeSendMSRP(JSON.stringify(this.buildCloseConversationEvent(conversationKey, reason, cause)))
    }

    /**
     * Change another member's role inside a conversation. The current user
     * must be 'in_charge' or 'manager'.
     */
    public changeMemberRole (
        conversationKey: string,
        targetUri: string,
        newRole: MSRPMemberRole
    ): boolean {
        const conversation = this.conversationsMap.get(conversationKey)
        const myRole = conversation?.currentUserRole || 'assigned'
        if (myRole !== 'in_charge' && myRole !== 'manager') {
            console.warn('Not authorized to change roles (role:', myRole, ')')
            return false
        }
        return this.safeSendMSRP(
            JSON.stringify(this.buildMemberEvent(conversationKey, targetUri, 'join', newRole))
        )
    }

    public acceptInvite (conversationKey: string): boolean {
        return this.safeSendMSRP(
            JSON.stringify(this.buildMemberEvent(conversationKey, this.getUserUri(), 'join'))
        )
    }

    public rejectInvite (conversationKey: string): boolean {
        const sent = this.safeSendMSRP(
            JSON.stringify(this.buildMemberEvent(conversationKey, this.getUserUri(), 'leave'))
        )
        if (sent && this.conversationsMap.delete(conversationKey)) {
            this.context.emit('msrpConversationRemoved', { conversationKey })
        }
        return sent
    }

    public leaveConversation (conversationKey: string): boolean {
        const sent = this.safeSendMSRP(
            JSON.stringify(this.buildMemberEvent(conversationKey, this.getUserUri(), 'leave'))
        )
        if (sent && this.conversationsMap.delete(conversationKey)) {
            this.context.emit('msrpConversationRemoved', { conversationKey })
        }
        return sent
    }

    /**
     * Ask the server for a presigned upload URL via MSRP. Resolves with the
     * upload metadata once the matching `m.upload.response` arrives, or
     * rejects after `uploadRequestTimeoutMs` if no response is received.
     */
    public requestUploadUrl (
        conversationKey: string,
        filename: string,
        mimeType: string,
        fileSize: number
    ): Promise<MSRPUploadResult> {
        return new Promise<MSRPUploadResult>((resolve, reject) => {
            if (!this.hasActiveSession) {
                reject(new Error('No MSRP session available'))
                return
            }

            const requestId = generateRequestId('upload')
            const uploadRequest = {
                type: MSRP_EVT.UPLOAD_REQUEST,
                conversationKey,
                sender: this.getUserUri(),
                origin_server_ts: Date.now(),
                content: {
                    request_id: requestId,
                    filename,
                    mime_type: mimeType,
                    file_size: fileSize
                }
            }

            this.pendingUploads.set(requestId, { resolve, reject })

            setTimeout(() => {
                if (this.pendingUploads.has(requestId)) {
                    this.pendingUploads.delete(requestId)
                    reject(new Error('Upload request timeout'))
                }
            }, this.uploadRequestTimeoutMs)

            if (!this.safeSendMSRP(JSON.stringify(uploadRequest))) {
                this.pendingUploads.delete(requestId)
                reject(new Error('Failed to send upload request'))
            }
        })
    }

    /**
     * Ask the server for a one-shot download URL for a previously-uploaded
     * file. Resolves with the download URL, rejects on timeout or explicit
     * server error.
     */
    public requestFileAccess (conversationKey: string, eventId: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            if (!this.hasActiveSession) {
                reject(new Error('No MSRP session available'))
                return
            }

            const requestId = generateRequestId('file-access-req')
            const accessRequest = {
                type: MSRP_EVT.FILE_ACCESS_REQUEST,
                event_id: requestId,
                conversationKey,
                sender: this.getUserUri(),
                content: {
                    request_id: requestId,
                    event_id: eventId
                }
            }

            this.pendingFileAccessRequests.set(requestId, { resolve, reject })

            setTimeout(() => {
                if (this.pendingFileAccessRequests.has(requestId)) {
                    this.pendingFileAccessRequests.delete(requestId)
                    reject(new Error('File access request timed out'))
                }
            }, this.fileAccessTimeoutMs)

            if (!this.safeSendMSRP(JSON.stringify(accessRequest))) {
                this.pendingFileAccessRequests.delete(requestId)
                reject(new Error('Failed to send file access request'))
            }
        })
    }

    /**
     * High-level helper: request a presigned URL, POST the file to it, then
     * send the resulting media message into the conversation in one go.
     */
    public async uploadFile (
        conversationKey: string,
        file: File,
        caption = ''
    ): Promise<MSRPUploadResult> {
        if (!conversationKey) throw new Error('conversationKey is required')
        if (!file) throw new Error('file is required')

        const uploadMeta = await this.requestUploadUrl(
            conversationKey,
            file.name,
            file.type || 'application/octet-stream',
            file.size
        )

        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch(uploadMeta.upload_url, { method: 'POST', body: formData })
        if (!response.ok) {
            const err: any = await response.json().catch(() => ({}))
            throw new Error(err?.error || `Upload failed: HTTP ${response.status}`)
        }

        const result = (await response.json()) as MSRPUploadResult
        this.sendMediaMessage(conversationKey, result, caption)
        return result
    }

    // INCOMING EVENT PROCESSING
    private processIncomingMSRPMessage (msg: any) {
        if (!msg || msg.direction === 'outgoing') return

        let event: any
        try {
            event = JSON.parse(msg.body)
        } catch (e) {
            console.warn('Received non-JSON MSRP message', msg.body)
            return
        }

        this.handleIncomingEvent(event)
    }

    private handleIncomingEvent (rawEvent: any) {
        const event = normalizeIncomingEvent(rawEvent)
        if (!event || !event.type) return

        switch (event.type) {
            case MSRP_EVT.SYNC:
                this.handleIncomingSync(event)
                break
            case MSRP_EVT.CREATE:
                this.handleIncomingConversationCreate(event)
                break
            case MSRP_EVT.MESSAGE:
                this.handleIncomingConversationMessage(event)
                break
            case MSRP_EVT.MEMBER:
                this.handleIncomingConversationMember(event)
                break
            case MSRP_EVT.CLOSED:
                this.handleIncomingConversationClosed(event)
                break
            case MSRP_EVT.REACTION:
                this.handleIncomingReaction(event)
                break
            case MSRP_EVT.TYPING:
                this.handleIncomingTyping(event)
                break
            case MSRP_EVT.SENT:
            case MSRP_EVT.SENDING:
            case MSRP_EVT.DELIVERED:
            case MSRP_EVT.READ:
            case MSRP_EVT.FAILED:
                this.handleIncomingReceipt(event)
                break
            case MSRP_EVT.UPLOAD_RESPONSE:
                this.handleIncomingUploadResponse(event)
                break
            case MSRP_EVT.FILE_ACCESS_RESPONSE:
                this.handleIncomingFileAccessResponse(event)
                break
            default:
                console.warn('Unhandled MSRP event:', event.type, event)
        }
    }

    private handleIncomingSync (event: any) {
        if (!event.content) return
        const conversations = event.content.conversations ?? []
        const currentUserUri = this.getUserUri()
        const currentUserName = this.extractSipUser(currentUserUri)

        const messagesByConversation: { [key: string]: any[] } = {}

        conversations.forEach((conv: any) => {
            const key = this.conversationKeyOf(conv)
            if (!key) return
            const { creator, timeline, created_at, updated_at } = conv
            const stateEvents = normalizeStateEvents(conv.state_events)

            const members = new Set<string>()
            const memberRoles = new Map<string, MSRPMemberRole>()
            let currentUserStatus: MSRPMembership | null = null
            let currentUserRole: MSRPMemberRole = 'assigned'

            if (stateEvents[MSRP_STATE_MEMBER]) {
                Object.entries<any>(stateEvents[MSRP_STATE_MEMBER]).forEach(([ userId, memberEvent ]) => {
                    const membership = memberEvent.content?.membership as MSRPMembership | undefined
                    const role = (memberEvent.content?.role || 'assigned') as MSRPMemberRole

                    const userName = this.extractSipUser(userId)
                    if (userName === currentUserName) {
                        currentUserStatus = membership ?? null
                        if (membership === 'join') {
                            currentUserRole = role
                        }
                    }

                    if (membership === 'join') {
                        members.add(userId)
                        memberRoles.set(userId, role)
                    }
                })
            }

            const historicalMessages = (timeline || [])
                .filter((e: any) => e.type === MSRP_EVT.MESSAGE)
                .map((e: any) => normalizeIncomingEvent({ ...e }))
            if (historicalMessages.length > 0) {
                messagesByConversation[key] = historicalMessages
            }

            this.upsertConversationState(key, {
                conversationKey: key,
                creator: creator ?? null,
                members,
                memberRoles,
                currentUserRole,
                currentUserStatus,
                state_events: stateEvents,
                created_at: created_at || Date.now(),
                updated_at: updated_at || Date.now(),
                status: conv.status
            })
        })

        // m.sync is the one legitimate bulk-replace - everything else uses
        // granular events. Hand consumers their own copy of every
        // conversation so internal mutations stay isolated. Historical
        // messages travel alongside in `messagesByConversation` because
        // the module does not retain them.
        this.context.emit('msrpSyncCompleted', {
            conversations: this.snapshotConversationsMap(),
            messagesByConversation
        })
    }

    private handleIncomingConversationCreate (event: any) {
        const conversationKey = this.conversationKeyOf(event)
        if (!conversationKey) return

        // Duplicate create event for an already-known conversation - nothing
        // changed, no event to emit.
        if (this.conversationsMap.has(conversationKey)) return

        const userUri = this.getUserUri()
        this.upsertConversationState(conversationKey, {
            conversationKey,
            creator: event.content?.creator || event.sender || null,
            members: new Set([ userUri ]),
            memberRoles: new Map([ [ userUri, 'in_charge' ] ]),
            currentUserRole: 'in_charge',
            state_events: { [MSRP_STATE_CREATE]: { '': event } },
            created_at: event.origin_server_ts || Date.now(),
            updated_at: event.origin_server_ts || Date.now(),
            currentUserStatus: 'join'
        })
        this.context.emit('msrpConversationCreated', {
            conversationKey,
            conversation: this.snapshotConversation(this.conversationsMap.get(conversationKey)!)
        })
    }

    private handleIncomingConversationMessage (event: any) {
        const conversationKey = this.conversationKeyOf(event)
        if (!conversationKey || !messageHasContent(event.content)) return

        const conversation = this.conversationsMap.get(conversationKey)
        if (!conversation) return

        // Update protocol-level metadata (updated_at) but do NOT retain the
        // message itself - chat history is owned by the consumer.
        // Deduplication is also a consumer concern because only the consumer
        // knows what it has already rendered.
        conversation.updated_at = event.origin_server_ts || Date.now()

        this.context.emit('msrpMessageAdded', { conversationKey, message: event })
    }

    private handleIncomingConversationClosed (event: any) {
        const conversationKey = this.conversationKeyOf(event)
        if (!conversationKey) return

        const conversation = this.conversationsMap.get(conversationKey)
        if (!conversation) return

        if (!conversation.state_events) conversation.state_events = {}
        conversation.state_events[MSRP_STATE_CLOSED] = conversation.state_events[MSRP_STATE_CLOSED] || {}
        conversation.state_events[MSRP_STATE_CLOSED][''] = event
        conversation.status = 'closed'
        conversation.updated_at = event.origin_server_ts || Date.now()

        this.context.emit('msrpConversationUpdated', {
            conversationKey,
            patch: {
                status: conversation.status,
                state_events: { ...conversation.state_events },
                updated_at: conversation.updated_at
            }
        })
    }

    private handleIncomingReceipt (event: any) {
        const conversationKey = this.conversationKeyOf(event)
        const targetEventId = event.event_id
        if (!conversationKey || !targetEventId) return

        const statusMap: Record<string, MSRPMessageStatus> = {
            [MSRP_EVT.SENDING]: 'pending',
            [MSRP_EVT.SENT]: 'sent',
            [MSRP_EVT.DELIVERED]: 'delivered',
            [MSRP_EVT.READ]: 'read',
            [MSRP_EVT.FAILED]: 'failed'
        }
        const status = statusMap[event.type]
        if (!status) return

        const updatedAt = event.origin_server_ts || Date.now()
        const conversation = this.conversationsMap.get(conversationKey)
        if (conversation) conversation.updated_at = updatedAt

        // We do not look up the target message - the consumer holds the
        // message history and is responsible for applying the new status.
        this.context.emit('msrpReceiptChanged', {
            conversationKey,
            eventId: targetEventId,
            status,
            updatedAt
        })
    }

    private handleIncomingTyping (event: any) {
        const conversationKey = this.conversationKeyOf(event)
        if (!conversationKey) return
        if (event.sender === this.getUserUri()) return

        this.context.emit('msrpTyping', {
            conversationKey,
            sender: event.sender,
            isTyping: !!event.content?.typing
        })
    }

    private handleIncomingReaction (event: any) {
        const conversationKey = this.conversationKeyOf(event)
        const relatesTo = event.content?.relates_to
        const emoji = relatesTo?.key || relatesTo?.emoji
        if (!conversationKey || !relatesTo?.event_id || !emoji) return

        const action: 'add' | 'remove' = event.content?.action === 'remove' ? 'remove' : 'add'
        const updatedAt = event.origin_server_ts || Date.now()

        const conversation = this.conversationsMap.get(conversationKey)
        if (conversation) conversation.updated_at = updatedAt

        // Emit the raw reaction event. The consumer holds the message
        // history and is the only place that can (and should) aggregate
        // these into a reactions_summary array on the target message.
        this.context.emit('msrpReactionChanged', {
            conversationKey,
            eventId: relatesTo.event_id,
            emoji,
            action,
            sender: event.sender,
            updatedAt
        })
    }

    private handleIncomingConversationMember (event: any) {
        const conversationKey = this.conversationKeyOf(event)
        if (!conversationKey) return
        const { state_key, content } = event
        const membership = content?.membership as MSRPMembership | undefined
        const role = (content?.role || 'assigned') as MSRPMemberRole

        const conversationExisted = this.conversationsMap.has(conversationKey)
        let conversation = this.conversationsMap.get(conversationKey)
        if (!conversation) {
            conversation = {
                conversationKey,
                creator: null,
                members: new Set<string>(),
                memberRoles: new Map<string, MSRPMemberRole>(),
                currentUserRole: 'assigned',
                state_events: {},
                created_at: event.origin_server_ts || Date.now(),
                updated_at: event.origin_server_ts || Date.now(),
                currentUserStatus: null
            }
            this.conversationsMap.set(conversationKey, conversation)
        }

        const userUri = this.getUserUri()
        const stateKeyUsername = this.extractSipUser(state_key)
        const currentUsername = this.extractSipUser(userUri)
        const isCurrentUser =
            state_key === userUri ||
            (!!stateKeyUsername && !!currentUsername && stateKeyUsername === currentUsername)

        let removedSelf = false

        if (membership === 'join') {
            conversation.members.add(state_key)
            conversation.memberRoles.set(state_key, role)
            if (isCurrentUser) {
                conversation.currentUserStatus = 'join'
                conversation.currentUserRole = role
            }
        } else if (membership === 'leave' || membership === 'ban') {
            conversation.members.delete(state_key)
            conversation.memberRoles.delete(state_key)
            if (isCurrentUser) {
                conversation.currentUserStatus = 'leave'
                this.conversationsMap.delete(conversationKey)
                removedSelf = true
            }
        } else if (membership === 'invite') {
            if (!isCurrentUser) return
            conversation.currentUserStatus = 'invite'
            conversation.memberRoles.set(state_key, role)
        }

        conversation.updated_at = event.origin_server_ts || Date.now()

        if (removedSelf) {
            this.context.emit('msrpConversationRemoved', { conversationKey })
            return
        }

        // The conversation did not exist before this event - emit a single
        // `created` so consumers can add it in one shot rather than
        // `created` + `updated` back-to-back.
        if (!conversationExisted) {
            this.context.emit('msrpConversationCreated', {
                conversationKey,
                conversation: this.snapshotConversation(conversation)
            })
            return
        }

        // Clone members/memberRoles so the consumer owns its own copies -
        // otherwise the next in-place mutation on conversation.members
        // would bypass the consumer's reactivity layer.
        this.context.emit('msrpConversationUpdated', {
            conversationKey,
            patch: {
                members: new Set(conversation.members),
                memberRoles: new Map(conversation.memberRoles),
                currentUserRole: conversation.currentUserRole,
                currentUserStatus: conversation.currentUserStatus,
                updated_at: conversation.updated_at
            }
        })
    }

    private handleIncomingUploadResponse (event: any) {
        const content = event.content || {}
        const requestId = content.request_id
        const pending = this.pendingUploads.get(requestId)
        if (!pending) return
        this.pendingUploads.delete(requestId)

        if (content.error) {
            pending.reject(new Error(content.error))
        } else {
            pending.resolve({
                upload_url: content.upload_url,
                expires_in: content.expires_in,
                mime_type: content.mime_type,
                request_id: content.request_id,
                filename: content.filename,
                preview_url: content.preview_url,
                icon_url: content.icon_url,
                transcription: content.transcription,
                media_type: content.media_type
            })
        }
    }

    private handleIncomingFileAccessResponse (event: any) {
        const content = event.content || {}
        const requestId = content.request_id
        const pending = this.pendingFileAccessRequests.get(requestId)
        if (!pending) return
        this.pendingFileAccessRequests.delete(requestId)

        if (content.error) {
            pending.reject(content.error)
        } else if (content.download_url) {
            pending.resolve(content.download_url)
        } else {
            pending.reject(new Error('No download URL in response'))
        }
    }

    // CONVERSATION STATE HELPERS

    private upsertConversationState (key: string, data: MSRPConversationState) {
        this.conversationsMap.set(key, { ...data, conversationKey: key })
    }

    private snapshotConversation (c: MSRPConversationState): MSRPConversationState {
        return {
            ...c,
            members: new Set(c.members),
            memberRoles: new Map(c.memberRoles),
            state_events: { ...c.state_events }
        }
    }

    private snapshotConversationsMap (): { [key: string]: MSRPConversationState } {
        const out: { [key: string]: MSRPConversationState } = {}
        this.conversationsMap.forEach((conv, key) => {
            out[key] = this.snapshotConversation(conv)
        })
        return out
    }

    public isConversationClosed (conversation: MSRPConversationState | undefined | null): boolean {
        return !!conversation?.state_events?.[MSRP_STATE_CLOSED]?.['']
    }

    private conversationKeyOf (source: any): string | null {
        if (!source) return null
        if (typeof source === 'string') return source
        return source.conversationKey ?? null
    }

    public extractSipUser (sipUri: string | null | undefined): string | null {
        if (!sipUri) return null
        const uriString = typeof sipUri === 'string' ? sipUri : String(sipUri)
        const match = uriString.match(/^sip:([^@]+)@/)
        return match ? match[1] : null
    }

    public extractDisplayName (uri: string | null | undefined): string {
        if (!uri) return 'Unknown'
        const uriString = typeof uri === 'string' ? uri : String(uri)

        if (uriString.startsWith('sip:')) {
            const match = uriString.match(/^sip:([^@]+)@/)
            return match ? match[1] : uriString
        }

        if (uriString.startsWith('whatsapp:')) return uriString.slice('whatsapp:'.length)
        if (uriString.startsWith('wa:')) return uriString.slice('wa:'.length)
        if (uriString.startsWith('greenapi:')) return uriString.slice('greenapi:'.length)
        if (uriString.startsWith('sms:')) return uriString.slice('sms:'.length)

        return uriString
    }
}
