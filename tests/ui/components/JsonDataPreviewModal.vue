<template>
    <USlideover
        v-model="isPreviewOpen"
        :ui="{width: 'w-screen max-w-xl'}"
    >
        <div class="w-full h-full flex flex-col p-4 py-2">
            <div class="w-full flex justify-between pb-2">
                <div>
                    Preview
                </div>
                <div class="flex items-center gap-2">
                    <UButton
                        color="gray"
                        variant="ghost"
                        size="sm"
                        :icon="copied ? 'i-heroicons-clipboard-document-check-16-solid' : 'i-heroicons-document-duplicate'"
                        class="flex"
                        square
                        padded
                        @click="copyJsonData"
                    />
                    <UButton
                        color="gray"
                        variant="ghost"
                        size="sm"
                        icon="i-heroicons-x-mark-20-solid"
                        class="flex"
                        square
                        padded
                        @click="isPreviewOpen = false"
                    />
                </div>
            </div>
            <div class="flex-1 overflow-auto bg-gray-100 dark:bg-gray-800 rounded-md">
                <div class="h-full text-xxs p-3">
                    <pre class="">{{ dataToPreview }}</pre>
                </div>
            </div>
        </div>
    </USlideover>
</template>

<script setup lang="ts">
import useJsonPreviewData from '~/composable/useJsonPreviewData'

const {
    isPreviewOpen,
    dataToPreview
} = useJsonPreviewData()

const copied = ref(false)

function copyJsonData () {
    copied.value = true
    navigator.clipboard.writeText(JSON.stringify(dataToPreview.value, null, 2))
    setTimeout(() => {
        copied.value = false
    }, 1000)
}
</script>

