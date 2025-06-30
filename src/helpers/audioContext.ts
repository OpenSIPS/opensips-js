class ManagedAudioContext {
    private readonly context: AudioContext
    private resumePromise: Promise<void> | null = null
    private stateChangeCount = 0
    private lastStateChange = Date.now()
    private resumeAttempts = 0

    constructor () {
        this.context = new AudioContext()
        
        console.log('[ManagedAudioContext] AudioContext created with initial state:', this.context.state)

        // Handle audio context state changes with detailed logging
        this.context.addEventListener('statechange', () => {
            this.stateChangeCount++
            const now = Date.now()
            const timeSinceLastChange = now - this.lastStateChange
            this.lastStateChange = now
            
            console.log(`[ManagedAudioContext] AudioContext state changed:`, {
                newState: this.context.state,
                changeNumber: this.stateChangeCount,
                timeSinceLastChange: `${timeSinceLastChange}ms`,
                timestamp: new Date().toISOString(),
                currentTime: this.context.currentTime,
                sampleRate: this.context.sampleRate
            })
            
            // Log additional context info based on state
            if (this.context.state === 'suspended') {
                console.warn('[ManagedAudioContext] ⚠️ AudioContext SUSPENDED - audio operations may fail')
                this.logPossibleSuspensionReasons()
            } else if (this.context.state === 'running') {
                console.log('[ManagedAudioContext] ✅ AudioContext RUNNING - audio operations should work')
            } else if (this.context.state === 'closed') {
                console.error('[ManagedAudioContext] ❌ AudioContext CLOSED - this is unexpected!')
            }
        })
        
        // Monitor document visibility changes that might affect AudioContext
        document.addEventListener('visibilitychange', () => {
            console.log(`[ManagedAudioContext] Document visibility changed: ${document.hidden ? 'hidden' : 'visible'}, AudioContext state: ${this.context.state}`)
        })
    }
    
    private logPossibleSuspensionReasons() {
        console.log('[ManagedAudioContext] Possible reasons for AudioContext suspension:')
        console.log('  - Browser autoplay policy (user hasn\'t interacted with page)')
        console.log('  - Tab became inactive or hidden')
        console.log('  - System audio focus changed to another application')
        console.log('  - Memory pressure or browser resource management')
        console.log('  - Another AudioContext was created and gained priority')
        console.log(`  - Document hidden: ${document.hidden}`)
        console.log(`  - Page visibility: ${document.visibilityState}`)
    }

    async getContext (): Promise<AudioContext> {
        console.log(`[ManagedAudioContext] getContext() called, current state: ${this.context.state}`)
        
        // Always ensure context is running before returning it
        if (this.context.state === 'suspended') {
            this.resumeAttempts++
            console.log(`[ManagedAudioContext] AudioContext is suspended, attempting resume #${this.resumeAttempts}`)
            
            if (!this.resumePromise) {
                console.log('[ManagedAudioContext] Creating new resume promise')
                const resumeStart = Date.now()
                
                this.resumePromise = this.context.resume().then(() => {
                    const resumeTime = Date.now() - resumeStart
                    console.log(`[ManagedAudioContext] ✅ AudioContext resumed successfully in ${resumeTime}ms, final state: ${this.context.state}`)
                    this.resumePromise = null
                }).catch((error) => {
                    const resumeTime = Date.now() - resumeStart
                    console.error(`[ManagedAudioContext] ❌ AudioContext resume FAILED after ${resumeTime}ms:`, error)
                    this.resumePromise = null
                    throw error
                })
            } else {
                console.log('[ManagedAudioContext] Resume already in progress, waiting for existing promise')
            }
            
            await this.resumePromise
            console.log(`[ManagedAudioContext] Resume promise resolved, final state: ${this.context.state}`)
        } else if (this.context.state === 'running') {
            console.log('[ManagedAudioContext] AudioContext already running, returning immediately')
        } else {
            console.warn(`[ManagedAudioContext] AudioContext in unexpected state: ${this.context.state}`)
        }
        
        return this.context
    }

    get rawContext (): AudioContext {
        return this.context
    }
    
    getDebugInfo() {
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
