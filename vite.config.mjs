import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

// 'lib' | 'demo'
const target = process.env.TARGET ?? 'lib'

console.log('TARGET:', target)

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
    if (command === 'serve') {
        return {
            plugins: [ vue(), viteSingleFile() ],
            root: './demo',
            base: '',
            resolve: {
                alias: {
                    '@': resolve(__dirname, './src'),
                }
            }
        }
    } else if (target === 'demo') {
        return {
            plugins: [
                viteSingleFile()
            ],
            resolve: {
                alias: {
                    '@': resolve(__dirname, './src'),
                }
            },
            root: resolve(__dirname, './demo')
        }
    } else if (target === 'lib') {
        return {
            build: {
                outDir: 'dist',
                sourcemap: false,
                commonjsOptions: {
                    esmExternals: true
                },
                skipDiagnostics: false,
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
                    rollupTypes: true,
                    copyDtsFiles: true
                }),
                vue(),
                viteSingleFile()
            ],
            resolve: {
                alias: {
                    '@': resolve(__dirname, './src'),
                }
            },
            base: './',
        }
    }
})
