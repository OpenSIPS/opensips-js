<template>
    <div class="w-full">
        <div class="underline text-sm font-medium mb-3">
            Payload for {{ actionType }}
        </div>
        <div>
            <component
                :is="formPayloadComponent"
                v-model="localModel"
                :action-type="actionType"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import type { ObjectAnyType } from '~/types'
import type { TestScenarioEventActionType } from '~/types/scenaries'
import { PAYLOAD_COMPONENTS } from '~/enum/jsonSetup.enum'


const props = defineProps<{
    modelValue: ObjectAnyType
    actionType?: TestScenarioEventActionType
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: ObjectAnyType): void
}>()

const localModel = useVModel(props, 'modelValue', emit)

const formPayloadComponent = computed(() => {
    if (!props.actionType) {
        return ''
    }

    return PAYLOAD_COMPONENTS[props.actionType]
})
</script>

