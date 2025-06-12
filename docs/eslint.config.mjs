import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({
    parser: 'vue-eslint-parser',
    extends: [
        '@voicenter-team/vue',
        '@nuxt/eslint-config'
    ],
})