<template>
    <div class="w-full">
        <VcFormItem label="Target">
            <VcInput
                v-model="DialTargetModel"
                placeholder="Target"
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

const DialTargetModel = computed({
    get: () => localModel.value?.target,
    set: (value) => {
        localModel.value.target = value
    }
})
</script>
