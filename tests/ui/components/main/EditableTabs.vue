<template>
    <VcTabs
        ref="baseTabsRef"
        v-model="tabsModel"
        nav-scrollable
        @tab-remove="onTabRemove"
    >
        <VcTabPane
            v-for="(tabItem, index) in dataTabs"
            :key="tabItem.name || `edit-tab-${index + 1}`"
            :name="tabItem.name"
            :index="index"
            :label="tabItem.label"
            :closable="(tabItem.name !== LIST_TAB_NAME && tabItem.name !== CREATE_TAB_NAME)"
            :icon="getTabIcon(tabItem)"
            :lazy="lazyLoad || tabItem.lazy"
            :disabled="tabItem.disabled"
            :nav-class="tabItem.navClass"
            class="pt-3"
        >
            <slot
                v-if="tabItem.name === LIST_TAB_NAME"
                name="tab-list"
            />
            <slot
                v-else-if="tabItem.name === CREATE_TAB_NAME"
                name="tab-create"
            />
            <slot
                v-else-if="tabItem.entityData"
                name="tab-edit"
                :index="index"
                :tab-data="tabItem"
                :entity="tabItem.entityData"
            />
        </VcTabPane>
    </VcTabs>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { TIconClass } from '@voicenter-team/voicenter-ui-plus/library/types/enum/icons'
import { VcTabs } from '@voicenter-team/voicenter-ui-plus'
import type { ObjectAnyType } from '~/types'
import { cloneObject } from '~/helpers/object.helper'

const LIST_TAB_NAME = 'listTab'
const CREATE_TAB_NAME = 'createTab'

type TabDataType = {
    name: string
    label: string
    icon?: TIconClass
    navClass?: string
    disabled?: boolean
    lazy?: boolean
    entityData?: ObjectAnyType
}

/* Props */
const props = defineProps<{
    hideCreateTab?: boolean
    lazyLoad?: boolean
    modelValue?: string
    queryTabName?: string
    tabListName?: string
    confirmClose?: (tabData: ObjectAnyType | undefined) => Promise<boolean>
}>()
/* Emits */
const emit = defineEmits<{
    (e: 'close-tab', tabName: string): void
    (e: 'tab-change', tabName: string): void
}>()

const baseTabsRef = ref<typeof VcTabs>()
const tabsModel = ref(LIST_TAB_NAME)
const editTabs = ref<Array<TabDataType>>([])

/* Computed */
const dataTabs = computed<Array<TabDataType>>(() => {
    const listTab: TabDataType = {
        name: LIST_TAB_NAME,
        icon: 'vc-lc-list',
        label: props.tabListName || 'List',
    }

    const editTabsList = [
        ...editTabs.value
    ] as Array<TabDataType>

    const tabs: Array<TabDataType> = [
        listTab,
        ...editTabsList,
    ]

    if (!props.hideCreateTab) {
        return [
            ...tabs,
            {
                name: CREATE_TAB_NAME,
                icon: 'vc-icon-plus-linear create-tab-icon icon-lg',
                label: '',
                navClass: 'create-nav-tab'
            }
        ]
    } else {
        return tabs
    }
})

/* Methods */
function isTabActive (tabName: string) {
    return tabsModel.value === tabName
}

function onTabRemove (tabName: string) {
    const tabIndex = editTabs.value.findIndex(({ name }) => name === tabName)
    const _entityTabData = editTabs.value[tabIndex].entityData

    if (props.confirmClose) {
        props.confirmClose(_entityTabData)
            .then(res => {
                if (res) {
                    removeTab(tabName)
                }
            })
    } else {
        removeTab(tabName)
    }
}

function openListTab () {
    tabsModel.value = LIST_TAB_NAME
}

function removeTab (tabName: string) {
    const tabIndex = editTabs.value.findIndex(({ name }) => name === tabName)

    if (tabIndex !== -1) {
        if (isTabActive(tabName)) {
            openListTab()
        }

        editTabs.value.splice(tabIndex, 1)
    }

    emit('close-tab', tabName)
}

function closeActiveTab () {
    onTabRemove(tabsModel.value)
}

function openEditTab (fileName: string, entityData: ObjectAnyType) {
    if (!entityData || !fileName) {
        return
    }
    const tabName = `file-${fileName}`

    const isTabOpened = dataTabs.value.find(({ name }) => name === tabName)

    if (!isTabOpened) {
        const newTab = {
            entityData: entityData,
            label: fileName || 'No Name',
            name: tabName
        }

        editTabs.value.push(newTab)
    }

    tabsModel.value = tabName
}

function openCreateTab () {
    tabsModel.value = CREATE_TAB_NAME
}

function setFirstActiveTab () {
    baseTabsRef.value?.setFirstActiveTab()
}

function setLastActiveTab () {
    baseTabsRef.value?.setLastActiveTab()
}

function togglePreviousTab () {
    baseTabsRef.value?.togglePreviousTab()
}

function toggleNextTab () {
    baseTabsRef.value?.toggleNextTab()
}

function getTabIcon (tab: TabDataType) {
    if (tab.name === CREATE_TAB_NAME || tab.name === LIST_TAB_NAME) {
        return tab.icon
    }

    return 'vc-lc-pencil-line'
}

function refreshEditableTabs<T extends object> (listData: Array<T>, keyName: keyof T) {
    editTabs.value = editTabs.value.map(tab => {
        return {
            ...tab,
            entityData: listData.find(item => item[keyName]?.toString() === tab.name)
        }
    })
}

function refreshEditableTab<T extends object> (entityData: T, tabName: string) {
    editTabs.value = editTabs.value.map(tab => {
        if (tab.name !== tabName) {
            return tab
        }
        return {
            ...tab,
            entityData: cloneObject(entityData)
        }
    })
}

defineExpose({
    removeTab,
    closeActiveTab,
    openEditTab,
    openListTab,
    openCreateTab,
    setFirstActiveTab,
    setLastActiveTab,
    togglePreviousTab,
    toggleNextTab,
    refreshEditableTabs,
    refreshEditableTab,
    getActiveTab: () => tabsModel.value
})

watch(
    tabsModel,
    () => {
        nextTick(() => {
            window.scroll({
                top: 0,
                left: 0,
                behavior: 'smooth'
            })
        })
    }
)
</script>
