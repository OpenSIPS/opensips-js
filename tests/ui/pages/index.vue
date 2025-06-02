<template>
    <div
        class="w-full h-full p-3 lg:p-5 xl:p-8 index-page max-w-[1920px] mx-auto"
    >
        <div class="index-page__content">
            <MainEditableTabs
                ref="editableTabsRef"
            >
                <template #tab-list>
                    <JsonFilesList
                        :loading="loading"
                        :file-names="jsonData"
                        @file:edit="openFile"
                        @file:new="openCreateTab"
                    />
                </template>
                <template #tab-create>
                    <JsonFileCreateTab
                        ref="createTabRef"
                        :loading="loading"
                        @cancel="closeCreateTab"
                        @save="onCreateNewFile"
                    />
                </template>
                <template #tab-edit="{ entity }">
                    <JsonFileEditTab
                        ref="editTabRef"
                        :entity="entity"
                        :loading="loading"
                        @save="onSaveEditFile"
                        @cancel="closeEditTab"
                        @delete="onDeleteFile"
                    />
                </template>
            </MainEditableTabs>
        </div>
        <JsonDataPreviewModal />
    </div>
</template>

<script setup lang="ts">
import { useTemplateRef } from 'vue'
import type { TJsonSetupForm } from '~/types/scenaries'
import useNotifyService from '~/composable/useNotifyService'

const { seo } = useAppConfig()

/* Data */
const loading = ref(true)
const jsonData = ref<Array<string>>([])
/* Refs */
const editableTabsRef = useTemplateRef('editableTabsRef')
const createTabRef = useTemplateRef('createTabRef')
const editTabRef = useTemplateRef('editTabRef')

/* Methods */
async function fetchFiles () {
    try {
        loading.value = true
        const data = await $fetch('/api/jsons')
        jsonData.value = data?.files || []
    } catch (e) {
        console.error('Failed to fetch JSON:', e)
    } finally {
        setTimeout(() => {
            loading.value = false
        }, 500)
    }
}

function openFile (fileName: string) {
    editableTabsRef.value?.openEditTab(fileName, { fileName })
}

function openCreateTab () {
    editableTabsRef.value?.openCreateTab()
}

function closeCreateTab () {
    editableTabsRef.value?.openListTab()
}

function closeEditTab () {
    editableTabsRef.value?.closeActiveTab()
}

async function onDeleteFile (filename: string) {
    try {
        await $fetch(`/api/jsons/${filename}`, { method: 'DELETE' })
        closeEditTab()
        await fetchFiles()
    } catch (e) {
        console.error('Failed to delete JSON:', e)
    }
}

async function onSaveEditFile (data: TJsonSetupForm) {
    try {
        loading.value = true
        const fileName = data.fileName.replace('.json', '')
            .replace(/\s/g, '_')
        const dataToSave = data.scenarios || []
        await $fetch(`/api/jsons/${fileName}.json`, {
            method: 'PUT',
            body: [ ...dataToSave ]
        })
        editTabRef.value?.cancel()
        showNotifyMessage(`File ${fileName}.json updated successfully`)
        await fetchFiles()
    } catch (e) {
        console.error('Failed to update JSON:', e)
        loading.value = false
    }
}

async function onCreateNewFile (data: TJsonSetupForm) {
    try {
        loading.value = true
        const fileName = data.fileName.replace('.json', '')
            .replace(/\s/g, '_')
        const dataToSave = data.scenarios || []
        await $fetch(`/api/jsons/${fileName}.json`, {
            method: 'PUT',
            body: [ ...dataToSave ]
        })
        showNotifyMessage(`File ${fileName}.json created successfully`)
        createTabRef.value?.cancel()
        await fetchFiles()
    } catch (e) {
        console.error('Failed to create JSON:', e)
        loading.value = false
    }
}

function showNotifyMessage (message: string) {
    useNotifyService.add({
        type: 'success',
        group: 'bottom-right',
        duration: 3000,
        title: 'Success!',
        message
    })
}

useHead({
    title: seo.siteName
})

useSeoMeta({
    titleTemplate: seo.indexHeaderTemplate ?? '',
    title: seo.siteName,
    ogTitle: seo.siteName,
    description: seo.siteDescription,
    ogDescription: seo.siteDescription
})

/* Mounted */
onMounted(fetchFiles)
</script>
