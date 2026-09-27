import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import base from './vite.config.mts'

export default mergeConfig(base, {
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'demos'),
  server: { host: '127.0.0.1' },
})
