// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { genericComparisonDocuments } from '../../demos/genericComparisonLesson'
import { dataAvalancheDocuments } from '../../demos/dataAvalancheLesson'
import { keyAvalancheLesson } from '../../demos/keyAvalancheLesson'
import { firstAes192KeyChangeLesson } from '../../demos/keyChangeLesson'
import { validateLabMarkdown } from '../practice'
import { visualizerCatalog } from '../visualizers'
import { compileLesson, validateLessonDocuments, type LessonDocuments } from './index'

const frontend = fileURLToPath(new URL('../..', import.meta.url))
const temporary = mkdtempSync(join(tmpdir(), 'validator-package-'))
const cli = join(temporary, 'cryptography-learning-validator-web-v1.3.1', 'validator.cjs')
const readDocuments = (directory: string): LessonDocuments => ({
  lesson: readFileSync(join(directory, 'lesson.yaml'), 'utf8'),
  locales: Object.fromEntries(readdirSync(join(directory, 'locales')).map((file) => [file.slice(0, -5), readFileSync(join(directory, 'locales', file), 'utf8')])),
})
const invoke = (...args: string[]) => {
  const result = spawnSync(process.execPath, ['--permission', `--allow-fs-read=${temporary}/*`, cli, ...args], {
    cwd: temporary, encoding: 'utf8', timeout: 15_000, env: { ...process.env, NODE_PATH: '' },
  })
  expect(result.error).toBeUndefined()
  expect(result.signal).toBeNull()
  return { status: result.status, report: JSON.parse(result.stdout) }
}

beforeAll(() => {
  execFileSync(process.execPath, ['scripts/build_validator.mjs'], { cwd: frontend, encoding: 'utf8', timeout: 120_000 })
  execFileSync('tar', ['-xzf', join(frontend, 'dist/validator/cryptography-learning-validator-web-v1.3.1.tar.gz'), '-C', temporary])
}, 120_000)
afterAll(() => rmSync(temporary, { recursive: true, force: true }))

it('runs the Lab command outside the checkout without an installation', () => {
  const file = join(temporary, 'lab.md')
  writeFileSync(file, '# Lab\n\n$x^2$\n')
  expect(invoke('lab', file)).toEqual({ status: 0, report: validateLabMarkdown(readFileSync(file, 'utf8'), file) })
})

it('identifies the public release and pinned Node runtime', () => {
  expect(invoke('--version')).toEqual({ status: 0, report: { release: 'web-v1.3.1', node: '24.18.1' } })
  expect(JSON.parse(readFileSync(join(temporary, 'cryptography-learning-validator-web-v1.3.1/identity.json'), 'utf8')))
    .toEqual(invoke('--version').report)
})

const v1 = readDocuments(join(frontend, 'src/lesson_runtime/fixture'))
const v2 = readDocuments(join(frontend, '../docs/examples/migration/xor-v2'))
const wrongAnswer = { ...v1, lesson: v1.lesson.replace('value: "0x0ff0"', 'value: "0x0000"') }
const failure = parse(v1.lesson)
failure.graphs = { failure: { nodes: [{ id: 'fail', operation: 'test.throw@1' }], outputs: [{ node: 'fail', port: 'value' }] } }
failure.steps = [{ id: 'fail', execute: { graph: 'failure', bindings: {} }, accepted_error_codes: ['operation-failed'] }]
const acceptedError = { ...v1, lesson: stringify(failure) }
const defaultFlip = parse(dataAvalancheDocuments.lesson)
defaultFlip.inputs['changed-data'].default = '0xc0'
const aes = readFileSync(join(frontend, 'src/lesson_runtime/fixture/aes192-v2.yaml'), 'utf8')
const authoredSchedule = keyAvalancheLesson({ lesson: aes, locales: {} })
const scheduleDefaults = parse(authoredSchedule.lesson)
scheduleDefaults.inputs['changed-key'].default = scheduleDefaults.inputs.key.default
const schedule = { ...authoredSchedule, lesson: stringify(scheduleDefaults) }
const overlay = firstAes192KeyChangeLesson(aes, 'encrypt')
const invalidOverlay = parse(overlay.lesson)
invalidOverlay.inputs['changed-data'] = { ...invalidOverlay.inputs.plaintext, default: '0x80112233445566778899aabbccddeeff' }
invalidOverlay.steps[2].visualizer.compare.bindings.plaintext = { baseline: { input: 'plaintext' }, changed: { input: 'changed-data' } }
const failedComparison = parse(genericComparisonDocuments.lesson)
failedComparison.graphs.network.nodes[4] = { id: 'result', operation: 'test.throw@1' }
delete failedComparison.steps[1].presentation

