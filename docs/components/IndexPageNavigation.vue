<template>
    <div class="relative index-navigation-item rounded-xl group h-full">
        <div class="gradient-border" />
        <NuxtLink
            :to="linkData.link"
            :class="!!linkData.info ? 'flex-col' : 'flex-row items-center'"
            class="index-navigation-item__content h-full leading-0 rounded-xl border-2 border-transparent flex bg-white dark:bg-gray-900 hover:bg-gradient-to-l to-white/1 from-primary/5"
        >
            <div v-if="linkData.icon" class="inline-flex">
                <UIcon
                    :name="linkData.icon"
                    size="32"
                    class="text-primary-400"
                />
            </div>
            <div>
                <h2 class="font-semibold text-xl">
                    {{ linkData.label }}
                </h2>
                <p v-if="linkData.info" class="text-gray-700 dark:text-gray-300 pt-2">
                    {{ linkData.info }}
                </p>
            </div>
            <UIcon
                name="i-heroicons:arrow-up-right"
                class="absolute right-2 top-2 dark:text-white/40 text-[#020420]/20 group-hover:text-primary group-hover:size-5 transition-all"
                size="1rem"
            />
        </NuxtLink>
    </div>
</template>

<script setup lang="ts">
interface ILinkData {
    label: string
    link: string
    info?: string
    icon?: string
}
defineProps<{
    linkData: ILinkData
}>()
</script>

<style lang="scss">
    .index-navigation-item {
        @apply border-transparent border min-h-min rounded-xl border-gray-200 dark:border-transparent hover:border-transparent;
        .gradient-border {
            opacity: 0;
            position: absolute;
            top: 0;
            left: 0;
            width: calc(100% + 2px);
            height: calc(100% + 2px);
            border-radius: 12px;
            transform: translate(-1px, -1px);
        }
        .index-navigation-item__content {
            @apply relative py-4 px-4 rounded-xl flex gap-x-4 dark:border-none bg-white dark:bg-gray-900;
        }
        &:hover {
            .gradient-border {
                opacity: 1;
                transition: all 0.3s linear;
                background: linear-gradient(var(--gradient-angle), rgb(172, 203, 52), rgb(146, 177, 26), rgba(255, 255, 255, 0.3), rgb(94, 117, 6));
                animation: gradient-rotate 5s cubic-bezier(0,0,1,1) 0s infinite reverse;
            }
        }

    }
    .light {
        .index-navigation-item {
            &:hover {
                .gradient-border {
                    background: linear-gradient(var(--gradient-angle), rgb(172, 203, 52), rgb(194, 227, 66), rgba(207, 205, 205, 0.42), rgb(200, 236, 60));
                }
            }
        }
    }

@property --gradient-angle {
    syntax: '<angle>';
    inherits: false;
    initial-value: 180deg
}

@keyframes gradient-rotate {
    0% {
        --gradient-angle: 0deg
    }

    100% {
        --gradient-angle: 360deg
    }
}

</style>
