<template>
    <VcSelect
        v-model="localModel"
        :options="selectOptions"
        :config="{
            labelKey: 'label',
            valueKey: 'key'
        }"
        :disabled="disabled"
        class="flex-grow"
        size="small"
        @change="onEventTypeChange"
    />
</template>

<script setup lang="ts">
import type { TScenarioActionName, TScenarioActionsMapValue } from '~/types/scenaries'
import { CustomAction, ScenarioActionsMap } from '~/enum/jsonSetup.enum'
import { useCustomSharedEventsInject } from '~/composable/customSharedEvents'

const { customOptions } = useCustomSharedEventsInject()

const props = defineProps<{
    modelValue?: TScenarioActionName
    disabled?: boolean
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value?: TScenarioActionName): void
    (e: 'change', value?: TScenarioActionsMapValue): void
}>()

const localModel = useVModel(props, 'modelValue', emit)

const selectOptions = computed(() => {
    const baseEvents = Object.values(ScenarioActionsMap).sort((a, b) => a.label.localeCompare(b.label))
    const customEvents = customOptions.value.map((event) => {
        return {
            ...CustomAction,
            label: event,
            key: event
        }
    })

    return [ ...baseEvents, ...customEvents ] as Array<TScenarioActionsMapValue>
})

function onEventTypeChange (option?: TScenarioActionsMapValue) {
    emit('change', option)
}
</script>

