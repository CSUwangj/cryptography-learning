/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react({
      jsxImportSource: '@emotion/react',
      babel: {
        plugins: ['@emotion/babel-plugin'],
      },
    }),
  ],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: {
        app: path.resolve(rootDir, 'index.html'),
        terminalHarness: path.resolve(rootDir, 'terminal-harness.html'),
      },
    },
  },
  resolve: {
    alias: {
      app: path.resolve(rootDir, 'src/app'),
      practice: path.resolve(rootDir, 'src/practice'),
      terminal: path.resolve(rootDir, 'src/terminal'),
      transport: path.resolve(rootDir, 'src/transport'),
      ui: path.resolve(rootDir, 'src/ui'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/query': {
        target: 'http://localhost:8000',
        ws: true,
      },
      '/img': {
        target: 'http://localhost:8000',
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    passWithNoTests: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
})
