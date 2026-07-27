import type { TestScenarioEventActionType, TScenarioActionsMap } from '~/types/scenaries'
import RegisterForm from '~/components/data/payload/RegisterForm.vue'
import DialForm from '~/components/data/payload/DialForm.vue'
import WaitTimeForm from '~/components/data/payload/WaitTimeForm.vue'
import PlaySoundDataForm from '~/components/data/payload/PlaySoundDataForm.vue'
import SendDtmfDataForm from '~/components/data/payload/SendDtmfDataForm.vue'
import TransferDataForm from '~/components/data/payload/TransferDataForm.vue'
import RequestDataForm from '~/components/data/payload/RequestDataForm.vue'
import RoomTransferForm from '~/components/data/payload/RoomTransferForm.vue'
import TextToSpeechDataForm from '~/components/data/payload/TextToSpeechDataForm.vue'

export const EVENT_ACTIONS: Record<string, TestScenarioEventActionType> = {
    ANSWER: 'answer',
    REGISTER: 'register',
    UNREGISTER: 'unregister',
    DIAL: 'dial',
    HOLD: 'hold',
    UNHOLD: 'unhold',
    PLAY_SOUND: 'playSound',
    HANGUP: 'hangup',
    SEND_DTMF: 'sendDTMF',
    TRANSFER: 'transfer',
    ROOMTRANSFER: 'roomTransfer',
    READY: 'ready',
    INCOMING: 'incoming',
    WAIT: 'wait',
    REQUEST: 'request',
    DND: 'DND',
    TEXT_TO_SPEECH: 'textToSpeech',
    START_TRANSCRIPTION: 'startTranscription',
    STOP_TRANSCRIPTION: 'stopTranscription',
    TEXT_CHUNK: 'textChunk'
} as const

export const DIAL_ACTION = {
    label: 'Dial',
    value: EVENT_ACTIONS.DIAL
}
export const WAIT_ACTION = {
    label: 'Wait',
    value: EVENT_ACTIONS.WAIT
}
export const REQUEST_ACTION = {
    label: 'Request',
    value: EVENT_ACTIONS.REQUEST
}
export const HOLD_ACTION = {
    label: 'Hold',
    value: EVENT_ACTIONS.HOLD
}
export const UNHOLD_ACTION = {
    label: 'Unhold',
    value: EVENT_ACTIONS.UNHOLD
}
export const PLAY_SOUND_ACTION = {
    label: 'Play Sound',
    value: EVENT_ACTIONS.PLAY_SOUND
}
export const HANGUP_ACTION = {
    label: 'Hangup',
    value: EVENT_ACTIONS.HANGUP
}
export const REGISTER_ACTION = {
    label: 'Register',
    value: EVENT_ACTIONS.REGISTER
}
export const UNREGISTER_ACTION = {
    label: 'Unregister',
    value: EVENT_ACTIONS.UNREGISTER
}
export const ANSWER_ACTION = {
    label: 'Answer',
    value: EVENT_ACTIONS.ANSWER
}
export const SEND_DTMF_ACTION = {
    label: 'Send DTMF',
    value: EVENT_ACTIONS.SEND_DTMF
}
export const TRANSFER_ACTION = {
    label: 'Transfer',
    value: EVENT_ACTIONS.TRANSFER
}
export const ROOM_TRANSFER_ACTION = {
    label: 'roomTransfer',
    value: EVENT_ACTIONS.ROOMTRANSFER
}
export const DND_ACTION = {
    label: 'DND',
    value: EVENT_ACTIONS.DND
}
export const TEXT_TO_SPEECH_ACTION = {
    label: 'Text To Speech',
    value: EVENT_ACTIONS.TEXT_TO_SPEECH
}
export const START_TRANSCRIPTION_ACTION = {
    label: 'Start Transcription',
    value: EVENT_ACTIONS.START_TRANSCRIPTION
}
export const STOP_TRANSCRIPTION_ACTION = {
    label: 'Stop Transcription',
    value: EVENT_ACTIONS.STOP_TRANSCRIPTION
}

