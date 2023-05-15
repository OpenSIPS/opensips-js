import { ProbeMetricInType } from '@/types/webrtcmetrics'

export function filterObjectKeys (fullObj: ProbeMetricInType, keys: Array<keyof ProbeMetricInType>) {
    return Object.keys(fullObj)
        .filter((key) => keys.includes(key as keyof ProbeMetricInType))
        .reduce((obj, key) => {
            const k = key as keyof ProbeMetricInType
            //const o = obj as ProbeMetricInType
            //o[k] = fullObj[k] //as ProbeMetricInType[keyof ProbeMetricInType]
            return {
                ...obj,
                [k]: fullObj[k]
            }
        }, {} as ProbeMetricInType)
}