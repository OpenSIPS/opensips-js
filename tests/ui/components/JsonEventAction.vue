<template>
    <div
        class="border border-dashed border-gray-300 dark:border-gray-700 p-2 relative"
    >
        <VcFormItem label="Action Type">
            <div class="flex items-center gap-3 lg:gap-4 w-full">
                <VcSelect
                    v-model="localModel.type"
                    placeholder="Select Action Type"
                    :options="typeOptions"
                    :config="{
                        labelKey: 'label',
                        valueKey: 'value'
                    }"
                    size="small"
                    @change="onTypeChange"
                />
                <VcPopover
                    ref="popoverDataRef"
                    :disabled="!localModel.type"
                    trigger="click"
                >
                    <template #reference>
                        <VcButton
                            :disabled="!localModel.type"
                            type="outline"
                            icon="vc-lc-plus"
                            size="small"
                        >
                            Add Data
                        </VcButton>
                    </template>
                    <div class="space-y-2 p-2">
                        <div class="w-full">
                            <VcButton
                                type="borderless"
                                size="small"
                                block
                                @click="setData('responseToContext')"
                            >
                                ResponseToContext
                            </VcButton>
                        </div>
                        <div class="w-full">
                            <VcButton
                                type="borderless"
                                size="small"
                                block
                                @click="setData('waitUntil')"
                            >
                                Wait Until
                            </VcButton>
                        </div>
                        <div class="w-full">
                            <VcButton
                                type="borderless"
                                size="small"
                                block
                                @click="setData('customSharedEvent')"
                            >
                                Custom Shared Event
                            </VcButton>
                        </div>
                    </div>
                </VcPopover>
            </div>
        </VcFormItem>
        <template v-if="localModel.data">
            <div
                v-show="isOpen"
            >
                <div v-if="localModel.data?.payload">
                    <DataEventPayloadForm
                        v-model="localModel.data.payload"
                        :action-type="localModel.type"
                    />
                </div>
                <div v-if="localModel.data?.responseToContext">
                    <DataResponseToContextForm
                        v-model="localModel.data.responseToContext"
                        @remove="onRemovePayloadData('responseToContext')"
                    />
                </div>
                <div v-if="localModel.data.waitUntil">
                    <div class="mb-3 flex items-center justify-between">
                        <div class="underline text-sm font-medium">
                            Wait Until Events
                        </div>
                        <div class="flex items-center gap-2">
                            <VcButton
                                type="outline"
                                size="small"
                                icon="vc-lc-plus"
                                @click="addWaitUntilItem"
                            >
                                Add Event
                            </VcButton>
                            <UIcon
                                name="i-heroicons-x-mark"
                                class="cursor-pointer text-gray-500 hover:text-red-500"
                                size="16"
                                @click="onRemovePayloadData('waitUntil')"
                            />
                        </div>
                    </div>
                    <div class="space-y-2">
                        <DataWaitUntilForm
                            v-for="(waitUntilItem, index) in localModel.data.waitUntil"
                            :key="index"
                            v-model="localModel.data.waitUntil[index]"
                            @remove="removeWaitUntilItem(index)"
                        />
                    </div>
                </div>
                <div v-if="'customSharedEvent' in localModel.data">
                    <DataCustomSharedEventForm
                        v-model="localModel.data.customSharedEvent"
                        @remove="onRemovePayloadData('customSharedEvent')"
                    />
                </div>
            </div>
        </template>

        <div class="absolute top-1 right-1 flex items-center gap-2">
            <UIcon
                v-if="isDataNotEmpty"
                :name="isOpen ? 'i-heroicons-chevron-up-solid' : 'i-heroicons-chevron-down-solid'"
                class="cursor-pointer text-gray-500 hover:text-primary-500"
                size="20"
                @click="isOpen = !isOpen"
            />
            <UIcon
                name="i-heroicons-document-duplicate"
                class="cursor-pointer text-gray-500 hover:text-primary-500"
                size="20"
                @click="onDuplicate"
            />
            <UIcon
                name="i-heroicons-x-mark"
                class="cursor-pointer text-gray-500 hover:text-red-500"
                size="20"
                @click="$emit('action:remove')"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import type {
    TestScenarioEventAction,
    TestScenarioEventActionTypeDataPayload,
    TResponseToContext,
    TWaitUntil
} from '~/types/scenaries'
import { isPayloadRequired } from '~/enum/jsonSetup.enum'

type DataKey = 'payload' | 'responseToContext' | 'waitUntil' | 'customSharedEvent'

const props = defineProps<{
    modelValue: TestScenarioEventAction
    typeOptions: Array<{ label: string, value: string }>
}>()
const emit = defineEmits<{
    (e: 'update:modelValue', value: TestScenarioEventAction): void
    (e: 'add:data'): void
    (e: 'action:remove'): void
    (e: 'action:copy', value: TestScenarioEventAction): void
}>()

const localModel = useVModel(props, 'modelValue', emit)
const popoverDataRef = useTemplateRef('popoverDataRef')
const isOpen = ref(true)

const isDataNotEmpty = computed(() => {
    return localModel.value.data && Object.keys(localModel.value.data).length > 0
})

function setData (key: DataKey) {
    if (!localModel.value.data) {
        localModel.value.data = {}
    }

    if (!(key in localModel.value.data)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        localModel.value.data[key] = getDefaultData(key) as any
    }

    popoverDataRef.value?.hide()
    isOpen.value = true
}

function getDefaultData (key: DataKey) {
    switch (key) {
        case 'payload':
            return {} as TestScenarioEventActionTypeDataPayload
        case 'responseToContext':
            return {
                setToContext: false,
                contextKeyToSet: ''
            } as TResponseToContext
        case 'waitUntil':
            return [
                {
                    event: '',
                    timeout: undefined
                }
            ] as TWaitUntil[]
        case 'customSharedEvent':
            return ''
        default:
            return undefined

    }
}

function onTypeChange (option?: { value: string }) {
    localModel.value.data = undefined
    if (option?.value && isPayloadRequired(option.value)) {
        setData('payload')
    }
}

function onDuplicate () {
    emit('action:copy', localModel.value)
}

function onRemovePayloadData (key: DataKey) {
    if (localModel.value.data) {
        const _data = { ...localModel.value.data }
        delete _data[key]
        localModel.value.data = { ..._data }
    }
}

function addWaitUntilItem () {
    if (localModel.value.data?.waitUntil) {
        localModel.value.data.waitUntil.push({
            event: '',
            timeout: undefined
        })
    }
}

function removeWaitUntilItem (index: number) {
    if (localModel.value.data?.waitUntil) {
        localModel.value.data.waitUntil.splice(index, 1)
        if (localModel.value.data.waitUntil.length === 0) {
            onRemovePayloadData('waitUntil')
        }
    }
}

</script>
