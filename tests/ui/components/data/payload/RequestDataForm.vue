<template>
    <div class="request-payload-data">
        <VcFormItem
            label="Payload Url"
        >
            <VcInput
                v-model="modelUrl"
                placeholder="Payload Url"
            />
        </VcFormItem>
        <div class="flex items-center justify-between">
            <div class="w-full">
                Method Type:
            </div>
            <div class="w-full">
                <VcSelect
                    v-model="OptionsMethodModel"
                    :options="['GET', 'POST', 'PUT', 'DELETE', 'PATCH']"
                    size="small"
                />
            </div>
        </div>
        <div class="flex items-center justify-between py-3 gap-3">
            <VcButton
                icon="vc-lc-eye"
                type="outline"
                size="small"
                block
                @click="openPreview"
            >
                View Request
            </VcButton>
            <VcButton
                icon="vc-lc-settings"
                type="outline"
                size="small"
                block
                @click="openRequestOptionsConfigModal('headers')"
            >
                Configure Headers
            </VcButton>
            <VcButton
                icon="vc-lc-settings"
                type="outline"
                size="small"
                block
                @click="openRequestOptionsConfigModal('data')"
            >
                Configure Data
            </VcButton>
        </div>
        <RequestOptionsConfigModal
            ref="requestOptionsConfigModalRef"
            @save="saveRequestOptionsConfig"
        />
    </div>
</template>

<script setup lang="ts">
import type { ObjectAnyType } from '~/types'
import RequestOptionsConfigModal from '~/components/data/payload/RequestOptionsConfigModal.vue'
import useJsonPreviewData from '~/composable/useJsonPreviewData'

const { openPreviewWindow } = useJsonPreviewData()

const props = defineProps<{
    modelValue: ObjectAnyType
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: ObjectAnyType): void
}>()

const localModel = useVModel(props, 'modelValue', emit)
const requestOptionsConfigModalRef = useTemplateRef('requestOptionsConfigModalRef')

const modelUrl = computed({
    get: () => localModel.value.url,
    set: (value) => {
        localModel.value.url = value
    }
})

const OptionsMethodModel = computed({
    get: () => localModel.value.options?.method,
    set: (value) => {
        localModel.value.options = {
            ...(localModel.value.options || {}),
            method: value
        }
    }
})

function openRequestOptionsConfigModal (configType: 'headers' | 'data') {
    const dataToEdit = configType === 'data' ? localModel.value?.options?.data : localModel.value.options?.headers
    requestOptionsConfigModalRef.value?.openModal(configType, dataToEdit)
}

function saveRequestOptionsConfig (dataToSave: {
    type: 'headers' | 'data',
    data: ObjectAnyType
}) {
    localModel.value.options = {
        ...(localModel.value.options || {}),
        [dataToSave.type]: dataToSave.data
    }
}

function openPreview () {
    openPreviewWindow(localModel.value)
}
</script>
