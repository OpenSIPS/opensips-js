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

    public initCall (target: string, displayName: string) {
        // this.checkInitialized()

        if (target.length === 0) {
            return console.error('Target must be a valid string')
        }

        this.context.logger.log(`Calling sip:${target}@${this.context.sipDomain}...`)

        this.context.joinVideoCall(
            `sip:${target}@${this.context.sipDomain}`,
            displayName,
            this.sipOptions
        )
    }

    stop (options = {}) {
        this.context.terminateJanusSessions(options)
    }

    startAudio () {
        this.context.enableJanusAudio(true)
    }

    stopAudio () {
        this.context.enableJanusAudio(false)
    }

    startVideo () {
        this.context.enableJanusVideo(true)
    }

    stopVideo () {
        this.context.enableJanusVideo(false)
    }

    changeMediaConstraints (constraints: MediaStreamConstraints) {
        this.context.changeMediaConstraints(constraints)
    }

    startScreenShare () {
        this.context.startScreenShare()
    }

    startBlur () {
        this.context.startBlur()
    }

    stopBlur () {
        this.context.stopBlur()
    }
}
