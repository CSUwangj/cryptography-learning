import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Exercise the endpoints exported by the real Playwright webServer lifecycle.
test('owns distinct local application, demo, and artifact destinations', async ({ request, baseURL }) => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'served-image runs do not start local Vite servers')
  const demoURL = process.env.PLAYWRIGHT_DEMO_BASE_URL
  expect(demoURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  expect(demoURL).not.toBe(baseURL)
  const app = await request.get('/')
  const demo = await request.get(`${demoURL}/`)
  expect(app.ok()).toBe(true)
  expect(demo.ok()).toBe(true)
  expect(await app.text()).toContain('/src/index.tsx')
  expect(await demo.text()).toContain('/main.tsx')
})

test('keeps deferred browser probes stable across cold and cached server starts', async ({ browser }, testInfo) => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'requires the local Vite launcher')
  test.setTimeout(120_000)
  const frontend = fileURLToPath(new URL('../', import.meta.url))
  const directory = await mkdtemp(path.join(tmpdir(), 'playwright-deps-'))
  const config = path.join(directory, 'vite.config.mts')
  const seed = path.join(directory, 'seed.html')
  await symlink(path.join(frontend, 'node_modules'), path.join(directory, 'node_modules'), 'dir')
  await writeFile(seed, '<script type="module">import React from "react"; import { createRoot } from "react-dom/client";</script>')
  // Model a scan/cache that predates the browser-only probe's dependencies.
  await writeFile(config, `
import base from ${JSON.stringify(pathToFileURL(path.join(frontend, 'vite.config.mts')).href)}
export default {
  ...base,
  root: ${JSON.stringify(frontend)},
  cacheDir: ${JSON.stringify(path.join(directory, 'cache'))},
  optimizeDeps: { entries: [${JSON.stringify(seed)}] },
  server: { ...base.server, fs: { allow: [${JSON.stringify(frontend)}, ${JSON.stringify(directory)}] } },
}
`)
  try {
    for (const cache of ['cold', 'cached']) {
      const child = spawn(process.execPath, ['scripts/playwright-server.mjs', config, '0'], { cwd: frontend })
      let output = ''
      child.stderr.on('data', (chunk) => { output += chunk.toString() })
      const page = await browser.newPage()
      const reloads: string[] = []
      page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
        if (String(payload).includes('full-reload')) reloads.push(String(payload))
      }))
      try {
        const url = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`Server startup timed out.\n${output}`)), 30_000)
          child.once('error', (error) => { clearTimeout(timer); reject(error) })
          child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited with ${code}.\n${output}`)) })
          child.stdout.on('data', (chunk) => {
            output += chunk.toString()
            const match = output.match(/PLAYWRIGHT_SERVER_URL=(http:\/\/127\.0\.0\.1:\d+)/)
            if (match) { clearTimeout(timer); resolve(match[1]) }
          })
        })
        await page.goto(url, { waitUntil: 'networkidle' })
        const outputValue = await page.evaluate(async () => {
          const probe = await import('/e2e/v2-default-trace-browser.tsx')
          await probe.warmDefaultTraceBrowserWorker()
          return (await probe.runDefaultTraceBrowserProbe('en-US')).output
        })
        expect(outputValue).toBe('0x12cb')
        expect(reloads).toEqual([])
      } finally {
        await page.close()
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, 'exit')
          child.kill('SIGTERM')
          await exited
        }
        await testInfo.attach(`${cache}-server.log`, { body: output, contentType: 'text/plain' })
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
