import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import base from './vite.config.mts'

export default mergeConfig(base, {
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'demos'),
  // Separate from the application's optimizer cache so both dev servers can run at once.
  cacheDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'node_modules/.vite-demos'),
  server: { host: '127.0.0.1' },
})
