import { defineConfig } from 'vite'
// import vue from '@vitejs/plugin-vue'
// import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

// https://vitejs.dev/config/
export default defineConfig({
    build: {
        outDir: 'dist',
        sourcemap: false,
        commonjsOptions: {
            esmExternals: true
        },
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            formats: [ 'es', 'cjs', 'umd', 'iife' ],
            name: 'OpensipsJS',
            fileName: (format) => {
                return `opensips-js.${format}.js`
            },
        }
    },
    plugins: [
        dts({
            rollupTypes: true
        }),
        // vue(),
        // viteSingleFile()
    ],
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
        }
    },

    // plugins: [ vue(), viteSingleFile() ],
    // root: './demo',
    // base: '',
})
