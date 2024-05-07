import { ICall, MediaEvent } from '@/types/rtc'

export class VideoModule {
    private context: any

    constructor (context) {
        this.context = context

        /*this.context.on(
            this.context.newRTCSessionEventName,
            this.newRTCSessionCallback.bind(this)
        )*/

        //this.initializeMediaDevices()
    }

    public get sipOptions () {
        const options = {
            ...this.context.options.sipOptions
        }

        return options
    }

    public initCall (target: string) {
        // this.checkInitialized()

        if (target.length === 0) {
            return console.error('Target must be a valid string')
        }

        this.context.logger.log(`Calling sip:${target}@${this.context.sipDomain}...`)

        const call = this.context.joinVideoCall(
            `sip:${target}@${this.context.sipDomain}`,
            this.sipOptions
        )

        console.log('video call')
        //this.callAddingInProgress = call.id

        /*if (addToCurrentRoom && this.currentActiveRoomId !== undefined) {
            this.processRoomChange({
                callId: call.id,
                roomId: this.currentActiveRoomId
            })
        }

        call.connection.addEventListener('addstream', (event: Event) => {
            this.triggerAddStream(event as MediaEvent, call as ICall)
        })*/
    }

    /*public invite1 (roomId: string) {
        const inviteData = {
            janus: 'invite',
            plugin: 'janus.plugin.videoroom',
            opaque_id: 'videoroomtest-uzkIUidc1969',
            transaction: '1',
            //session_id: 8477157010600503
        }
        this.context.invite(roomId, JSON.stringify(inviteData), {
            contentType: 'application/json',
        })
    }*/

}
