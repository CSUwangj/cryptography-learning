import { randomUUID } from 'node:crypto'
import { defineConfig } from '@playwright/test'

const localPort = process.env.PLAYWRIGHT_LOCAL_PORT === undefined ? 0 : Number(process.env.PLAYWRIGHT_LOCAL_PORT)
if (!process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_LOCAL_PORT !== undefined &&
    (!Number.isInteger(localPort) || localPort < 1 || localPort > 65534)) {
  throw new Error('PLAYWRIGHT_LOCAL_PORT must be an integer from 1 to 65534 (the demo uses the next port).')
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  // A GitHub-hosted runner can transiently replace its network while a
  // container restarts. Retry once in CI so a one-off ERR_NETWORK_CHANGED
  // asset fetch cannot reject an otherwise verified release candidate.
  retries: process.env.CI ? 1 : 0,
  use: {
    // Local runs inherit the URL captured by Playwright from their owned server.
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    // The macOS native-compatibility workflow selects Playwright's branded
    // stable Google Chrome channel. Other runs retain bundled Chromium.
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  outputDir: process.env.PLAYWRIGHT_ARTIFACT_DIR ?? (process.env.PLAYWRIGHT_BASE_URL ? 'test-results' : `test-results/run-${randomUUID()}`),
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: [
          {
            command: `node scripts/playwright-server.mjs vite.config.mts ${localPort}`,
            wait: { stdout: /PLAYWRIGHT_SERVER_URL=(?<playwright_test_base_url>http:\/\/127\.0\.0\.1:\d+)/ },
            reuseExistingServer: false,
            timeout: 120_000,
          },
          {
            command: `node scripts/playwright-server.mjs vite.demos.config.mts ${localPort ? localPort + 1 : 0}`,
            wait: { stdout: /PLAYWRIGHT_SERVER_URL=(?<playwright_demo_base_url>http:\/\/127\.0\.0\.1:\d+)/ },
            reuseExistingServer: false,
            timeout: 120_000,
          },
        ],
      }),
})
