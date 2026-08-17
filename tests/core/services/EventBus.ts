import { EventListener, EventListenerData, EventType } from '../types/events'
import QrynClient from "./QrynClient";

export default class EventBus {
    private static instance: EventBus
    private eventListeners: Map<EventType, EventListener<any>[]> = new Map()
    private qrynClient = new QrynClient('EventBus')

    public static getInstance (): EventBus {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus()
        }
        return EventBus.instance
    }

    public addEventListener <E extends EventType> (eventName: E, listener: EventListener<E>): void {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, [])
        }

        this.eventListeners.get(eventName).push(listener as unknown as EventListener<any>)
    }

    public removeEventListener <E extends EventType> (eventName: E, listener: EventListener<E>): void {
        const listeners = this.eventListeners.get(eventName)

        if (!listeners) return

        const index = listeners.indexOf(listener as unknown as EventListener<any>)

        if (index !== -1) {
            listeners.splice(index, 1)
        }
    }

    public async triggerEvent <E extends EventType> (
        eventName: E,
        data?: EventListenerData<E>
    ): Promise<void> {
        const listeners = [ ...(this.eventListeners.get(eventName) || []) ]
        await this.qrynClient.log(`Event triggered: ${eventName}`, {
            eventName,
            listenersCount: listeners.length
        })

        for (const listener of listeners) {
            listener(eventName, data)
        }
    }

    public waitForEvent <E extends EventType> (
        eventName: E,
        additionalCheck: (eventName: E, data: EventListenerData<E>) => boolean,
        timeout?: number
    ): Promise<EventListenerData<E>> {
        return new Promise((resolve, reject) => {
            const listener: EventListener<any> = (name, data) => {
                if (name === eventName && additionalCheck(name, data)) {
                    this.removeEventListener<any>(eventName, listener)
                    resolve(data)
                }
            }

            this.addEventListener<any>(eventName, listener)

            if (timeout) {
                setTimeout(() => {
                    this.removeEventListener<any>(eventName, listener)
                    reject(new Error(`Timeout waiting for event ${eventName}`))
                }, timeout)
            }
        })
    }
}
