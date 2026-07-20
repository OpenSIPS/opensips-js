<template>
    <div class="w-full max-w-screen-lg space-y-3">
        <VcSkeletonLoader
            v-if="loading"
            :type="'row@5'"
            row-height="58px"
            class="space-y-3"
        />
        <template v-else>
            <div
                v-for="(item, index) in fileNames"
                :key="item"
                class="cursor-pointer group ring-1 ring-gray-200 hover:ring-primary-500 dark:ring-gray-600 dark:hover:ring-primary-500 transition-all rounded-lg shadow"
                @click="onEdit(item)"
            >
                <div class="p-3 lg:p-4">
                    <div class="flex items-center gap-2">
                        <div>{{ index + 1 }}.</div>
                        <div class="flex-center">
                            <UIcon
                                name="i-heroicons-square-3-stack-3d"
                                size="20"
                                class="text-gray-500 group-hover:text-primary-500 transition-all"
                            />
                        </div>
                        <div class="flex-grow font-semibold capitalize">
                            {{ item }}
                        </div>
                        <div>
                            <UIcon
                                name="i-heroicons-arrow-top-right-on-square-solid"
                                size="20"
                                class="text-gray-500 group-hover:text-primary-500 transition-all"
                            />
                        </div>
                    </div>
                </div>
            </div>
            <div
                class="cursor-pointer group border border-dashed border-gray-200 hover:border-primary-500 dark:border-gray-600 dark:hover:border-primary-500 transition-all rounded-lg shadow"
                @click="onCreate"
            >
                <div class="p-3 lg:p-4 w-full">
                    <div class="flex-center gap-2 w-full">
                        <div class="flex-center">
                            <UIcon
                                name="i-heroicons-document-plus"
                                size="20"
                                class="text-gray-500 group-hover:text-primary-500 transition-all"
                            />
                        </div>
                        <div class="font-semibold">
                            Add New File
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
defineProps<{
    loading?: boolean
    fileNames?: Array<string>
}>()

const emit = defineEmits<{
    (e: 'file:new'): void
    (e: 'file:edit', pl: string): void
}>()

function onCreate () {
    emit('file:new')
}

function onEdit (item: string) {
    emit('file:edit', item)
}
</script>
