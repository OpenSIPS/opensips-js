<template>
    <div class="w-full">
        <VcFormItem label="Sound">
            <VcInput
                v-model="SoundModel"
                placeholder="Sound"
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

const SoundModel = computed({
    get: () => localModel.value.sound,
    set: (value) => {
        localModel.value.sound = value
    }
})
</script>

