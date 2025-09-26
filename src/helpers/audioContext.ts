class ManagedAudioContext {
    private readonly context: AudioContext
    private resumePromise: Promise<void> | null = null

    constructor () {
        this.context = new AudioContext()
    }

    async getContext (): Promise<AudioContext> {
        // Always ensure context is running before returning it
        if (this.context.state === 'suspended') {

            if (!this.resumePromise) {
                this.resumePromise = this.context.resume().then(() => {
                    this.resumePromise = null
                }).catch((error) => {
                    this.resumePromise = null
                    throw error
                })
            }

            await this.resumePromise
        }

        return this.context
    }
}

export default ManagedAudioContext
