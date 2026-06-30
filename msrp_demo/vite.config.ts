import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const rootDir = resolve(__dirname, '..')
const rootSrc = resolve(rootDir, 'src')

export default defineConfig({
    plugins: [ vue() ],
    resolve: {
        alias: {
            '@': rootSrc
        },
        dedupe: [ 'vue' ]
    },
    server: {
        port: 5174,
        host: true,
        fs: {
            allow: [ rootDir ]
        }
    },
    optimizeDeps: {
        include: [ 'jssip', 'sdp-transform', 'loglevel', 'p-iteration', 'uuid', 'generate-unique-id' ]
    }
})
