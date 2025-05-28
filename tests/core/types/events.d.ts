import {
    GetActionDefinition,
    ActionType,
    ActionByActionType,
    ActionsResponseMap
} from './actions'

type AllowedActions <T extends ActionType> = T

// Define available events and the actions allowed for each event
export interface EventsMap {
    register: AllowedActions<'dial' | 'wait' | 'request'>
    dial: AllowedActions<'request'>
    answer: AllowedActions<'hold' | 'unhold' | 'wait' | 'play_sound' | 'hangup' | 'request'>
    hold: AllowedActions<'unhold' | 'wait' | 'request'>
    unhold: AllowedActions<'hold' | 'wait' | 'request'>
    hangup: AllowedActions<'unregister' | 'request'>
    playSound: AllowedActions<'wait' | 'request'>
    sendDTMF: AllowedActions<'wait' | 'request'>
    transfer: AllowedActions<'wait' | 'request'>
    unregister: AllowedActions<'wait' | 'request'>
    ready: AllowedActions<'register' | 'wait' | 'request' | 'dial'>
    incoming: AllowedActions<'answer' | 'wait' | 'request'>
    [customEvent: string]: AllowedActions<ActionType>
}
export type EventType = keyof EventsMap
export type EventHandler<E extends EventType> = {
    event: E
    actions: readonly ActionsPerEvent<E>[]
}
export type EventListenerData <E extends EventType> = E extends keyof ActionsResponseMap ? ActionsResponseMap[E] : any
export type EventListener<E extends EventType = string> =
    (event: E, data: EventListenerData<E>) => void

export type ActionsPerEvent <T extends EventType> = GetActionDefinition<ActionByActionType<EventsMap[T]>>
