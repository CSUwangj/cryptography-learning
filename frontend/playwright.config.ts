import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4177',
    headless: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  },
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
