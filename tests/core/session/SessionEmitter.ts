import { Unsubscribe } from './types'

export type SessionEmitterListener = (data?: unknown) => void

/**
 * Per-session event emitter (RUNNER-TASKS T1.2). Each CallSession owns one, so
 * SIP events from a session's PageWebSocketWorker reach only that session's
 * listeners — parallel sessions can no longer see each other's events.
 */
export default class SessionEmitter {
    private readonly listeners = new Map<string, Set<SessionEmitterListener>>()

    public on (event: string, cb: SessionEmitterListener): Unsubscribe {
        let callbacks = this.listeners.get(event)

        if (!callbacks) {
            callbacks = new Set<SessionEmitterListener>()
            this.listeners.set(event, callbacks)
        }

        callbacks.add(cb)

        return () => this.off(event, cb)
    }

    public once (event: string, cb: SessionEmitterListener): Unsubscribe {
        const off = this.on(event, (data) => {
            off()
            cb(data)
        })

        return off
    }

    public off (event: string, cb: SessionEmitterListener): void {
        this.listeners.get(event)?.delete(cb)
    }

    public emit (event: string, data?: unknown): void {
        const callbacks = this.listeners.get(event)

        if (!callbacks) {
            return
        }

        for (const cb of [ ...callbacks ]) {
            cb(data)
        }
    }

    public waitFor (event: string, timeout?: number): Promise<unknown> {
        return new Promise((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout> | undefined

            const off = this.once(event, (data) => {
                if (timer) {
                    clearTimeout(timer)
                }
                resolve(data)
            })

            if (timeout) {
                timer = setTimeout(() => {
                    off()
                    reject(new Error(`Timeout waiting for event ${event}`))
                }, timeout)
            }
        })
    }

    public removeAllListeners (): void {
        this.listeners.clear()
    }
}
