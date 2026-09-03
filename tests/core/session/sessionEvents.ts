/**
 * Events handled per CallSession (SIP frames + action-completion events).
 * Cross-scenario coordination (customSharedEvent / waitUntil) uses
 * SharedEventCoordinator on the ScenarioManager test run — not session-local.
 */
const SESSION_LOCAL_EVENT_PREFIXES = [
    'ready',
    'register',
    'dial',
    'answer',
    'incoming',
    'hangup',
    'hold',
    'unhold',
    'playSound',
    'sendDTMF',
    'transfer',
    'changeRoom',
    'DND',
    'unregister',
    'textToSpeech',
    'startTranscription',
    'stopTranscription',
    'callConfirmed',
    'callCancelled',
    'callEnded',
    'callUpdated',
    'messageReceived',
    'optionsReceived',
    'callReferred',
    'infoReceived',
    'notificationReceived',
] as const

export function isSessionLocalEvent (eventName: string): boolean {
    return SESSION_LOCAL_EVENT_PREFIXES.some((prefix) => eventName.startsWith(prefix))
}