export const ScenarioActionsMap: TScenarioActionsMap = {
    [EVENT_ACTIONS.REGISTER]: {
        key: EVENT_ACTIONS.REGISTER,
        label: 'Register',
        actions: [
            {
                ...DIAL_ACTION
            },
            {
                ...WAIT_ACTION
            },
            {
                ...REQUEST_ACTION
            }
        ]
    },
    [EVENT_ACTIONS.DIAL]: {
        key: EVENT_ACTIONS.DIAL,
        label: 'Dial',
        actions: [
            {
                ...REQUEST_ACTION
            }
        ]
    },
    [EVENT_ACTIONS.ANSWER]: {
        key: EVENT_ACTIONS.ANSWER,
        label: 'Answer',
        actions: [
            {
                ...HOLD_ACTION
            },
            {
                ...UNHOLD_ACTION
            },
            {
                ...WAIT_ACTION
            },
            {
                ...PLAY_SOUND_ACTION
            },
            {
                ...TEXT_TO_SPEECH_ACTION
            },
            {
                ...START_TRANSCRIPTION_ACTION
            },
            {
                ...HANGUP_ACTION
            },
            {
                ...REQUEST_ACTION
            }
        ]
    },
    [EVENT_ACTIONS.TEXT_TO_SPEECH]: {
        key: EVENT_ACTIONS.TEXT_TO_SPEECH,
        label: 'Text To Speech',
        actions: [
            { ...WAIT_ACTION },
            { ...REQUEST_ACTION },
            { ...TEXT_TO_SPEECH_ACTION },
            { ...START_TRANSCRIPTION_ACTION },
            { ...STOP_TRANSCRIPTION_ACTION },
            { ...HANGUP_ACTION }
        ]
    },
    [EVENT_ACTIONS.START_TRANSCRIPTION]: {
        key: EVENT_ACTIONS.START_TRANSCRIPTION,
        label: 'Start Transcription',
        actions: [
            { ...WAIT_ACTION },
            { ...REQUEST_ACTION },
            { ...TEXT_TO_SPEECH_ACTION },
            { ...STOP_TRANSCRIPTION_ACTION }
        ]
    },
    [EVENT_ACTIONS.STOP_TRANSCRIPTION]: {
        key: EVENT_ACTIONS.STOP_TRANSCRIPTION,
        label: 'Stop Transcription',
        actions: [
            { ...WAIT_ACTION },
            { ...REQUEST_ACTION },
            { ...TEXT_TO_SPEECH_ACTION },
            { ...HANGUP_ACTION },
            { ...UNREGISTER_ACTION }
        ]
    },
    [EVENT_ACTIONS.TEXT_CHUNK]: {
        key: EVENT_ACTIONS.TEXT_CHUNK,
        label: 'Text Chunk (transcript)',
        actions: [
            { ...TEXT_TO_SPEECH_ACTION },
            { ...SEND_DTMF_ACTION },
            { ...WAIT_ACTION },
            { ...REQUEST_ACTION },
            { ...HANGUP_ACTION },
            { ...STOP_TRANSCRIPTION_ACTION }
        ]
    },
    [EVENT_ACTIONS.HOLD]: {
        key: EVENT_ACTIONS.HOLD,
        label: 'Hold',
        actions: [
            { ...UNHOLD_ACTION }, { ...WAIT_ACTION }, { ...REQUEST_ACTION }
        ]
    },
    [EVENT_ACTIONS.UNHOLD]: {
        key: EVENT_ACTIONS.UNHOLD,
        label: 'Unhold',
        actions: [
            { ...HOLD_ACTION }, { ...WAIT_ACTION }, { ...REQUEST_ACTION }
        ]
    },
    [EVENT_ACTIONS.HANGUP]: {
        key: EVENT_ACTIONS.HANGUP,
        label: 'Hangup',
        actions: [
            { ...UNREGISTER_ACTION }, { ...REQUEST_ACTION }
        ]
    },
    [EVENT_ACTIONS.PLAY_SOUND]: {
        key: EVENT_ACTIONS.PLAY_SOUND,
        label: 'Play Sound',
        actions: [
            { ...WAIT_ACTION }, { ...REQUEST_ACTION }
        ]
    },
    [EVENT_ACTIONS.SEND_DTMF]: {
        key: EVENT_ACTIONS.SEND_DTMF,
        label: 'Send DTMF',
        actions: [
            { ...WAIT_ACTION }, { ...REQUEST_ACTION }
        ]
    },
    [EVENT_ACTIONS.TRANSFER]: {
        key: EVENT_ACTIONS.TRANSFER,
        label: 'Transfer',
        actions: [
            { ...WAIT_ACTION }, { ...REQUEST_ACTION }
        ]
    },
    [EVENT_ACTIONS.ROOM_TRANSFER_ACTION]: {
        key: EVENT_ACTIONS.TRANSFER,
        label: 'roomTransfer',
        actions: [
            { ...WAIT_ACTION },
            { ...HOLD_ACTION },
            { ...UNHOLD_ACTION }
        ]
    },
    [EVENT_ACTIONS.UNREGISTER]: {
        key: EVENT_ACTIONS.UNREGISTER,
        label: 'Unregister',
        actions: [
            { ...WAIT_ACTION }, { ...REQUEST_ACTION }
        ]
    },
    [EVENT_ACTIONS.READY]: {
        key: EVENT_ACTIONS.READY,
        label: 'Ready',
        actions: [
            { ...REGISTER_ACTION }, { ...WAIT_ACTION }, { ...REQUEST_ACTION }, { ...DIAL_ACTION }
        ]
    },
    [EVENT_ACTIONS.INCOMING]: {
        key: EVENT_ACTIONS.INCOMING,
        label: 'Incoming',
        actions: [
            {
                ...ANSWER_ACTION
            },
            {
                ...WAIT_ACTION
            },
            {
                ...REQUEST_ACTION
            },
            {
                ...PLAY_SOUND_ACTION
            },
        ]
    },
    [EVENT_ACTIONS.DND]: {
        key: EVENT_ACTIONS.DND,
        label: 'DND',
        actions: [
            { ...REQUEST_ACTION },
            { ...WAIT_ACTION },
            { ...DIAL_ACTION },
            { ...UNREGISTER_ACTION }
        ]
    }
}

