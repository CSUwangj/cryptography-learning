// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { expect, it } from 'vitest'

const eslint = new ESLint({ cwd: fileURLToPath(new URL('../', import.meta.url)) })
async function boundaryMessages(source: string, filePath: string) {
  const [result] = await eslint.lintText(source + '\n', { filePath })
  expect(result.fatalErrorCount).toBe(0)
  return result.messages.filter(message => message.ruleId === 'modules/public-imports')
}

it.each([
  "import '../ui/learning'",
  "import type { LearningRow } from '../ui/learning'",
  "export { LearningRow } from '../ui/learning'",
  "export * from '../ui/learning'",
  "void import('../ui/learning')",
  "void import(`../ui/learning`)",
  "export type Row = import('../ui/learning').LearningRow",
  "import rows = require('../ui/learning')",
  "require('../ui/learning')",
  "import 'ui/learning'",
  "import '/src/ui/learning/index.ts'",
  "import '../ui/../ui/learning'",
])('rejects a new cross-module private reference: %s', async source => {
  expect(await boundaryMessages(source, 'src/visualizers/BoundaryProbe.ts')).toHaveLength(1)
})

it.each([
  ["import '../ui'", 'src/visualizers/BoundaryProbe.ts'],
  ["import '../ui/index.ts'", 'src/visualizers/BoundaryProbe.ts'],
  ["import 'ui'", 'src/visualizers/BoundaryProbe.ts'],
  ["void import('/src/crypto_graph/index.ts')", 'e2e/boundary.spec.ts'],
  ["import './BlockCipher'", 'src/visualizers/BoundaryProbe.ts'],
  ["import '../BlockCipher'", 'src/visualizers/nested/BoundaryProbe.ts'],
  ["import 'crypto_graph/operations/aes'", 'src/crypto_graph/BoundaryProbe.ts'],
  ["import '@blueprintjs/core'", 'src/visualizers/BoundaryProbe.ts'],
])('allows public, same-module and external imports: %s', async (source, filePath) => {
  expect(await boundaryMessages(source, filePath)).toEqual([])
})

it('allows generated transport imports only at the feature mapping seam', async () => {
  expect(await boundaryMessages("import '../transport/generated/graphql'", 'src/practice/map.ts')).toEqual([])
  expect(await boundaryMessages("import 'transport/generated/graphql'", 'src/learning/data.ts')).toEqual([])
  expect(await boundaryMessages("import '../transport/generated/graphql'", 'src/practice/BoundaryProbe.ts')).toHaveLength(1)
  expect(await boundaryMessages("import '../transport/generated/graphql'", 'src/app/BoundaryProbe.ts')).toHaveLength(1)
})

it('retains only the recorded legacy importer and exact private target', async () => {
  expect(await boundaryMessages("import '../ui/learning'", 'src/learning/LearningPage.tsx')).toEqual([])
  expect(await boundaryMessages("import '../ui/Error'", 'src/learning/LearningPage.tsx')).toHaveLength(1)
  expect(await boundaryMessages("import '../ui/learning'", 'src/learning/NewPage.tsx')).toHaveLength(1)
  expect(await boundaryMessages("import '../ui/learning/index'", 'src/learning/LearningPage.tsx')).toHaveLength(1)
})

it('checks authored JS/TS without writes and fixes only through lint:fix', async () => {
  const frontend = fileURLToPath(new URL('../', import.meta.url))
  const directory = mkdtempSync(join(tmpdir(), 'frontend-lint-'))
  try {
    for (const name of ['package.json', 'eslint.config.mjs']) copyFileSync(join(frontend, name), join(directory, name))
    symlinkSync(join(frontend, 'node_modules'), join(directory, 'node_modules'), 'dir')
    const source = join(directory, 'src/build')
    mkdirSync(source, { recursive: true })
    for (const extension of ['js', 'mjs', 'ts', 'mts', 'cts']) writeFileSync(join(source, `probe.${extension}`), 'export const probe = 1\n')
    writeFileSync(join(source, 'probe.cjs'), 'exports.probe = 1\n')
    writeFileSync(join(source, 'probe.tsx'), 'export const probe = <span />\n')
    const valid = await new ESLint({ cwd: directory }).lintFiles([source])
    expect(valid).toHaveLength(7)
    expect(valid.flatMap(result => result.messages)).toEqual([])

    const lint = (script: 'lint' | 'lint:fix') => spawnSync('npm', ['run', script], { cwd: directory, encoding: 'utf8' })
    const probe = join(source, 'probe.mts')
    const invalidSource = 'export const probe = 1;\n'
    writeFileSync(probe, invalidSource)
    const invalid = lint('lint')
    expect(invalid.status, invalid.stdout + invalid.stderr).toBe(1)
    expect(invalid.stdout).toContain('semi')
    expect(readFileSync(probe, 'utf8')).toBe(invalidSource)

    const fixed = lint('lint:fix')
    expect(fixed.status, fixed.stdout + fixed.stderr).toBe(0)
    expect(readFileSync(probe, 'utf8')).toBe('export const probe = 1\n')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 30_000)
