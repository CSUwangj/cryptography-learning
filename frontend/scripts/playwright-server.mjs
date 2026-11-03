import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const server = await createServer({
  configFile: process.argv[2],
  optimizeDeps: {
    // Deferred browser probes must participate in the initial scan for either root.
    entries: ['*.html', fileURLToPath(new URL('../e2e/*.tsx', import.meta.url))],
    force: true,
  },
  server: { host: '127.0.0.1', strictPort: true },
})
// Vite's CLI treats port 0 as its default; Node binds 0 atomically instead.
server.httpServer.once('error', (error) => { console.error(error); process.exit(1) })
server.httpServer.listen(Number(process.argv[3]), '127.0.0.1', () => {
  console.log(`PLAYWRIGHT_SERVER_URL=http://127.0.0.1:${server.httpServer.address().port}`)
})
