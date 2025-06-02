<template>
    <NuxtLayout>
        <NuxtPage />
        <VcConfirmPopover />
        <VcNotification
            group="bottom-right"
            position="bottom-right"
        />
    </NuxtLayout>
</template>

<script lang="ts" setup>

</script>

<style>
body {
    @apply antialiased font-sans text-black dark:text-white bg-lightBg dark:bg-darkBg;
}
</style>
