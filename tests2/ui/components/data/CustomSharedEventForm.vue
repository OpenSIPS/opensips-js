<template>
    <div class="w-full">
        <div class="mb-2 flex items-center justify-between">
            <div class="underline text-sm font-medium">
                Custom Shared Event
            </div>
            <UIcon
                name="i-heroicons-x-mark"
                class="cursor-pointer text-gray-500 hover:text-red-500"
                size="16"
                @click="onRemove"
            />
        </div>
        <VcFormItem
            label="Name"
        >
            <VcInput
                v-model="localModel"
                size="small"
            />
        </VcFormItem>
    </div>
</template>

<script setup lang="ts">

const props = defineProps<{
    modelValue?: string
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value?: string): void
    (e: 'remove', value?: string): void
}>()

const localModel = useVModel(props, 'modelValue', emit)

function onRemove () {
    emit('remove', props.modelValue)
}
</script>
