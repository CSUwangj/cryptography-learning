import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import stylistic from '@stylistic/eslint-plugin'
import react from 'eslint-plugin-react'
import { readdirSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const sourceRoot = resolve(root, 'src')
const modules = new Set(readdirSync(sourceRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory()).map(entry => entry.name))
// Existing importer/specifier edges only; new targets and importers still fail.
// Additional uses of a recorded edge remain allowed. Remove entries when their imports disappear.
const legacyImports = {
  'demos/Aes192OverlayPrototype.tsx': ['../src/ui/learning'],
  'demos/AesCipherDemo.language.test.tsx': ['../src/app/i18n'],
  'demos/AesCipherDemo.test.tsx': ['../src/app/i18n'],
  'demos/AesV2Demo.tsx': [
    '../src/lesson_runtime/fixture/aes128-v2-locales/en-US.yaml?raw',
    '../src/lesson_runtime/fixture/aes128-v2-locales/zh-CN.yaml?raw',
    '../src/lesson_runtime/fixture/aes128-v2.yaml?raw',
    '../src/lesson_runtime/fixture/aes192-v2-locales/en-US.yaml?raw',
    '../src/lesson_runtime/fixture/aes192-v2-locales/zh-CN.yaml?raw',
    '../src/lesson_runtime/fixture/aes192-v2.yaml?raw',
    '../src/lesson_runtime/fixture/aes256-v2-locales/en-US.yaml?raw',
    '../src/lesson_runtime/fixture/aes256-v2-locales/zh-CN.yaml?raw',
    '../src/lesson_runtime/fixture/aes256-v2.yaml?raw',
  ],
  'demos/ComparisonPrototype.tsx': [
    '../src/app/App.css',
    '../src/ui/learning',
  ],
  'demos/KeyExpansionPrototype.test.tsx': ['../src/app/i18n'],
  'demos/KeyExpansionPrototype.tsx': ['../src/ui/learning'],
  'demos/LearningShellPrototype.tsx': [
    '../src/app/App.css',
    '../src/app/i18n',
    '../src/app/shell/Shell',
    '../src/ui/learning',
  ],
  'demos/SlidingWindowDemo.test.tsx': ['../src/app/i18n'],
  'demos/SlidingWindowDemo.tsx': ['../src/app/App.css'],
  'demos/SpnV2Demo.tsx': ['../src/app/App.css'],
  'demos/UiOptimizationPrototype.tsx': [
    '../src/app/App.css',
    '../src/app/feedback/FeedbackPage',
    '../src/app/home/HomePage',
    '../src/app/i18n',
    '../src/app/shell/Shell',
  ],
  'demos/aes192OverlayPrototypeData.test.ts': ['../src/app/i18n'],
  'demos/aes192OverlayPrototypeData.ts': [
    '../src/ui/learning',
    '../src/visualizers/BlockCipher',
    '../src/visualizers/KeyExpansion',
  ],
  'demos/diagnosticLanguageSwitching.test.tsx': ['../src/app/i18n'],
  'demos/i18n.test.tsx': ['../src/app/i18n'],
  'demos/main.tsx': ['../src/app/i18n'],
  'demos/prototypeI18n.test.tsx': ['../src/app/i18n'],
  'e2e/aes-learning-fixture.tsx': ['../src/ui/learning'],
  'e2e/overlay.spec.ts': ['../src/lesson_runtime/fixture/aes192-first-round'],
  'e2e/spn-cipher.spec.ts': ['../src/lesson_runtime/fixture/aes192-first-round'],
  'e2e/v2-default-trace-browser.tsx': ['../src/app/i18n'],
  'src/completion_board/map.test.ts': ['../transport/generated/graphql'],
  'src/learning/LearningPage.i18n.test.tsx': ['../app/i18n'],
  'src/learning/LearningPage.tsx': ['../ui/learning'],
  'src/lesson_runtime/aesV2.test.ts': ['../app/i18n'],
  'src/lesson_runtime/avalanche.test.ts': ['../app/i18n'],
  'src/lesson_runtime/bitFlip.test.ts': ['../app/i18n'],
  'src/lesson_runtime/comparison.test.ts': ['../app/i18n'],
  'src/lesson_runtime/index.test.ts': ['../app/i18n'],
  'src/practice/PracticeNavigation.tsx': ['../transport/generated/graphql'],
  'src/practice/map.test.ts': ['../transport/generated/graphql'],
  'src/terminal/Terminal.test.tsx': ['../app/i18n'],
  'src/terminal/browser/harness.tsx': ['../../app/i18n'],
  'src/ui/Error.test.tsx': ['../app/i18n'],
  'src/visualizers/Avalanche.tsx': ['../ui/learning'],
  'src/visualizers/BlockCipher.tsx': ['../ui/learning'],
  'src/visualizers/ClassicalCipher.tsx': ['../ui/learning'],
  'src/visualizers/ClassicalReadability.test.tsx': ['../app/i18n'],
  'src/visualizers/ExecutionTrace.tsx': ['../ui/learning'],
  'src/visualizers/KeyExpansion.tsx': ['../ui/learning'],
  'src/visualizers/TeachingSpn.tsx': ['../ui/learning'],
  'src/visualizers/aesV2.test.ts': [
    '../app/i18n',
    '../lesson_runtime/fixture/aes-avalanche-v2',
    '../lesson_runtime/fixture/aes128-v2-locales/en-US.yaml?raw',
    '../lesson_runtime/fixture/aes128-v2-locales/zh-CN.yaml?raw',
    '../lesson_runtime/fixture/aes128-v2.yaml?raw',
    '../lesson_runtime/fixture/aes192-v2-locales/en-US.yaml?raw',
    '../lesson_runtime/fixture/aes192-v2-locales/zh-CN.yaml?raw',
    '../lesson_runtime/fixture/aes192-v2.yaml?raw',
    '../lesson_runtime/fixture/aes256-v2-locales/en-US.yaml?raw',
    '../lesson_runtime/fixture/aes256-v2-locales/zh-CN.yaml?raw',
    '../lesson_runtime/fixture/aes256-v2.yaml?raw',
    '../ui/learning',
  ],
  'src/visualizers/comparison.test.tsx': ['../app/i18n'],
  'src/visualizers/i18n.test.tsx': ['../app/i18n'],
  'src/visualizers/index.test.ts': [
    '../app/i18n',
    '../ui/learning',
  ],
  'src/visualizers/keyAvalanche.test.tsx': ['../lesson_runtime/fixture/aes128-v2.yaml?raw'],
  'src/visualizers/migration.test.tsx': ['../app/i18n'],
  'src/visualizers/overlay.test.tsx': [
    '../app/i18n',
    '../lesson_runtime/fixture/overlay-three-anchor-v2-locales/en-US.yaml?raw',
    '../lesson_runtime/fixture/overlay-three-anchor-v2-locales/zh-CN.yaml?raw',
    '../lesson_runtime/fixture/overlay-three-anchor-v2.yaml?raw',
  ],
  'src/visualizers/spnCipher.test.tsx': [
    '../app/i18n',
    '../lesson_runtime/fixture/aes192-v2-locales/en-US.yaml?raw',
    '../lesson_runtime/fixture/aes192-v2-locales/zh-CN.yaml?raw',
    '../lesson_runtime/fixture/aes192-v2.yaml?raw',
    '../lesson_runtime/fixture/teaching-spn-v2-locales/en-US.yaml?raw',
    '../lesson_runtime/fixture/teaching-spn-v2-locales/zh-CN.yaml?raw',
    '../lesson_runtime/fixture/teaching-spn-v2.yaml?raw',
    '../ui/learning',
  ],
  'src/visualizers/traceFlow.tsx': ['../ui/learning'],
}

const mappingLayers = new Set([
  'src/practice/data.ts', 'src/practice/map.ts', 'src/completion_board/data.ts',
  'src/completion_board/map.ts', 'src/learning/data.ts',
])

const publicImports = {
  meta: { type: 'problem', schema: [], messages: { private: 'Import {{module}} through its public module entry point.' } },
  create(context) {
    const owner = relative(sourceRoot, context.filename).split(sep)[0]
    const importer = relative(root, context.filename).split(sep).join('/')
    function check(node) {
      if (node?.type === 'TSLiteralType') node = node.literal
      const source = node?.type === 'TemplateLiteral' && !node.expressions.length
        ? node.quasis[0].value.cooked : node?.value
      if (typeof source !== 'string') return
      const path = source.split(/[?#]/)[0]
      const target = path.startsWith('.') ? resolve(dirname(context.filename), path)
        : path.startsWith('/src/') ? resolve(root, path.slice(1))
          : modules.has(path.split('/')[0]) ? resolve(sourceRoot, path) : undefined
      if (!target) return
      const [module, ...parts] = relative(sourceRoot, target).split(sep)
      if (!modules.has(module) || module === owner || !parts.length
        || (parts.length === 1 && /^index(?:\.[cm]?[jt]sx?)?$/.test(parts[0]))) return
      if (module === 'transport' && parts[0] === 'generated' && mappingLayers.has(importer)) return
      if (legacyImports[importer]?.includes(source)) return
      context.report({ node, messageId: 'private', data: { module } })
    }
    return {
      ImportDeclaration: node => check(node.source),
      ExportNamedDeclaration: node => check(node.source),
      ExportAllDeclaration: node => check(node.source),
      ImportExpression: node => check(node.source),
      TSImportType: node => check(node.source),
      TSImportEqualsDeclaration: node => check(node.moduleReference.expression),
      CallExpression: node => {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') check(node.arguments[0])
      },
    }
  },
}

export default [
  {
    ignores: [
      'node_modules/**',
      'build/**',
      'dist/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      'playwright/.cache/**',
      'src/transport/generated/**',
    ],
  },
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  ...tseslint.configs['flat/recommended'],
  {
    files: ['**/*.{js,cjs,mjs,ts,cts,mts,tsx}'],
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
      modules: { rules: { 'public-imports': publicImports } },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      'modules/public-imports': 'error',
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
