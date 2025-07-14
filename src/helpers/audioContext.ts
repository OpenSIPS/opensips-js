class ManagedAudioContext {
    private readonly context: AudioContext
    private resumePromise: Promise<void> | null = null
    private stateChangeCount = 0
    private lastStateChange = Date.now()
    private resumeAttempts = 0

    constructor () {
        this.context = new AudioContext()

        // Handle audio context state changes with detailed logging
        this.context.addEventListener('statechange', () => {
            this.stateChangeCount++
            const now = Date.now()
            //const timeSinceLastChange = now - this.lastStateChange
            this.lastStateChange = now

            // Log additional context info based on state
            if (this.context.state === 'suspended') {
                //console.warn('[ManagedAudioContext] ⚠️ AudioContext SUSPENDED - audio operations may fail')
                this.logPossibleSuspensionReasons()
            }
        })
    }

    private logPossibleSuspensionReasons () {
        /*console.log('[ManagedAudioContext] Possible reasons for AudioContext suspension:')
        console.log('  - Browser autoplay policy (user hasn\'t interacted with page)')
        console.log('  - Tab became inactive or hidden')
        console.log('  - System audio focus changed to another application')
        console.log('  - Memory pressure or browser resource management')
        console.log('  - Another AudioContext was created and gained priority')
        console.log(`  - Document hidden: ${document.hidden}`)
        console.log(`  - Page visibility: ${document.visibilityState}`)*/
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
