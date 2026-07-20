/* eslint-env node */
module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: [ '@typescript-eslint' ],
    extends: [
        'plugin:@typescript-eslint/recommended',
        '@voicenter-team/ts'
    ],
    ignorePatterns: [
        'src/helpers/webrtcmetrics/',
        'docs',
        'tests/ui'
    ],
    rules: {
        'space-before-blocks': 'off',
        'no-dupe-class-members': 'off'
    },
    env: {
        es2021: true,
        browser: true,
        node: true
    }
}
