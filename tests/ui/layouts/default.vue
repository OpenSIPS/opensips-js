<template>
    <div class="flex flex-col min-h-screen">
        <LayoutAppHeader />
        <main class="flex-grow default-main min-h-[calc(100vh-var(--header-height))] bg-main-bg">
            <slot />
        </main>
    </div>
</template>

<script setup lang="ts">

</script>
