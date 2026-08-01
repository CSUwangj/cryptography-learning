import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureScript = path.join(here, 'fixtures', 'browser_terminal_fixture.py')

async function startFixture(args: string[] = []): Promise<{
  url: string
  stop: () => Promise<void>
}> {
  const child: ChildProcessWithoutNullStreams = spawn(
    'python3',
    [fixtureScript, ...args],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('fixture start timeout')), 10_000)
    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk)
    })
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      const match = text.match(/listening on (ws:\/\/\S+)/)
      if (match) {
        clearTimeout(timer)
        resolve(match[1])
      }
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`fixture exited early: ${code}`))
    })
  })

  return {
    url,
    stop: async () => {
      child.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve())
        setTimeout(resolve, 1000)
      })
    },
  }
}

async function openHarness(page: Page, wsUrl: string) {
  await page.goto(`/terminal-harness.html?url=${encodeURIComponent(wsUrl)}`)
  await page.waitForFunction(() => {
    const probe = window.__terminalHarness
    return Boolean(probe && probe.inbound.some((frame) => frame.includes('BROWSER-CHALLENGE ready')))
  })
}

async function getHarness(page: Page) {
  return page.evaluate(() => {
    const probe = window.__terminalHarness
    if (!probe) {
      throw new Error('harness probe missing')
    }
    return {
      visible: probe.getVisibleText(),
      outbound: [...probe.outbound],
      inbound: [...probe.inbound],
      resizeEvents: [...probe.resizeEvents],
      socketCounts: { ...probe.socketCounts },
    }
  })
}

