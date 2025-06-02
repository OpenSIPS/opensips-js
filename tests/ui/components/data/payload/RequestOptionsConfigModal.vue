<template>
    <UModal v-model="isOpen">
        <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-100 dark:divide-gray-800' }">
            <template #header>
                <div class="flex items-center justify-between">
                    <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
                        Options Modal
                    </h3>
                    <UButton
                        color="gray"
                        variant="ghost"
                        icon="i-heroicons-x-mark-20-solid"
                        class="-my-1"
                        @click="isOpen = false"
                    />
                </div>
            </template>
            <div>
                <div class="font-medium mb-2 text-sm">
                    {{ optionsType == 'headers' ? 'Headers' : 'Data' }}
                </div>
                <div
                    v-for="(entry, index) in entries"
                    :key="entry.id"
                    class="flex items-center justify-between gap-3 mb-3"
                >
                    <VcInput
                        :model-value="entry.key"
                        @update:model-value="updateKey(index, $event)"
                    />
                    <VcInput
                        :model-value="entry.value"
                        @update:model-value="updateValue(index, $event)"
                    />
                    <VcButtonIcon
                        color="destructive"
                        variant="ghost"
                        icon="vc-lc-x"
                        @click="removeRow(index)"
                    />
                </div>
                <!-- Empty row for new entries -->
                <div class="flex items-center justify-between gap-3">
                    <VcInput
                        v-model="newKey"
                        placeholder="New key"
                    />
                    <VcInput
                        v-model="newValue"
                        placeholder="New value"
                    />
                    <VcButtonIcon
                        color="primary"
                        variant="ghost"
                        icon="vc-lc-check"
                        @click="addNewEntry"
                    />
                </div>
            </div>

            <template #footer>
                <div class="flex items-center justify-between gap-3">
                    <VcButton
                        type="outline"
                        color="secondary"
                        @click="isOpen = false"
                    >
                        Cancel
                    </VcButton>
                    <VcButton
                        :disabled="isDisabledSave"
                        @click="onSaveModalData"
                    >
                        Save
                    </VcButton>
                </div>
            </template>
        </UCard>
    </UModal>
</template>

<script setup lang="ts">
import type { ObjectAnyType } from '~/types'

interface Entry {
    id: number
    key: string
    value: string | number
}

const emit = defineEmits<{
    (e: 'save', pl: {
        type: 'headers' | 'data',
        data: ObjectAnyType
    }): void
}>()

const isOpen = ref(false)
const optionsType = ref<'headers' | 'data' | undefined>(undefined)

const entries = ref<Entry[]>([])
const newKey = ref('')
const newValue = ref('')
let nextId = 0

const isDisabledSave = computed(() => {
    return entries.value.length === 0 || entries.value.some(entry => !entry.key)
})

// Convert object to array for v-for handling
const objectToEntries = (obj: ObjectAnyType): Entry[] => {
    return Object.entries(obj).map(([ key, value ]) => ({
        id: nextId++,
        key,
        value
    }))
}

const entriesToObject = (entries: Entry[]): ObjectAnyType => {
    return entries.reduce((acc, {
        key,
        value
    }) => {
        if (key) {
            acc[key] = value
        }
        return acc
    }, {} as ObjectAnyType)
}

const updateKey = (index: number, newKey: string | number) => {
    entries.value[index].key = newKey.toString()
}

const updateValue = (index: number, value: string | number) => {
    entries.value[index].value = value
}

const removeRow = (index: number) => {
    entries.value.splice(index, 1)
}

const addNewEntry = () => {
    if (!newKey.value) return
    entries.value.push({
        id: nextId++,
        key: newKey.value,
        value: newValue.value
    })
    newKey.value = ''
    newValue.value = ''
}

const onSaveModalData = () => {
    const data = entriesToObject(entries.value)
    emit('save', {
        type: optionsType.value || 'data',
        data
    })
    closeModal()
}


const openModal = (type: 'headers' | 'data', defaultData: ObjectAnyType = {}) => {
    optionsType.value = type
    entries.value = objectToEntries(defaultData)
    isOpen.value = true
}
const closeModal = () => {
    isOpen.value = false
    optionsType.value = undefined
}

defineExpose({
    openModal,
    closeModal
})
</script>

