import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import stylistic from '@stylistic/eslint-plugin'
import react from 'eslint-plugin-react'

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/build/**',
      '**/dist/**',
      '**/test-results/**',
      'src/transport/generated/**',
    ],
  },
  react.configs.flat.recommended,
  ...tseslint.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      '@stylistic': stylistic,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      indent: ['error', 2],
      semi: ['error', 'never'],
      '@stylistic/member-delimiter-style': ['error', {
        multiline: { delimiter: 'none', requireLast: false },
        singleline: { delimiter: 'comma', requireLast: false },
      }],
      'react/display-name': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'react/prop-types': 'off',
    },
  },
]
