// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('checks authored JS/TS without writes and fixes only through lint:fix', () => {
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
    const lint = (script: 'lint' | 'lint:fix') => spawnSync('npm', ['run', script], { cwd: directory, encoding: 'utf8' })
    const valid = lint('lint')
    expect(valid.status, valid.stdout + valid.stderr).toBe(0)

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
