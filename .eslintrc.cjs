/* eslint-env node */
module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    extends: [
        '@voicenter-team/ts'
    ],
    ignorePatterns: [
        'src/helpers/webrtcmetrics/',
    ],
    rules: {},
    env: {
        es2021: true,
        browser: true,
        node: true
    }
}
