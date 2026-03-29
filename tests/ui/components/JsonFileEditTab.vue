<template>
    <div class="json-file-edit-tab relative">
        <div class="w-full flex justify-between gap-2 items-center flex-col lg:flex-row">
            <div class="capitalize text-lg font-medium order-2 lg:order-1">
                {{ fileName }}
            </div>
            <div class="flex justify-end gap-3 items-center order-1 lg:order-2">
                <VcButton
                    ref="deleteButtonRef"
                    :loading="loading"
                    icon="vc-lc-trash-2"
                    type="outline"
                    color="destructive"
                    @click="onDelete"
                >
                    Delete
                </VcButton>
                <VcButton
                    :loading="loading"
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
                <VcButton
                    :loading="loading"
                    icon="vc-icon-pages"
                    @click="onDuplicate"
                >
                    Duplicate
                </VcButton>
            </div>
        </div>
        <div class="">
            <div class="w-full max-w-60">
                <JsonAddScenarionAction @click="onAddNewScenario" />
            </div>
        </div>
        <div
            v-if="fileData"
            class="w-full pt-5"
        >
            <VcForm
                ref="baseFormRef"
                :model="fileData"
                :size="'small'"
                class="space-y-4"
            >
                <JsonFileScenarios
                    v-model="fileData.scenarios"
                    @scenario:copy="onCopyScenario"
                />
            </VcForm>
        </div>
        <div
            v-else
            class="w-full py-5"
        >
            No Data
        </div>

        <VcLoading
            :active="fetchLoading || loading"
            loader="stretch"
        />
    </div>
</template>

<script setup lang="ts">
import type { TestScenario, TJsonSetupForm } from '~/types/scenaries'
import JsonFileScenarios from '~/components/JsonFileScenarios.vue'
import { useConfirmPopup } from '@voicenter-team/voicenter-ui-plus'
import { useCustomSharedEventsProvide } from '~/composable/customSharedEvents'
import uniqueIdHelper from '~/helpers/uniqueId.helper'
import { cloneObject } from '~/helpers/object.helper'

type TEntity = {
    fileName?: string
}

const uniqueId = uniqueIdHelper('scenario-')

const props = defineProps<{
    loading?: boolean
    entity: TEntity
}>()
const emit = defineEmits<{
    (e: 'cancel'): void
    (e: 'save', data: TJsonSetupForm): void
    (e: 'delete', fileName: string): void
    (e: 'duplicate', data: string): void
}>()

const fetchLoading = ref(false)
const fileData = ref<TJsonSetupForm>({
    fileName: '',
    scenarios: []
})

const deleteButtonRef = useTemplateRef('deleteButtonRef')
const baseFormRef = useTemplateRef('baseFormRef')

const fileName = computed(() => props.entity.fileName?.replace('.json', ''))

function onAddNewScenario () {
    fileData.value.scenarios.push({
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

function onCancel () {
    emit('cancel')
}

function onSave () {
    baseFormRef.value?.validate().then((valid) => {
        if (valid.isValid) {
            emit('save', {
                ...fileData.value,
                scenarios: fileData.value.scenarios.map((scenario) => {
                    return {
                        ...scenario,
                        uId: undefined
                    }
                })
            })
        }
    })
}

function onDelete () {
    useConfirmPopup({
        target: deleteButtonRef,
        icon: 'vc-lc-shield-alert',
        iconClasses: 'text-warning text-2xl',
        message: 'Do you want to delete this file?',
        confirmAction: {
            color: 'destructive',
            icon: 'vc-icon-recycle-bin'
        },
        confirm: () => {
            emit('delete', props.entity.fileName!)
        }
    })
}

function onDuplicate() {
    baseFormRef.value?.validate().then((valid) => {
        if (valid.isValid) {
            emit('duplicate', props.entity.fileName!);
        }
    });
}

async function fetchFileData (fileName: string) {
    if (!fileName) return
    try {
        fetchLoading.value = true
        const fullName = fileName.endsWith('.json') ? fileName : `${fileName}.json`
        const result = await $fetch(`/api/jsons/${fullName}`)

        if (Array.isArray(result)) {
            const scenarios = result.map((scenario) => {
                return {
                    ...scenario,
                    uId: uniqueId()
                }
            })
            fileData.value = {
                fileName: fileName,
                scenarios
            }
        }
    } catch (e) {
        console.error(e)
    } finally {
        fetchLoading.value = false
    }
}

function onCopyScenario (scenario: TestScenario) {
    fileData.value.scenarios.push({
        ...cloneObject(scenario),
        uId: uniqueId(),
        name: '',
    })
}

useCustomSharedEventsProvide(fileData)

watchEffect(() => {
    const fileName = props.entity.fileName
    if (fileName) {
        fetchFileData(fileName)
    }
})

defineExpose({
    cancel: onCancel
})
</script>
