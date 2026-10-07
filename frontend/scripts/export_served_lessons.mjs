import { writeFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'vite'

const root = process.env.SERVED_LESSONS_ROOT
if (!root) throw new Error('SERVED_LESSONS_ROOT is required')
const server = await createServer({ logLevel: 'silent', optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true }, appType: 'custom' })
const { aesCipherDemoDocuments } = await server.ssrLoadModule('/demos/aes128CipherLesson.ts')
const { aes128CipherComparisonDocuments } = await server.ssrLoadModule('/demos/aesCipherComparisonLesson.ts')
const lessons = [aesCipherDemoDocuments(128), aes128CipherComparisonDocuments]
for (const documents of lessons) {
  const id = documents.lesson.match(/^id: (.+)$/m)?.[1]
  if (!id) throw new Error('Lesson id missing')
  mkdirSync(`${root}/${id}/locales`, { recursive: true })
  writeFileSync(`${root}/${id}/lesson.yaml`, documents.lesson)
  for (const [locale, source] of Object.entries(documents.locales)) writeFileSync(`${root}/${id}/locales/${locale}.yaml`, source)
}
await server.close()
