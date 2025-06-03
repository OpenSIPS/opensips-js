// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import dotenv from 'dotenv'

const PARENT_PATH_PREFIX = '../../'

const currentDirLocal = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, `${PARENT_PATH_PREFIX}.env`) })


export default defineNuxtConfig({
    compatibilityDate: '2025-05-15',
    devtools: { enabled: true },
    ssr: false,
    runtimeConfig: {
        folderPath: PARENT_PATH_PREFIX + process.env.JSON_FILES_PATH, // private
    },
    modules: [
        '@nuxt/ui',
        '@vueuse/nuxt'
    ],
    ui: {
        disableGlobalStyles: true
    },
    css: [
        '@voicenter-team/voicenter-ui-plus/library/style.css',
        join(currentDirLocal, 'assets/css/tailwind.css'),
        join(currentDirLocal, 'assets/css/main.css')
    ]
})
