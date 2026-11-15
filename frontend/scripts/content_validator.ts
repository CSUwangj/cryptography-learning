import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { validateLessonDocuments } from '../src/lesson_runtime'
import { validateLabMarkdown } from '../src/practice'
import { visualizerCatalog } from '../src/visualizers'

declare const __VALIDATOR_IDENTITY__: { readonly release: string, readonly node: string }

const main = async () => {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--version') return __VALIDATOR_IDENTITY__
  const [command, input] = args
  if (args.length !== 2 || !input || !['lesson', 'lab'].includes(command)) {
    return { ok: false, diagnostics: [{ code: 'validator.invalid-input', message: 'Use lesson DIRECTORY, lab FILE, or --version.', path: '', details: {} }] }
  }
  try {
    if (command === 'lab') return validateLabMarkdown(await readFile(input, 'utf8'), input)
    const directory = join(input, 'locales')
    const names = (await readdir(directory)).filter((name) => name.endsWith('.yaml')).sort()
    const locales = Object.fromEntries(await Promise.all(names.map(async (name) =>
      [name.slice(0, -'.yaml'.length), await readFile(join(directory, name), 'utf8')],
    )))
    return validateLessonDocuments({ lesson: await readFile(join(input, 'lesson.yaml'), 'utf8'), locales }, visualizerCatalog)
  } catch (error) {
    return { ok: false, diagnostics: [{ code: 'validator.invalid-input', message: error instanceof Error ? error.message : String(error), path: input, details: { file: input } }] }
  }
}

void main().then((report) => {
  process.stdout.write(`${JSON.stringify(report)}\n`)
  if ('ok' in report && !report.ok) process.exitCode = 1
})
