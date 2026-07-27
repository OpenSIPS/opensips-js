<template>
    <div class="w-full">
        <VcFormItem label="Text">
            <VcInput
                v-model="TextModel"
                placeholder="Text to speak"
            />
        </VcFormItem>
    </div>
</template>

<script setup lang="ts">
import type { ObjectAnyType } from '~/types'

const props = defineProps<{
    modelValue: ObjectAnyType
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: ObjectAnyType): void
}>()

const localModel = useVModel(props, 'modelValue', emit)

const TextModel = computed({
    get: () => localModel.value.text,
    set: (value) => {
        localModel.value.text = value
    }
})
</script>
