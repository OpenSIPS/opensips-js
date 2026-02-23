class ManagedAudioContext {
    private context: AudioContext
    private resumePromise: Promise<void> | null = null

    constructor () {
        this.context = new AudioContext()
        this.setupErrorHandling()
    }

    private setupErrorHandling () {
        if (!this.context || typeof this.context.addEventListener !== 'function') {
            return
        }
        this.context.addEventListener('statechange', () => {
            if (this.context.state === 'interrupted' || this.context.state === 'closed') {
                console.warn(`[ManagedAudioContext] AudioContext state changed to: ${this.context.state}`)
            }
        })
    }

    private createNewContext (): AudioContext {
        console.log('[ManagedAudioContext] Creating new AudioContext instance')
        this.context = new AudioContext()
        this.setupErrorHandling()
        return this.context
    }

    async getContext (): Promise<AudioContext> {
        // If context is closed, create a new one
        if (this.context.state === 'closed') {
            console.warn('[ManagedAudioContext] AudioContext is closed, creating new instance')
            return this.createNewContext()
        }

        // If context is interrupted, try to resume it
        if (this.context.state === 'interrupted') {
            console.warn('[ManagedAudioContext] AudioContext is interrupted, attempting to resume')
            try {
                if (!this.resumePromise) {
                    this.resumePromise = this.context.resume().then(() => {
                        this.resumePromise = null
                    }).catch((error) => {
                        console.error('[ManagedAudioContext] Failed to resume interrupted context:', error)
                        this.resumePromise = null
                        // If resume fails, create a new context
                        this.createNewContext()
                    })
                }
                await this.resumePromise
            } catch (error) {
                console.error('[ManagedAudioContext] Error resuming context, creating new one:', error)
                return this.createNewContext()
            }
        }

        // If context is suspended, resume it
        if (this.context.state === 'suspended') {
            if (!this.resumePromise) {
                this.resumePromise = this.context.resume().then(() => {
                    this.resumePromise = null
                }).catch((error) => {
                    console.error('[ManagedAudioContext] Failed to resume suspended context:', error)
                    this.resumePromise = null
                    throw error
                })
            }

            await this.resumePromise
        }

        // Verify context is in a valid state before returning
        if (this.context.state === 'closed') {
            console.warn('[ManagedAudioContext] Context closed after resume attempt, creating new instance')
            return this.createNewContext()
        }

        return this.context
    }
}

export default ManagedAudioContext
