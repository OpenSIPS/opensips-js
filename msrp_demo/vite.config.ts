import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// Resolve once for clarity.
const rootDir = resolve(__dirname, '..')
const rootSrc = resolve(rootDir, 'src')

// We intentionally do NOT depend on opensips-js as a package - the whole point
// of having this demo inside the same repo is to import the library directly
// from ../src (e.g. `import OpenSIPSJS from '../../src/index'`) so changes
// show up immediately via HMR.
export default defineConfig({
    plugins: [ vue() ],
    resolve: {
        alias: {
            // Mirror the alias used by opensips-js library internals so files
            // like `import x from '@/helpers/audio.helper'` keep resolving when
            // the library source is loaded from ../src.
            '@': rootSrc
        },
        // Make sure there is only one copy of Vue at runtime (the one from
        // msrp_demo/node_modules) even if anything upstream pulls Vue in.
        dedupe: [ 'vue' ]
    },
    server: {
        port: 5174,
        host: true,
        fs: {
            // The library source sits one level up; without this Vite would
            // refuse to serve it during dev.
            allow: [ rootDir ]
        }
    },
    optimizeDeps: {
        // The library pulls these in via ../src. Pre-bundling them avoids
        // dev-time CJS/ESM interop hiccups.
        include: [ 'jssip', 'sdp-transform', 'loglevel', 'p-iteration', 'uuid', 'generate-unique-id' ]
    }
})
