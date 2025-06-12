<template>
    <div class="py-3 relative h-full flex items-center justify-center">
        <div class="w-full max-w-7xl px-4 sm:px-6 lg:px-8 relative">
            <div class="py-5 lg:pt-10 pb-5 text-center">
                <h1 class="text-5xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-7xl">
                    <span><span class="text-primary">Opensips JS</span>
                    </span>
                </h1>
                <div class="py-5 tracking-tight mt-6 text-lg/8 lg:px-32 text-gray-900 dark:text-white space-y-3">
                    <p>Developer friendly modern Javascript library that manages the user interactions with the opensips server based in JSSip.</p>
                    <p>
                        The Opensips JS library and its expansive ecosystem offer developers a powerful and flexible solution for
                        integrating Opensips protocol functionalities into a multitude of applications.
                        Whether building modern web applications, native mobile apps, or enhancing legacy systems,
                        the Opensips JS library provides the necessary tools and modules to meet diverse development needs.
                        With its modular design and comprehensive SDKs, the Opensips JS ecosystem is an essential
                        resource for developers looking to leverage the Opensips protocol across various technological landscapes.
                    </p>
                    <p>It includes TypeScript implementation and has large ecosystem.</p>
                </div>
            </div>
            <div class="px-5 pb-8">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-6 max-w-4xl mx-auto">
                    <IndexPageNavigation
                        v-for="nav in navigationLinks"
                        :key="nav.label"
                        :link-data="nav"
                    />
                </div>
            </div>
            <div class="text-center">
                <h3 class="font-semibold text-xl">Sponsored by</h3>
            </div>
            <div class="grid sm:grid-cols-2 gap-6 px-5 lg:px-12 pt-5 max-w-3xl mx-auto">
                <div class="rounded-lg bg-gray-50 overflow-hidden flex items-center justify-center">
                    <img src="/voicenter-animated-logo.gif" alt="voicenter" class="w-full h-auto object-contain">
                </div>
                <div class="rounded-lg bg-gray-50 overflow-hidden flex items-center justify-center">
                    <img src="/opensips-logo.png" alt="opensips" class="w-full h-auto object-contain">
                </div>
            </div>
        </div>
    </div>
</template>
<script setup lang="ts">

const navigationLinks = [
    {
        label: 'Documentation',
        icon: 'i-heroicons:book-open',
        link: '/docs'
    },

    // Uncomment when TS is fixed so we have the API docs
    // {
    //     label: 'API',
    //     icon: 'i-heroicons:server-stack',
    //     link: '/api'
    // },
    {
        label: 'Example',
        icon: 'i-heroicons:window',
        link: '/example'
    },
    {
        label: 'Ecosystem',
        icon: 'i-heroicons:cube',
        link: '/docs/ecosystem'
    }
]
</script>
