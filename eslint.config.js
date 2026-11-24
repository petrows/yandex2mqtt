'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    js.configs.recommended,
    {
        ignores: ['node_modules/', 'data/', 'test/'],
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                // Set in app.js
                logger: 'readonly',
                mqttClient: 'readonly',
            },
        },
        rules: {
            'no-empty': ['error', {allowEmptyCatch: true}],
            'indent': ['error', 4, {SwitchCase: 1}],
            'arrow-parens': ['error', 'as-needed'],
        },
    },
];
