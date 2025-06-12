
<template>
    <div class="w-full h-full">
        <ClientOnly>
            <ExampleContent/>
        </ClientOnly>
    </div>
</template>
<script setup lang="ts">
useSeoMeta({
    titleTemplate: '%s | OpenSIPSJS',
    title: 'Demo',
    ogTitle: `Demo`,
    description: 'The JS package for voicenter opensips, example page.',
    ogDescription: 'The JS package for voicenter opensips, example page.'
})
</script>
