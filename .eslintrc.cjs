/* eslint-env node */
module.exports = {
    root: true,
    extends: [
        'plugin:@typescript-eslint/recommended',
        'eslint:recommended'
    ],
    ignorePatterns: [
        'src/helpers/webrtcmetrics/',
    ],
    rules: {
        '@typescript-eslint/ban-ts-comment': [ 'error' ],
        '@typescript-eslint/no-unused-vars': 'error',
        'no-unused-vars': 'off',
        'no-console': [ 'error', { allow: [ 'warn', 'error' ] } ],
        'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
        'semi': [ 'error', 'never' ],
        'quotes': [ 'error', 'single' ],
        'object-curly-spacing': [ 'error', 'always' ],
        'array-bracket-spacing': [ 'error', 'always' ],
        'space-before-function-paren': [ 'error', 'always' ],
        '@typescript-eslint/no-var-requires': 0,
        'indent': [ 'error', 4, { 'SwitchCase': 1 } ],
    },
    env: {
        es2021: true,
        browser: true,
        node: true
    }
}
