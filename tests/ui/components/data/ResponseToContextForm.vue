<template>
    <div class="w-full">
        <div class="mb-3 flex items-center justify-between">
            <div class="underline text-sm font-medium">
                Response To Context
            </div>
            <UIcon
                name="i-heroicons-x-mark"
                class="cursor-pointer text-gray-500 hover:text-red-500"
                size="16"
                @click="onRemove"
            />
        </div>
        <VcFormItem>
            <VcInput
                v-model="localModel"
                placeholder="Context Key To Set"
                size="small"
            />
        </VcFormItem>
    </div>
</template>

<script setup lang="ts">
import type { TResponseToContext } from '~/types/scenaries'

const props = defineProps<{
    modelValue: TResponseToContext
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: TResponseToContext): void
    (e: 'remove', value: TResponseToContext): void
}>()

const localModel = computed({
    get: () => props.modelValue.contextKeyToSet,
    set: (value) => {
        const setToContext = !!value
        emit('update:modelValue', {
            contextKeyToSet: value,
            setToContext
        })
    },
})

function onRemove () {
    emit('remove', props.modelValue)
}
</script>
