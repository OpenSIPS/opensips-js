import {
    GetActionDefinition,
    ActionType,
    ActionByActionType,
    ActionsResponseMap
} from './actions'

type AllowedActions <T extends ActionType> = T

// Define available events and the actions allowed for each event
export interface EventsMap {
    register: AllowedActions<'dial' | 'wait' | 'request' | 'DND'>
    dial: AllowedActions<'request'>
    answer: AllowedActions<'hold' | 'unhold' | 'wait' | 'playSound' | 'textToSpeech' | 'startTranscription' | 'hangup' | 'request'>
    hold: AllowedActions<'unhold' | 'wait' | 'request'>
    unhold: AllowedActions<'hold' | 'wait' | 'request'>
    hangup: AllowedActions<'unregister' | 'request'>
    playSound: AllowedActions<'wait' | 'request'>
    sendDTMF: AllowedActions<'wait' | 'request'>
    transfer: AllowedActions<'wait' | 'request'>
    roomTransfer: AllowedActions<'wait'>
    DND: AllowedActions<'wait' | 'request' | 'dial' | 'unregister' >
    unregister: AllowedActions<'wait' | 'request'>
    ready: AllowedActions<'register' | 'wait' | 'request' | 'dial'>
    incoming: AllowedActions<'answer' | 'wait' | 'request'>
    textToSpeech: AllowedActions<'wait' | 'request' | 'hangup' | 'textToSpeech' | 'startTranscription' | 'stopTranscription'>
    startTranscription: AllowedActions<'wait' | 'request' | 'textToSpeech' | 'stopTranscription'>
    stopTranscription: AllowedActions<'wait' | 'request' | 'textToSpeech' | 'hangup' | 'unregister'>
    // Repeatable event: the handler runs for every transcript chunk received.
    textChunk: AllowedActions<'textToSpeech' | 'sendDTMF' | 'wait' | 'request' | 'hangup' | 'stopTranscription'>
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