test.describe('Terminal browser acceptance (#17)', () => {
  test('input reaches the Challenge once and server output renders once', async ({ page }) => {
    const fixture = await startFixture()
    try {
      await openHarness(page, fixture.url)
      await page.locator('.xterm').click()
      await page.keyboard.type('ping-once')

      await page.waitForFunction(() =>
        window.__terminalHarness?.outbound.join('').includes('ping-once'),
      )
      await page.waitForFunction(() =>
        window.__terminalHarness?.inbound.join('').includes('ping-once'),
      )

      const state = await getHarness(page)
      expect(state.outbound.join('')).toContain('ping-once')
      expect(state.outbound.join('').split('ping-once').length - 1).toBe(1)
      expect(state.inbound.join('').split('ping-once').length - 1).toBe(1)
      expect(state.visible).toContain('BROWSER-CHALLENGE ready')
      expect(state.visible).toContain('ping-once')
      expect(state.visible.split('ping-once').length - 1).toBe(1)
    } finally {
      await fixture.stop()
    }
  })

  test('Ctrl+V uses native paste without Async Clipboard reads in the terminal module', async ({
    page,
  }) => {
    const fixture = await startFixture()
    try {
      await openHarness(page, fixture.url)

      await page.evaluate(async () => {
        const clipboard = navigator.clipboard
        const original = clipboard.readText.bind(clipboard)
        let calls = 0
        clipboard.readText = async () => {
          calls += 1
          return original()
        }
        ;(window as unknown as { __clipboardReadCalls?: number }).__clipboardReadCalls = 0
        Object.defineProperty(window, '__clipboardReadCalls', {
          get: () => calls,
          configurable: true,
        })
        await clipboard.writeText('paste-payload')
      })

      await page.locator('.xterm').click()
      await page.keyboard.press('Control+v')

      await page.waitForFunction(() =>
        window.__terminalHarness?.outbound.join('').includes('paste-payload'),
      )
      const state = await getHarness(page)
      expect(state.outbound.join('')).toContain('paste-payload')
      expect(state.outbound.join('').split('paste-payload').length - 1).toBe(1)
      const clipboardReads = await page.evaluate(() => {
        return (window as unknown as { __clipboardReadCalls: number }).__clipboardReadCalls
      })
      expect(clipboardReads).toBe(0)
    } finally {
      await fixture.stop()
    }
  })

  test('multiline paste follows bracketed-paste semantics from the Challenge', async ({ page }) => {
    const fixture = await startFixture(['--bracketed-paste'])
    try {
      await openHarness(page, fixture.url)
      await page.waitForFunction(() =>
        window.__terminalHarness?.inbound.some((frame) => frame.includes('\x1b[?2004h')),
      )

      await page.evaluate(async () => {
        await navigator.clipboard.writeText('line-one\nline-two')
      })
      await page.locator('.xterm').click()
      await page.keyboard.press('Control+v')

      await page.waitForFunction(() =>
        window.__terminalHarness?.outbound.some((frame) => frame.includes('line-one')),
      )
      const state = await getHarness(page)
      const pasted = state.outbound.find((frame) => frame.includes('line-one'))
      expect(pasted).toBeDefined()
      expect(pasted).toContain('\x1b[200~')
      // xterm normalizes pasted newlines to CR before onData.
      expect(pasted).toMatch(/line-one[\r\n]line-two/)
      expect(pasted).toContain('\x1b[201~')
    } finally {
      await fixture.stop()
    }
  })

  test('password/no-echo input is not locally rendered', async ({ page }) => {
    const fixture = await startFixture(['--no-echo'])
    try {
      await openHarness(page, fixture.url)
      await page.locator('.xterm').click()
      await page.keyboard.type('s3cret-password')

      await page.waitForFunction(() =>
        window.__terminalHarness?.outbound.join('').includes('s3cret-password'),
      )
      const state = await getHarness(page)
      expect(state.outbound.join('')).toContain('s3cret-password')
      expect(state.inbound.join('')).not.toContain('s3cret-password')
      expect(state.visible).not.toContain('s3cret-password')
      expect(state.visible).toContain('BROWSER-CHALLENGE ready')
    } finally {
      await fixture.stop()
    }
  })

  test('Ctrl+C and AltGr input reach the Challenge exactly once', async ({ page }) => {
    const fixture = await startFixture()
    try {
      await openHarness(page, fixture.url)
      await page.locator('.xterm').click()
      await page.keyboard.press('Control+c')
      await page.keyboard.down('Control')
      await page.keyboard.down('Alt')
      await page.keyboard.press('KeyQ')
      await page.keyboard.up('Alt')
      await page.keyboard.up('Control')

      await page.waitForFunction(() =>
        window.__terminalHarness?.outbound.some((frame) => frame.includes('\u0003')),
      )
      const state = await getHarness(page)
      expect(state.outbound.join('').split('\u0003').length - 1).toBe(1)
      // Chromium's US CI layout encodes the AltGr chord as ESC + Ctrl+Q. The
      // important protocol property is that the modified input reaches the
      // Challenge once, rather than being consumed by application shortcuts.
      expect(state.outbound.join('').split('\x1b\x11').length - 1).toBe(1)
    } finally {
      await fixture.stop()
    }
  })

  test('resizes and reconnects after a dropped Challenge connection', async ({ page }) => {
    const fixture = await startFixture(['--disconnect-on-input'])
    try {
      await openHarness(page, fixture.url)
      await page.locator('#terminal').evaluate((element) => {
        ;(element.parentElement as HTMLElement).style.width = '500px'
      })
      await page.waitForFunction(() => (window.__terminalHarness?.resizeEvents.length ?? 0) > 1)

      await page.locator('.xterm').click()
      await page.keyboard.type('drop-now')
      await expect(page.getByRole('status')).toContainText('Disconnected from Challenge')
      await page.getByRole('button', { name: 'Retry' }).click()
      await page.waitForFunction(() =>
        window.__terminalHarness?.inbound.filter((frame) => frame.includes('BROWSER-CHALLENGE ready')).length === 2,
      )
      const state = await getHarness(page)
      expect(state.outbound.join('').split('drop-now').length - 1).toBe(1)
      expect(state.resizeEvents.at(-1)?.cols).toBeGreaterThan(0)
      expect(state.resizeEvents.at(-1)?.rows).toBeGreaterThan(0)
    } finally {
      await fixture.stop()
    }
  })

  test('replaces a terminal endpoint and cleans up the old connection', async ({ page }) => {
    const first = await startFixture()
    const second = await startFixture()
    try {
      await openHarness(page, first.url)
      await page.evaluate((url) => window.__terminalHarness?.switchEndpoint(url), second.url)
      await page.waitForFunction(() => (window.__terminalHarness?.socketCounts.closed ?? 0) >= 1)
      await page.locator('.xterm').click()
      await page.keyboard.type('new-endpoint')
      await page.waitForFunction(() =>
        window.__terminalHarness?.inbound.join('').includes('new-endpoint'),
      )
      const state = await getHarness(page)
      expect(state.socketCounts.opened).toBe(2)
      expect(state.outbound.join('').split('new-endpoint').length - 1).toBe(1)
    } finally {
      await first.stop()
      await second.stop()
    }
  })

  test('Strict Mode mounts and unmounts a terminal session safely', async ({ page }) => {
    const fixture = await startFixture()
    try {
      await page.goto(`/terminal-harness.html?strict=1&url=${encodeURIComponent(fixture.url)}`)
      // Production React does not replay Strict Mode effects; the component's
      // unit test covers that development-only cycle. This candidate-image test
      // proves the Strict Mode tree mounts and its real unmount closes the socket.
      await page.waitForFunction(() => (window.__terminalHarness?.socketCounts.opened ?? 0) >= 1)
      await page.locator('.xterm').click()
      await page.keyboard.type('strict-once')
      await page.waitForFunction(() =>
        window.__terminalHarness?.inbound.join('').includes('strict-once'),
      )
      const state = await getHarness(page)
      expect(state.outbound.join('').split('strict-once').length - 1).toBe(1)
      await page.evaluate(() => window.__terminalHarnessRoot?.unmount())
      await page.waitForFunction(() => (window.__terminalHarness?.socketCounts.closed ?? 0) >= 1)
    } finally {
      await fixture.stop()
    }
  })
})
