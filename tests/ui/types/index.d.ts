/* eslint-disable @typescript-eslint/no-explicit-any */
export type ObjectAnyType = { [key: string]: any | undefined }

export type TEditableTabItem = {
    key: string
    label: string
    icon?: string
    content?: string,
    entityData?: ObjectAnyType
}
