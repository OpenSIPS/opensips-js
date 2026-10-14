import { EndEvent } from 'jssip/lib/RTCSession'

import { MSRPSession, UAExtendedInterface } from '@/lib/msrp/session'
import { MSRPSignalingInviteRequest, MSRPSignalingInviteResult } from '@/types/msrp'

type DialogTerminatedHandler = (callId: string, cause: string) => void

/**
 * Performs the SIP part (INVITE/ACK/BYE) of an MSRP session whose MSRP socket
 * lives in another OpenSIPSJS instance (see the `msrpSignaling` option).
 *
 * Holds at most one external dialog: a new INVITE replaces the previous one,
 * the same way an MSRP reconnect replaces its dialog. The dialog is kept apart
 * from the UA MSRP sessions, so a SIP reconnect (`UA.stop()`) does not end it.
 */
export class MSRPSignalingHost {
    private ua: UAExtendedInterface
    private onDialogTerminated: DialogTerminatedHandler
    private session: MSRPSession | null = null
    private sessionCallId: string | null = null

    constructor (ua: UAExtendedInterface, onDialogTerminated: DialogTerminatedHandler) {
        this.ua = ua
        this.onDialogTerminated = onDialogTerminated
    }

    public async invite (request: MSRPSignalingInviteRequest): Promise<MSRPSignalingInviteResult> {
        this.dropSession()

        const session = new MSRPSession(this.ua)

        this.session = session
        this.sessionCallId = request.callId

        session.on('ended', (event: EndEvent) => {
            if (this.session !== session) {
                return
            }

            this.clearSession()

            if (event?.originator === 'remote') {
                this.onDialogTerminated(request.callId, event.cause)
            }
        })

        try {
            return await session.inviteForExternalSession(request)
        } catch (error) {
            if (this.session === session) {
                this.clearSession()
            }

            throw error
        }
    }

    public async bye (callId: string): Promise<void> {
        if (!this.session || this.sessionCallId !== callId) {
            return
        }

        const session = this.session

        this.clearSession()
        session.terminateExternalSession()
    }

    private dropSession () {
        if (!this.session) {
            return
        }

        const session = this.session

        this.clearSession()
        session.dropExternalSession()
    }

    private clearSession () {
        this.session = null
        this.sessionCallId = null
    }
}