it.each([
  ['v1', v1, true],
  ['v2', v2, true],
  ['wrong-answer', wrongAnswer, true],
  ['accepted-error', acceptedError, true],
  ['generic', genericComparisonDocuments, true],
  ['derived-data-avalanche', { ...dataAvalancheDocuments, lesson: stringify(defaultFlip) }, true],
  ['standalone-key-avalanche', schedule, true],
  ['dependent-key-overlay', overlay, true],
  ['invalid-reference', { ...v2, lesson: v2.lesson.replace('{constant: mask}', '{constant: absent}') }, false],
  ['invalid-declaration', { ...v1, lesson: v1.lesson.replace('version: 1', 'version: 99') }, false],
  ['invalid-default-comparison', { ...genericComparisonDocuments, lesson: genericComparisonDocuments.lesson.replace('kind: generic', 'kind: avalanche\n        sources: [data]') }, false],
  ['failed-generic-execution', { ...genericComparisonDocuments, lesson: stringify(failedComparison) }, false],
  ['invalid-dependent-overlay', { ...overlay, lesson: stringify(invalidOverlay, { aliasDuplicateObjects: false }) }, false],
] as const)('matches the shared Lesson report for %s', (name, documents, ok) => {
  const directory = join(temporary, name)
  mkdirSync(join(directory, 'locales'), { recursive: true })
  writeFileSync(join(directory, 'lesson.yaml'), documents.lesson)
  for (const [locale, source] of Object.entries(documents.locales)) writeFileSync(join(directory, 'locales', `${locale}.yaml`), source)
  const shared = validateLessonDocuments(documents, visualizerCatalog)
  expect(shared.ok).toBe(ok)
  expect(invoke('lesson', directory)).toEqual({ status: ok ? 0 : 1, report: shared })
  if (name === 'wrong-answer') expect(shared.dryRun?.steps).toContainEqual({ id: 'calculate', check: { kind: 'equal', matched: false } })
  if (name === 'v1') {
    expect(shared.notices.map(({ code }) => code)).toContain('lesson.schema-v1-deprecated')
    expect(shared.dryRun?.steps).toContainEqual({ id: 'identify-operation', check: { kind: 'choice' } })
  }
  if (name === 'accepted-error') expect(shared.dryRun?.steps[0]).toMatchObject({ execution: 'accepted-error', diagnostics: [{ code: 'operation-failed' }] })
  if (name === 'invalid-default-comparison' || name === 'invalid-dependent-overlay') {
    expect(compileLesson(documents, visualizerCatalog).ok).toBe(true)
    expect(shared.diagnostics[0].code).toBe('lesson.invalid-avalanche')
  }
  if (name === 'invalid-declaration') expect(shared.diagnostics[0].span).toEqual({ file: 'lesson.yaml', line: 1, column: 10 })
  if (name === 'failed-generic-execution') {
    expect(compileLesson(documents, visualizerCatalog).ok).toBe(true)
    expect(shared.diagnostics[0].code).toBe('operation-failed')
  }
})

it.each([
  ['valid', '# Lab\n\n$x^2$\n\n```python\nprint("Lab")\n```\n\n::: success Notes\n\n$$\nx+y\n$$\n\n:::\n', true],
  ['tolerated', '$x\n\n<script>escaped</script>\n\n[HTTP](http://example.test) [Relative](../lab.md)', true],
  ['invalid-math', '$\\unknowncommand{x}$', false],
  ['collapsed-invalid-math', '::: warning Check\n\n$\\unknowncommand{x}$\n\n:::\n', false],
  ['nested-invalid-math', '::: warning Outer\n\n::: success Inner\n\n$\\unknowncommand{x}$\n\n:::\n\n:::\n', false],
  ['parser-error', '::: warning Title\nUnclosed\n', false],
  ['renderer-error', '::: unsupported Title\nText\n:::\n', false],
] as const)('matches the shared Lab report for %s', (name, source, ok) => {
  const file = join(temporary, `${name}.md`)
  writeFileSync(file, source)
  const shared = validateLabMarkdown(source, file)
  expect(shared.ok).toBe(ok)
  expect(invoke('lab', file)).toEqual({ status: ok ? 0 : 1, report: shared })
  if (name === 'invalid-math') expect(shared.diagnostics[0].span).toEqual({ file, line: 1, column: 1 })
  if (name === 'collapsed-invalid-math' || name === 'nested-invalid-math') {
    expect(shared.diagnostics).toHaveLength(1)
    expect(shared.diagnostics[0]).toMatchObject({ code: 'lab.invalid-math', details: { file } })
    expect(shared.diagnostics[0].span).toBeUndefined()
  }
})

it.each([[], ['unknown'], ['lesson'], ['lab', 'missing.md'], ['lesson', 'missing'], ['lab', 'a', 'b']])('reports invalid input for %j', (...args) => {
  expect(invoke(...args)).toMatchObject({ status: 1, report: { ok: false, diagnostics: [{ code: 'validator.invalid-input' }] } })
})
