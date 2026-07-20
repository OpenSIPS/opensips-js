<template>
    <div class="w-full">
        <VcFormItem label="DTMF Number">
            <VcInput
                v-model="DtmfModel"
                placeholder="Dtmf"
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

const DtmfModel = computed({
    get: () => localModel.value.dtmf,
    set: (value) => {
        localModel.value.dtmf = value
    }
})
</script>
