import type { TJsonSetupForm } from '~/types/scenaries'
import type { ObjectAnyType } from '~/types'

const provideInjectKey = Symbol('customSharedEventsProvide')

export const useCustomSharedEventsProvide = (dataToProvide: Ref<TJsonSetupForm>) => {

    const customSharedEvents = computed(() => {
        const findCustomSharedEvents = (data: ObjectAnyType): string[] => {
            let events: string[] = []

            if (Array.isArray(data)) {
                data.forEach(item => {
                    events = events.concat(findCustomSharedEvents(item))
                })
            } else if (data && typeof data === 'object') {
                if ('customSharedEvent' in data) {
                    events.push(data.customSharedEvent)
                }

                Object.values(data).forEach(value => {
                    events = events.concat(findCustomSharedEvents(value))
                })
            }

            return events
        }

        return findCustomSharedEvents(dataToProvide.value.scenarios)

    })

    provide<{ customOptions: ComputedRef<Array<string>> }>(provideInjectKey, { customOptions: customSharedEvents })
}

export const useCustomSharedEventsInject = () => {
    const injectData = inject<{ customOptions: ComputedRef<Array<string>> }>(provideInjectKey)

    if (!injectData) {
        return { customOptions: computed(() => []) }
    }

    return injectData
}
