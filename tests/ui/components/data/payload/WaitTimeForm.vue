<template>
    <div class="w-full">
        <VcFormItem label="Waiting Time">
            <VcInputNumber
                v-model="WaitingTimeModel"
                placeholder="Wait"
                :min-value="0"
                :step="1"
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

const WaitingTimeModel = computed({
    get: () => localModel.value.time,
    set: (value) => {
        localModel.value.time = value
    }
})
</script>
