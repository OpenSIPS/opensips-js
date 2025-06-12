import { BasePlugin } from '@/lib/janus/BasePlugin'

interface BaseProcessStreamPluginOptions {
    immediate?: boolean
}

export class BaseProcessStreamPlugin extends BasePlugin {
    public stream = null
    public running = false
    public immediate = false
    public type = 'video'

    constructor (name, type, options: BaseProcessStreamPluginOptions = {}) {
        super(name)
        this.immediate = options.immediate || false
        this.type = type
    }

    public start (stream) {
        return stream
    }

    public stop () {
        throw new Error('stop method is not implemented')
    }

    public async process (stream) {
        if (this.immediate) {
            const processedStream = await this.start(stream)
            this.running = true
            return processedStream
        }

        return stream
    }

    public async connect () {
        this.running = true
        await this.session.resyncPlugins(this.type)
    }

    public terminate () {
        this.stop()
    }

    public async kill () {
        this.stop()
        this.running = false
        await this.session.resyncPlugins(this.type)
    }
}
