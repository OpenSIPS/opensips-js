import VoicenterUI from '@voicenter-team/voicenter-ui-plus'
import UITheme from './ui-theme.json'

export default defineNuxtPlugin(nuxtApp => {
    const colorMode = nuxtApp.$colorMode as { value: 'light' | 'dark' }
    nuxtApp.vueApp.use(VoicenterUI, {
        themeConfig: {
            type: 'customJson',
            config: colorMode.value === 'dark' ? UITheme.dark : UITheme.light
        }
    })
})
