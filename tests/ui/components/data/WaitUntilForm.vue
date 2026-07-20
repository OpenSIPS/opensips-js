<template>
    <div class="w-full">
        <div class="mb-3 flex items-center justify-between">
            <div class="underline text-sm font-medium">
                Wait Until
            </div>
            <UIcon
                name="i-heroicons-x-mark"
                class="cursor-pointer text-gray-500 hover:text-red-500"
                size="16"
                @click="onRemove"
            />
        </div>
        <VcFormItem>
            <JsonEventsSelect
                v-model="localModel.event"
            />
        </VcFormItem>
        <VcFormItem>
            <div class="flex items-center gap-3">
                <VcInputNumber
                    v-model="localModel.timeout"
                    placeholder="Timeout"
                    size="small"
                    :min-value="0"
                    :step="1"
                />
                <VcButtonIcon
                    v-if="localModel.timeout !== undefined"
                    icon="vc-lc-circle-x"
                    size="small"
                    title="Reset Timeout"
                    @click="localModel.timeout = undefined"
                />
            </div>
        </VcFormItem>
    </div>
</template>

<script setup lang="ts">
import type { TScenarioActionName } from '~/types/scenaries'
import JsonEventsSelect from '~/components/main/JsonEventsSelect.vue'

type TWaitUntilForm = {
    event: TScenarioActionName
    timeout?: number
}

const props = defineProps<{
    modelValue: TWaitUntilForm
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: TWaitUntilForm): void
    (e: 'remove', value: TWaitUntilForm): void
}>()

const localModel = useVModel(props, 'modelValue', emit)

function onRemove () {
    emit('remove', props.modelValue)
}
</script>
