<template>
    <div class="w-full">
        <VcFormItem label="From">
            <VcInput
                v-model="fromModel"
                placeholder="fromRoom"
            />
        </VcFormItem>
        <VcFormItem label="To">
            <VcInput
                v-model="toModel"
                placeholder="toRoom"
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

const fromModel = computed({
    get: () => localModel.value.fromRoom,
    set: (value) => {
        localModel.value.fromRoom = value
    }
})

const toModel = computed({
    get: () => localModel.value.toRoom,
    set: (value) => {
        localModel.value.toRoom = value
    }
})
</script>
