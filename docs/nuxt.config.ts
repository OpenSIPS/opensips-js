// https://nuxt.com/docs/api/configuration/nuxt-config
import { resolve } from 'path'

export default defineNuxtConfig({
    devtools: { enabled: true },
    app: {
        head: [
            ['link', { rel: 'icon', href: '/favicon.png' }],
            ['meta', { name: 'theme-color', content: '#a5c544' }],
            ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
            ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: '#a5c544' }]
        ],
    },
    extends: [
        // [ '../../nuxt-ui/nuxt-ui-new', { install: true } ]
        [ 'github:VoicenterTeam/documentation-template', { install: true } ]
    ],
    modules: [ '@nuxt/eslint' ],
    routeRules: {
        '/': { prerender: true }
    },
    uiTypedoc: {
        // TODO: need to uncomment it after fixing types in src folder
        // typesGenerate: true,
        // entryPoints: [ resolve(__dirname, '../dist/index.d.ts') ]
    },
    css: [
        // join(currentDirLocal, 'assets/css/main.css'),
        './assets/css/tailwind.css'
    ],
    compatibilityDate: '2024-08-26',
    alias: {
        '@': resolve(__dirname, '../src')
    }
})
