<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
    loadEmojiDataset,
    searchEmojis,
    type EmojiCompactEntry,
    type EmojiDataset,
    type EmojiGroup
} from './EmojiPicker.helpers'

interface Props {
    /** Whether the picker is visible. Parent controls open/close. */
    open: boolean
    /** Optional CSS-pixel offsets from the top-left of the parent overlay slot. */
    x?: number
    y?: number
}

const props = withDefaults(defineProps<Props>(), {
    x: 0,
    y: 0
})

const emit = defineEmits<{
    (e: 'select', emoji: string): void
    (e: 'close'): void
}>()

const dataset = ref<EmojiDataset | null>(null)
const isLoading = ref<boolean>(false)
const loadError = ref<string>('')

const activeGroupId = ref<number | null>(null)
const query = ref<string>('')

const searchInputRef = ref<HTMLInputElement | null>(null)
const rootRef = ref<HTMLDivElement | null>(null)

const currentGroup = computed<EmojiGroup | null>(() => {
    if (!dataset.value) return null
    if (activeGroupId.value === null) return dataset.value.groups[0] ?? null
    return dataset.value.groups.find((g) => g.id === activeGroupId.value) ?? null
})

const searchResults = computed<EmojiCompactEntry[]>(() => {
    if (!dataset.value) return []
    return searchEmojis(dataset.value, query.value)
})

const visibleEmojis = computed<EmojiCompactEntry[]>(() => {
    if (query.value.trim()) return searchResults.value
    return currentGroup.value?.emojis ?? []
})

function selectGroup (gid: number) {
    activeGroupId.value = gid
    query.value = ''
}

function pick (emoji: EmojiCompactEntry) {
    emit('select', emoji.unicode)
}

function handleDocumentClick (e: MouseEvent) {
    if (!props.open) return
    const el = rootRef.value
    if (el && e.target instanceof Node && !el.contains(e.target)) {
        emit('close')
    }
}

function handleKeydown (e: KeyboardEvent) {
    if (!props.open) return
    if (e.key === 'Escape') {
        e.preventDefault()
        emit('close')
    }
}

// First-open lazy load
watch(() => props.open, async (isOpen) => {
    if (!isOpen) return
    query.value = ''
    if (!dataset.value && !isLoading.value) {
        isLoading.value = true
        loadError.value = ''
        try {
            dataset.value = await loadEmojiDataset()
            if (activeGroupId.value === null && dataset.value.groups.length > 0) {
                activeGroupId.value = dataset.value.groups[0].id
            }
        } catch (err) {
            loadError.value = err instanceof Error ? err.message : String(err)
        } finally {
            isLoading.value = false
        }
    }
    await nextTick()
    searchInputRef.value?.focus()
}, { immediate: true })

onMounted(() => {
    document.addEventListener('mousedown', handleDocumentClick, true)
    document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
    document.removeEventListener('mousedown', handleDocumentClick, true)
    document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
    <div
        v-if="open"
        ref="rootRef"
        class="emoji-picker"
        :style="{ left: x + 'px', top: y + 'px' }"
        role="dialog"
        aria-label="Emoji picker"
    >
        <div class="emoji-picker-header">
            <input
                ref="searchInputRef"
                v-model="query"
                type="text"
                class="emoji-search"
                placeholder="Search emoji…"
                autocomplete="off"
            />
        </div>

        <div v-if="isLoading && !dataset" class="emoji-loading">Loading emojis…</div>
        <div v-else-if="loadError" class="emoji-error">Failed to load emoji dataset: {{ loadError }}</div>

        <template v-else-if="dataset">
            <div v-if="!query.trim()" class="emoji-tabs">
                <button
                    v-for="group in dataset.groups"
                    :key="group.id"
                    class="emoji-tab"
                    :class="{ active: group.id === (activeGroupId ?? dataset.groups[0]?.id) }"
                    :title="group.label"
                    @click="selectGroup(group.id)"
                >
                    {{ group.representative }}
                </button>
            </div>

            <div class="emoji-group-label">
                <template v-if="query.trim()">
                    {{ searchResults.length }}
                    result{{ searchResults.length === 1 ? '' : 's' }} for "{{ query.trim() }}"
                </template>
                <template v-else>
                    {{ currentGroup?.label }}
                </template>
            </div>

            <div
                v-if="visibleEmojis.length"
                class="emoji-grid"
                role="listbox"
            >
                <button
                    v-for="emoji in visibleEmojis"
                    :key="emoji.hexcode"
                    class="emoji-cell"
                    :title="emoji.label"
                    :aria-label="emoji.label"
                    type="button"
                    @click="pick(emoji)"
                >
                    {{ emoji.unicode }}
                </button>
            </div>
            <div v-else class="emoji-empty">
                No emoji matches "{{ query.trim() }}".
            </div>
        </template>
    </div>
</template>

<style scoped>
.emoji-picker {
    position: fixed;
    z-index: 1000;
    width: 320px;
    height: 360px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 0.6rem;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: inherit;
}
.emoji-picker-header {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid #f1f5f9;
}
.emoji-search {
    width: 100%;
    padding: 0.35rem 0.55rem;
    border: 1px solid #d1d5db;
    border-radius: 0.4rem;
    font-size: 0.85rem;
    box-sizing: border-box;
}
.emoji-tabs {
    display: flex;
    gap: 0.05rem;
    padding: 0.25rem 0.35rem;
    border-bottom: 1px solid #f1f5f9;
    background: #f9fafb;
    overflow-x: auto;
    overflow-y: hidden;
    flex-shrink: 0;
}
.emoji-tab {
    flex: 0 0 auto;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.35rem;
    padding: 0.25rem 0.5rem;
    font-size: 1.1rem;
    line-height: 1.4;
    text-align: center;
    cursor: pointer;
}
.emoji-tab:hover { background: #eef2ff; }
.emoji-tab.active {
    background: #eef2ff;
    border-color: #6366f1;
}
.emoji-group-label {
    padding: 0.3rem 0.6rem;
    font-size: 0.7rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #f1f5f9;
}
.emoji-grid {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0.35rem;
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 0.15rem;
    align-content: start;
    box-sizing: border-box;
}
.emoji-cell {
    box-sizing: border-box;
    min-width: 0;
    background: transparent;
    border: 1px solid transparent;
    padding: 0.3rem 0;
    font-size: 1.35rem;
    line-height: 1.4;
    cursor: pointer;
    border-radius: 0.3rem;
    text-align: center;
}
.emoji-cell:hover {
    background: #f3f4f6;
    border-color: #e5e7eb;
}
.emoji-loading,
.emoji-error,
.emoji-empty {
    padding: 1rem;
    text-align: center;
    color: #6b7280;
    font-size: 0.85rem;
}
.emoji-error { color: #b91c1c; }

/* ---------- thin, subtle scrollbars ---------- */
.emoji-grid,
.emoji-tabs {
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
}
.emoji-grid::-webkit-scrollbar,
.emoji-tabs::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}
.emoji-grid::-webkit-scrollbar-track,
.emoji-tabs::-webkit-scrollbar-track {
    background: transparent;
}
.emoji-grid::-webkit-scrollbar-thumb,
.emoji-tabs::-webkit-scrollbar-thumb {
    background-color: #cbd5e1;
    border-radius: 999px;
    border: 2px solid transparent;
    background-clip: padding-box;
}
.emoji-grid::-webkit-scrollbar-thumb:hover,
.emoji-tabs::-webkit-scrollbar-thumb:hover {
    background-color: #94a3b8;
}
</style>
