<template>
    <div class="rounded-md relative border border-gray-300 dark:border-gray-700 p-4 bg-light-bg">
        <VcFormItem
            label="Scenario Name"
            :prop="'scenarios.' + index + '.name'"
            :rules="[required]"
            class="w-full"
        >
            <div class="flex w-full items-center gap-2 lg:gap-4">
                <VcInput
                    v-model="localModel.name"
                    class="flex-grow"
                    size="small"
                />
                <VcButton
                    button-type="button"
                    icon="vc-lc-plus"
                    type="outline"
                    size="small"
                    @click="addNewEvent"
                >
                    Add Action
                </VcButton>
            </div>
        </VcFormItem>
        <div
            v-show="isOpen"
            class="mt-4 space-y-4"
        >
            <JsonScenarioEvent
                v-for="(action, actionIndex) in localModel.actions"
                :key="actionIndex"
                v-model="localModel.actions[actionIndex]"
                @event:remove="removeEvent(actionIndex)"
            />
        </div>
        <div class="absolute top-2 right-2 flex gap-2 items-center">
            <UIcon
                :name="isOpen ? 'i-heroicons-chevron-up-solid' : 'i-heroicons-chevron-down-solid'"
                class="cursor-pointer text-gray-500 hover:text-primary-500"
                size="20"
                @click="isOpen = !isOpen"
            />
            <UIcon
                name="i-heroicons-document-duplicate"
                class="cursor-pointer text-gray-500 hover:text-primary-500"
                size="20"
                @click="onDuplicate"
            />
            <UIcon
                name="i-heroicons-code-bracket-square"
                class="cursor-pointer text-gray-500 hover:text-primary-500"
                size="20"
                @click="openJsonPreview"
            />
            <UIcon
                name="i-heroicons-x-mark"
                class="cursor-pointer text-gray-500 hover:text-red-500"
                size="20"
                @click="$emit('remove', modelValue?.name)"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import type { TestScenario } from '~/types/scenaries'
import JsonScenarioEvent from '~/components/JsonScenarioEvent.vue'
import useJsonPreviewData from '~/composable/useJsonPreviewData'
import useValidationRules from '~/composable/useValidationRules'

const { openPreviewWindow } = useJsonPreviewData()
const { required } = useValidationRules()

const props = defineProps<{
    modelValue: TestScenario
    scenario?: TestScenario
    index?: number
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: TestScenario): void
    (e: 'remove', payload: string): void
    (e: 'duplicate', payload: TestScenario): void
}>()

const localModel = useVModel(props, 'modelValue', emit)
const isOpen = ref(true)

function addNewEvent () {
    localModel.value.actions.push({
        event: '',
        actions: []
    })
    isOpen.value = true
}

function onDuplicate () {
    emit('duplicate', localModel.value)
}

function removeEvent (index: number) {
    localModel.value.actions.splice(index, 1)
}

function openJsonPreview () {
    openPreviewWindow(localModel.value)
}
</script>
