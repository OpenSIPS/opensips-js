<template>
    <ClientOnly>
        <NuxtLink
            v-if="seo?.siteName"
            to="/"
            class="text-sm items-center gap-1 hidden sm:inline-flex"
        >
            <span v-if="siteVersion">({{ siteVersion }})</span>
        </NuxtLink>
    </ClientOnly>
</template>

<script setup lang="ts">
import { version } from '../../package.json'

const { seo } = useAppConfig()
const siteVersion = version
</script>
