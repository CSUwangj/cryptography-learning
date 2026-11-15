import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { build } from 'vite'

process.env.NODE_ENV = 'production'

const frontend = fileURLToPath(new URL('..', import.meta.url))
const identity = { release: 'web-v1.3.0', node: (await readFile(join(frontend, '.nvmrc'), 'utf8')).trim() }
const name = `cryptography-learning-validator-${identity.release}`
const output = join(frontend, 'dist', 'validator')
const directory = join(output, name)
await mkdir(directory, { recursive: true })
await build({
  root: frontend,
  define: { 'process.cwd': 'process.cwd', 'process.env.NODE_ENV': '"production"', __VALIDATOR_IDENTITY__: JSON.stringify(identity) },
  ssr: { noExternal: true },
  build: {
    ssr: 'scripts/content_validator.ts',
    outDir: directory,
    copyPublicDir: false,
    license: { fileName: 'dependency-licenses.md' },
    rollupOptions: {
      input: join(frontend, 'scripts/content_validator.ts'),
      output: { format: 'cjs', entryFileNames: 'validator.cjs', codeSplitting: false },
    },
  },
})
await writeFile(join(directory, 'identity.json'), `${JSON.stringify(identity, null, 2)}\n`)
await copyFile(join(frontend, '..', 'LICENSE'), join(directory, 'LICENSE'))
await copyFile(join(frontend, '..', 'docs', 'content-validator.md'), join(directory, 'README.md'))
execFileSync('tar', ['-czf', join(output, `${name}.tar.gz`), '-C', output, name])
process.stdout.write(`${join(output, `${name}.tar.gz`)}\n`)
