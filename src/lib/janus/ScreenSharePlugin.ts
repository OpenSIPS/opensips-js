import { BaseNewStreamPlugin } from '@/lib/janus/BaseNewStreamPlugin'

export class ScreenSharePlugin extends BaseNewStreamPlugin {
    constructor () {
        super('ScreenShare', 'screen')
    }

    public async generateStream () {
        try {
            this.stream = await navigator.mediaDevices.getDisplayMedia()
            this.stream.getVideoTracks()[0].onended = () => {
                this.kill()
            }

            this.session._ua.emit('startScreenShare', {
                stream: this.stream,
                handleId: this.handleId,
                sender: 'me',
                type: 'publisher'
            })
        } catch (error) {
            this.kill()

            console.error(error)
        }

        return this.stream
    }

    async kill () {
        await this.stop()

        this.session._ua.emit('stopScreenShare')
    }
}
