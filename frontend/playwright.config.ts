import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  // A GitHub-hosted runner can transiently replace its network while a
  // container restarts. Retry once in CI so a one-off ERR_NETWORK_CHANGED
  // asset fetch cannot reject an otherwise verified release candidate.
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4177',
    // The macOS native-compatibility workflow selects Playwright's branded
    // stable Google Chrome channel. Other runs retain bundled Chromium.
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  outputDir: process.env.PLAYWRIGHT_ARTIFACT_DIR ?? 'test-results',
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'npx vite --host 127.0.0.1 --port 4177',
          port: 4177,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
})
