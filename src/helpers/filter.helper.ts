export function filterObjectKeys<T extends object, K extends keyof T> (fullObj: T, keys: ReadonlyArray<K>): Pick<T, K> {
    return (Object.keys(fullObj) as Array<keyof T>)
        .filter((key): key is K => keys.includes(key as K))
        .reduce((obj, key) => ({
            ...obj,
            [key]: fullObj[key]
        }), {} as Pick<T, K>)
}
