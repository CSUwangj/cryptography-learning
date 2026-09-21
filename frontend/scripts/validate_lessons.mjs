import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from 'vite'

const root = process.argv[2]

if (!root) {
  process.stdout.write(`${JSON.stringify({ ok: false, diagnostics: [{ code: 'lesson.invalid-input', message: 'Lesson root is required.', path: '', details: {} }] })}\n`)
  process.exitCode = 1
} else {
  try {
    const localeDirectory = join(root, 'locales')
    const localeNames = (await readdir(localeDirectory)).filter((name) => name.endsWith('.yaml')).sort()
    const locales = Object.fromEntries(await Promise.all(localeNames.map(async (name) =>
      [name.slice(0, -'.yaml'.length), await readFile(join(localeDirectory, name), 'utf8')],
    )))
    const documents = { lesson: await readFile(join(root, 'lesson.yaml'), 'utf8'), locales }
    const server = await createServer({
      configFile: false,
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
      appType: 'custom',
    })
    const { validateLessonDocuments } = await server.ssrLoadModule('/src/lesson_runtime/index.ts')
    const report = validateLessonDocuments(documents)
    await server.close()
    process.stdout.write(`${JSON.stringify(report)}\n`)
    if (!report.ok) process.exitCode = 1
  } catch {
    process.stdout.write(`${JSON.stringify({ ok: false, diagnostics: [{ code: 'lesson.invalid-input', message: 'Lesson files could not be read.', path: '', details: {} }] })}\n`)
    process.exitCode = 1
  }
}
