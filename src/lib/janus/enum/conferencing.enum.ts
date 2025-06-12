export const CONFERENCING_MODE = {
    WHITEBOARD: 'whiteboard',
    IMAGE_WHITEBOARD: 'imageWhiteboard'
}

export const RECORDING_PATH = '/opt/recordings/'

//export type ConferencingModeType = keyof typeof CONFERENCING_MODE

//type ConferencingModeKeys = keyof typeof CONFERENCING_MODE; // 'WHITEBOARD' | 'IMAGE_WHITEBOARD'
export type ConferencingModeType = typeof CONFERENCING_MODE[keyof typeof CONFERENCING_MODE]; // 'whiteboard' | 'imageWhiteboard'