export const CustomAction = {
    key: 'customEvent',
    label: 'Custom Event',
    actions: [
        { ...DIAL_ACTION },
        { ...WAIT_ACTION },
        { ...REQUEST_ACTION },
        { ...HOLD_ACTION },
        { ...UNHOLD_ACTION },
        { ...PLAY_SOUND_ACTION },
        { ...HANGUP_ACTION },
        { ...REGISTER_ACTION },
        { ...ANSWER_ACTION },
        { ...SEND_DTMF_ACTION },
        { ...TRANSFER_ACTION },
        { ...ROOM_TRANSFER_ACTION },
        { ...UNREGISTER_ACTION },
        { ...DND_ACTION },
        { ...TEXT_TO_SPEECH_ACTION },
        { ...START_TRANSCRIPTION_ACTION },
        { ...STOP_TRANSCRIPTION_ACTION }
    ]
}

export const PAYLOAD_COMPONENTS = {
    [EVENT_ACTIONS.REGISTER]: RegisterForm,
    [EVENT_ACTIONS.DIAL]: DialForm,
    [EVENT_ACTIONS.WAIT]: WaitTimeForm,
    [EVENT_ACTIONS.PLAY_SOUND]: PlaySoundDataForm,
    [EVENT_ACTIONS.SEND_DTMF]: SendDtmfDataForm,
    [EVENT_ACTIONS.TRANSFER]: TransferDataForm,
    [EVENT_ACTIONS.ROOMTRANSFER]: RoomTransferForm,
    [EVENT_ACTIONS.REQUEST]: RequestDataForm,
    [EVENT_ACTIONS.TEXT_TO_SPEECH]: TextToSpeechDataForm
}

export function isPayloadRequired (action: string) {
    return !!PAYLOAD_COMPONENTS[action]
}
