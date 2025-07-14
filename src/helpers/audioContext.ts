class ManagedAudioContext {
    private readonly context: AudioContext
    private resumePromise: Promise<void> | null = null
    private stateChangeCount = 0
    private lastStateChange = Date.now()
    private resumeAttempts = 0

    constructor () {
        this.context = new AudioContext()

        this.context.addEventListener('statechange', () => {
            this.stateChangeCount++
            const now = Date.now()
            this.lastStateChange = now
        })
    }

    async getContext (): Promise<AudioContext> {
        // Always ensure context is running before returning it
        if (this.context.state === 'suspended') {
            this.resumeAttempts++

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

    get rawContext (): AudioContext {
        return this.context
    }

    getDebugInfo () {
        return {
            state: this.context.state,
            sampleRate: this.context.sampleRate,
            currentTime: this.context.currentTime,
            stateChangeCount: this.stateChangeCount,
            resumeAttempts: this.resumeAttempts,
            lastStateChange: new Date(this.lastStateChange).toISOString(),
            hasResumePromise: !!this.resumePromise,
            documentHidden: document.hidden,
            documentVisibility: document.visibilityState
        }
    }
}

export default ManagedAudioContext
