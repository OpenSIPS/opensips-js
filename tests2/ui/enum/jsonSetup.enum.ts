import type { TestScenarioEventActionType, TScenarioActionsMap } from '~/types/scenaries'
import RegisterForm from '~/components/data/payload/RegisterForm.vue'
import DialForm from '~/components/data/payload/DialForm.vue'
import WaitTimeForm from '~/components/data/payload/WaitTimeForm.vue'
import PlaySoundDataForm from '~/components/data/payload/PlaySoundDataForm.vue'
import SendDtmfDataForm from '~/components/data/payload/SendDtmfDataForm.vue'
import TransferDataForm from '~/components/data/payload/TransferDataForm.vue'
import RequestDataForm from '~/components/data/payload/RequestDataForm.vue'

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
    READY: 'ready',
    INCOMING: 'incoming',
    WAIT: 'wait',
    REQUEST: 'request',
    DND: 'DND'
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
export const DND_ACTION = {
    label: 'DND',
    value: EVENT_ACTIONS.DND
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
                ...HANGUP_ACTION
            },
            {
                ...REQUEST_ACTION
            }
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
            { ...ANSWER_ACTION }, { ...WAIT_ACTION }, { ...REQUEST_ACTION }
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
        { ...UNREGISTER_ACTION },
        { ...DND_ACTION }
    ]
}

export const PAYLOAD_COMPONENTS = {
    [EVENT_ACTIONS.REGISTER]: RegisterForm,
    [EVENT_ACTIONS.DIAL]: DialForm,
    [EVENT_ACTIONS.WAIT]: WaitTimeForm,
    [EVENT_ACTIONS.PLAY_SOUND]: PlaySoundDataForm,
    [EVENT_ACTIONS.SEND_DTMF]: SendDtmfDataForm,
    [EVENT_ACTIONS.TRANSFER]: TransferDataForm,
    [EVENT_ACTIONS.REQUEST]: RequestDataForm
}

export function isPayloadRequired (action: string) {
    return !!PAYLOAD_COMPONENTS[action]
}
