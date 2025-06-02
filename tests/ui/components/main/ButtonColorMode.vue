<template>
    <ClientOnly v-if="!colorMode?.forced">
        <UButton
            :icon="isDark ? ICONS.moon : ICONS.sun"
            :aria-label="`Switch to ${isDark ? 'light' : 'dark'} mode`"
            color="gray"
            variant="ghost"
            @click="isDark = !isDark"
        />

        <template #fallback>
            <div class="w-8 h-8" />
        </template>
    </ClientOnly>
</template>

<script setup lang="ts">
import allThemes from '~/plugins/ui-theme.json'

const ALL_THEMES = allThemes as { [key: string]: { [key: string]: string } }

defineOptions({
    inheritAttrs: false
})
const { ui } = useAppConfig()
const ICONS = {
    moon: ui.icons.dark ?? 'i-heroicons-moon-20-solid',
    sun: ui.icons.light ?? 'i-heroicons-sun-20-solid'
}

type ThemeColorType = {
    name: string
    color: string
}

const colorMode = useColorMode()

// Computed
const isDark = computed({
    get () {
        return colorMode.value === 'dark'
    },
    set () {
        colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
        nextTick(setGlobalStyleVariables)
    }
})

function setGlobalStyleVariables (colors?: Array<ThemeColorType>) {
    return new Promise(resolve => {
        const root = document.documentElement
        let _colors = [] as Array<ThemeColorType>
        if (!colors) {
            _colors = getOverrideColorsByArray(getActiveThemeColors())
        } else {
            _colors = getOverrideColorsByArray(colors)
        }
        _colors.forEach(color => {
            root.style.setProperty(`--${color.name}`, color.color)
        })
        resolve(true)
    })
}

function getOverrideColorsByArray (colors: Array<ThemeColorType>) {
    const _object = Object.fromEntries(colors.map(el => {
        return [
            el.name,
            el.color
        ]
    }))
    const overrideElement = { ...overrideElementTheme(_object) }
    return Object.entries(overrideElement).map(([ name, color ]) => {
        return {
            name,
            color
        }
    })
}

function getActiveThemeColors () {
    const _key = isDark.value ? 'dark' : 'light'
    const _activeThemeColors = ALL_THEMES[_key]
    if (!_activeThemeColors) {
        return []
    }
    return Object.entries(_activeThemeColors).map(([ name, color ]) => {
        return {
            name,
            color
        }
    })
}

function overrideElementTheme (theme: { [key: string]: string }) {
    return {
        ...theme,
        'el-color-primary': theme['el-color-primary'] ?? theme.primary,
        'el-color-success': theme['el-color-success'] ?? theme.success,
        'el-color-warning': theme['el-color-warning'] ?? theme.warning,
        'el-color-danger': theme['el-color-danger'] ?? theme.error,
        'el-color-error': theme['el-color-error'] ?? theme.error,
        'el-color-info': theme['el-color-info'] ?? theme['secondary'],
        'el-fill-color': theme['el-fill-color'] ?? theme['field-bg'],
        'el-text-color-primary': theme['el-text-color-primary'] ?? theme['default-text'],
        'el-text-color-regular': theme['el-text-color-regular'] ?? theme['default-text'],
        'el-text-color-placeholder': theme['el-text-color-placeholder'] ?? theme.placeholders,
        'el-disabled-text-color': theme['el-disabled-text-color'] ?? theme['inactive-text'],
        'el-text-color-disabled': theme['el-text-color-disabled'] ?? theme['inactive-text'],
        transparent: 'transparent',
        white: '#FFFFFF',
        black: '#000000',
        current: 'currentColor'
    }
}
</script>
