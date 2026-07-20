<template>
    <div class="json-scenario-action border border-dashed border-gray-300 dark:border-gray-700 p-4 rounded-sm relative">
        <div class="w-full">
            <VcFormItem label="Event Type">
                <div class="flex items-center gap-3 lg:gap-4 w-full">
                    <JsonEventsSelect
                        v-model="localModel.event"
                        :disabled="disabled"
                        @change="onEventTypeChange"
                    />
                    <VcButton
                        :disabled="!localModel.event"
                        type="outline"
                        icon="vc-lc-plus"
                        size="small"
                        @click="onAddEventAction"
                    >
                        Add Event Action
                    </VcButton>
                </div>
            </VcFormItem>
        </div>
        <div
            v-show="isOpen"
        >
            <div
                v-if="localModel.actions?.length"
            >
                <div class="space-y-4">
                    <JsonEventAction
                        v-for="(action, index) in localModel.actions"
                        :key="index"
                        v-model="localModel.actions[index]"
                        :type-options="selectedActionDataActions"
                        @action:remove="onRemoveEventAction(index)"
                        @action:copy="onCopyEventAction"
                    />
                </div>
            </div>
        </div>
        <div class="absolute top-1 right-1 flex items-center gap-2">
            <UIcon
                v-if="localModel.actions?.length"
                :name="isOpen ? 'i-heroicons-chevron-up-solid' : 'i-heroicons-chevron-down-solid'"
                class="cursor-pointer text-gray-500 hover:text-primary-500"
                size="20"
                @click="isOpen = !isOpen"
            />
            <UIcon
                v-if="!disabled"
                name="i-heroicons-x-mark"
                class="cursor-pointer text-gray-500 hover:text-red-500"
                size="20"
                @click="$emit('event:remove')"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { CustomAction, ScenarioActionsMap } from '~/enum/jsonSetup.enum'
import type { ObjectAnyType } from '~/types'
import type { TestScenarioEvent, TestScenarioEventAction } from '~/types/scenaries'
import JsonEventsSelect from '~/components/main/JsonEventsSelect.vue'
import { cloneObject } from '~/helpers/object.helper'

const props = defineProps<{
    modelValue: TestScenarioEvent
    disabled?: boolean
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: ObjectAnyType): void
    (e: 'event:remove'): void
}>()

const localModel = useVModel(props, 'modelValue', emit)
const isOpen = ref(true)

const selectedActionsData = computed(() => {
    const _key = localModel.value.event as keyof typeof ScenarioActionsMap
    return _key in ScenarioActionsMap
        ? ScenarioActionsMap[_key]
        : { ...CustomAction }
})
const selectedActionDataActions = computed(() => {
    return selectedActionsData.value.actions.sort((a, b) => a.label.localeCompare(b.label))
})

function onAddEventAction () {
    localModel.value.actions.push({
        type: undefined,
        data: {}
    })
    isOpen.value = true
}

function onEventTypeChange () {
    localModel.value.actions = []
}

function onRemoveEventAction (index: number) {
    localModel.value.actions.splice(index, 1)
}

function onCopyEventAction (action: TestScenarioEventAction) {
    localModel.value.actions.push(cloneObject(action))
}
</script>

