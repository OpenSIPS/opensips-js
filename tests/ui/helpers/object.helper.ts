import type { ObjectAnyType } from '~/types'

export function cloneObject<T> (obj: T): T {
    if (obj === null || typeof obj !== 'object') {
        return obj
    }
    return JSON.parse(JSON.stringify(obj))
}

export function copyObjectBasedOnKeyObject<T extends object> (sourceObject: ObjectAnyType, defaultKeyObject: T): T {
    return Object.getOwnPropertyNames(defaultKeyObject).reduce<T>((result, key) => {
        if (Object.hasOwn(sourceObject, key)) {
            (result as ObjectAnyType)[key] = sourceObject[key]
        }
        return result
    }, {} as T)
}
