<template>
    <div class="create-json-file-tab max-w-[1900px] mx-auto">
        <div class="">
            <VcForm
                ref="baseFormRef"
                :model="formLocalModel"
                :size="'small'"
                class="space-y-4"
            >
                <div class="flex justify-between gap-3 flex-col lg:flex-row">
                    <div class="flex-grow order-2 lg:order-1">
                        <VcFormItem
                            :rules="[required]"
                            label="File Name"
                            prop="fileName"
                            class="max-w-screen-lg"
                        >
                            <VcInput v-model="formLocalModel.fileName" />
                        </VcFormItem>
                    </div>
                    <div class="flex justify-end gap-3 items-center order-1 lg:order-2">
                        <VcButton
                            icon="vc-lc-undo-2"
                            type="outline"
                            color="secondary"
                            @click="onCancel"
                        >
                            Cancel
                        </VcButton>
                        <VcButton
                            icon="vc-lc-save"
                            :loading="loading"
                            @click="onSave"
                        >
                            Save
                        </VcButton>
                    </div>
                </div>

                <div class="">
                    <div class="w-full max-w-60">
                        <JsonAddScenarionAction @click="onAddNewScenario" />
                    </div>
                </div>

                <JsonFileScenarios
                    v-model="formLocalModel.scenarios"
                    @scenario:copy="onCopyScenario"
                />
            </VcForm>
        </div>
        <pre>{{ formLocalModel }}</pre>
    </div>
</template>

<script setup lang="ts">
import type { TestScenario, TJsonSetupForm } from '~/types/scenaries'
import { useCustomSharedEventsProvide } from '~/composable/customSharedEvents'
import useValidationRules from '~/composable/useValidationRules'
import JsonFileScenarios from '~/components/JsonFileScenarios.vue'
import uniqueIdHelper from '~/helpers/uniqueId.helper'
import { cloneObject } from '~/helpers/object.helper'

const { required } = useValidationRules()
const uniqueId = uniqueIdHelper('scenario-')

defineProps<{
    loading?: boolean
}>()

const emit = defineEmits<{
    (e: 'cancel'): void
    (e: 'save', data: TJsonSetupForm): void
}>()

const formLocalModel = ref<TJsonSetupForm>({
    fileName: '',
    scenarios: []
})

const baseFormRef = useTemplateRef('baseFormRef')


function onSave () {
    baseFormRef.value?.validate().then((valid) => {
        if (valid.isValid) {
            emit('save', {
                ...formLocalModel.value,
                scenarios: formLocalModel.value.scenarios.map((scenario) => {
                    return {
                        ...scenario,
                        uId: undefined
                    }
                })
            })
        }
    })
}

function onAddNewScenario () {
    formLocalModel.value.scenarios.push({
        uId: uniqueId(),
        name: '',
        actions: [
            {
                event: 'ready',
                actions: []
            }
        ]
    })
}

function resetData () {
    formLocalModel.value = {
        fileName: '',
        scenarios: []
    }
    baseFormRef.value?.resetFields()
}

function onCancel () {
    emit('cancel')
    resetData()

}

function onCopyScenario (scenario: TestScenario) {
    formLocalModel.value.scenarios.push({
        ...cloneObject(scenario),
        uId: uniqueId(),
        name: '',
    })
}

useCustomSharedEventsProvide(formLocalModel)

defineExpose({
    cancel: onCancel
})
</script>
