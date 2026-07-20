/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Config } from 'tailwindcss'

import config from '@voicenter-team/voicenter-ui-plus/tailwind.config'
import { unset } from 'lodash-es'

unset(config, 'theme.colors.primary')

export default <Partial<Config>>{
    content: [
        './components/**/*.{js,vue,ts}',
        './layouts/**/*.vue',
        './pages/**/*.vue',
        './plugins/**/*.{js,ts}',
        './app.vue',
        './error.vue',
    ],
    theme: {
        darkMode: 'class',
        extend: {
            colors: {
                ...config.theme?.colors,
                yellow: {
                    50: '#f6faee',
                    100: '#ecf4dd',
                    200: '#dae9ba',
                    300: '#b9da68',
                    400: '#a1c930',
                    500: '#8cb01d',
                    600: '#6b861a',
                    700: '#5b7213',
                    800: '#3d4b14',
                    900: '#2b350c',
                    950: '#1a2105'
                },
                darkBg: 'var(--app-dark-bg,#0B1F36)',
                lightBg: 'var(--app-light-bg, #F4F5F4)'
            },
            borderColor: {
                ...config.theme?.borderColor
            },
            backgroundColor: {
                ...config.theme?.backgroundColor
            },
            boxShadow: {
                ...config.theme?.boxShadow
            },
        }
    }
}
