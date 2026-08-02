import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type Handler = ((ev: Event) => void) | null

const {
  terminalInstances,
  fitAddons,
  attachAddons,
  customKeyHandlers,
  dataHandlers,
  dataSubscriptions,
  MockTerminal,
  MockFitAddon,
  MockAttachAddon,
} = vi.hoisted(() => {
  const customKeyHandlers: Array<(event: KeyboardEvent) => boolean> = []
  const dataHandlers: Array<(data: string) => void> = []
  const dataSubscriptions: Array<{ dispose: ReturnType<typeof vi.fn> }> = []
  const terminalInstances: Array<{
    options: { disableStdin: boolean }
    cols: number
    rows: number
    write: ReturnType<typeof vi.fn>
    writeln: ReturnType<typeof vi.fn>
    open: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    loadAddon: ReturnType<typeof vi.fn>
    attachCustomKeyEventHandler: ReturnType<typeof vi.fn>
    onData: ReturnType<typeof vi.fn>
    onKey: ReturnType<typeof vi.fn>
    onResize: ReturnType<typeof vi.fn>
  }> = []
  const fitAddons: Array<{ fit: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }> = []
  const attachAddons: Array<{ socket: unknown; dispose: ReturnType<typeof vi.fn> }> = []

  class MockTerminal {
    options = { disableStdin: false }
    cols = 80
    rows = 24
    write = vi.fn()
    writeln = vi.fn()
    open = vi.fn()
    focus = vi.fn()
    dispose = vi.fn()
    loadAddon = vi.fn()
    attachCustomKeyEventHandler = vi.fn((handler: (event: KeyboardEvent) => boolean) => {
      customKeyHandlers.push(handler)
    })
    onData = vi.fn((handler: (data: string) => void) => {
      dataHandlers.push(handler)
      const subscription = { dispose: vi.fn() }
      dataSubscriptions.push(subscription)
      return subscription
    })
    onKey = vi.fn(() => ({ dispose: vi.fn() }))
    onResize = vi.fn(() => ({ dispose: vi.fn() }))

    constructor() {
      terminalInstances.push(this)
    }
  }

  class MockFitAddon {
    fit = vi.fn(() => {
      const term = terminalInstances[terminalInstances.length - 1]
      if (term) {
        term.cols = 100
        term.rows = 40
      }
    })
    dispose = vi.fn()
    proposeDimensions = vi.fn(() => ({ cols: 100, rows: 40 }))
  }

  class MockAttachAddon {
    dispose = vi.fn()
    constructor(public socket: unknown) {
      attachAddons.push(this)
    }
  }

  return {
    terminalInstances,
    fitAddons,
    attachAddons,
    customKeyHandlers,
    dataHandlers,
    dataSubscriptions,
    MockTerminal,
    MockFitAddon,
    MockAttachAddon,
  }
})

vi.mock('@xterm/xterm', () => ({
  Terminal: MockTerminal,
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: MockFitAddon,
}))

vi.mock('@xterm/addon-attach', () => ({
  AttachAddon: MockAttachAddon,
}))

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  readyState = MockWebSocket.CONNECTING
  binaryType = 'blob'
  onopen: Handler = null
  onclose: Handler = null
  onerror: Handler = null
  onmessage: Handler = null
  close = vi.fn(() => {
    if (this.readyState === MockWebSocket.CLOSED) {
      return
    }
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close'))
  })

  constructor(public url: string) {
    MockWebSocket.instances.push(this)
  }

  open() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  disconnect() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close'))
  }
}

class MockResizeObserver {
  static instances: MockResizeObserver[] = []
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
  constructor(public callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this)
  }
}

const packageJson = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'), 'utf8'),
) as { dependencies: Record<string, string> }

import { Terminal } from './Terminal'

describe('Terminal module (#17)', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    MockResizeObserver.instances = []
    terminalInstances.length = 0
    fitAddons.length = 0
    attachAddons.length = 0
    customKeyHandlers.length = 0
    dataHandlers.length = 0
    dataSubscriptions.length = 0
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    vi.stubGlobal('location', { ...window.location, protocol: 'http:' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('depends on scoped @xterm packages instead of legacy xterm', () => {
    expect(packageJson.dependencies['@xterm/xterm']).toMatch(/^(\^|~)?6\./)
    expect(packageJson.dependencies['@xterm/addon-attach']).toBeDefined()
    expect(packageJson.dependencies['@xterm/addon-fit']).toBeDefined()
    expect(packageJson.dependencies.xterm).toBeUndefined()
    expect(packageJson.dependencies['xterm-addon-attach']).toBeUndefined()
    expect(packageJson.dependencies['xterm-addon-fit']).toBeUndefined()
  })

  it('derives a complete ws URL from host/port without hard-coding the scheme', async () => {
    vi.stubGlobal('location', { protocol: 'https:' })
    render(<Terminal host="challenge.example" port={9000} />)

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1)
    })
    expect(MockWebSocket.instances[0].url).toBe('wss://challenge.example:9000')
  })

  it('accepts a complete ws/wss URL as the connection endpoint', async () => {
    render(<Terminal url="wss://lab.example:9443/challenge" />)

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1)
    })
    expect(MockWebSocket.instances[0].url).toBe('wss://lab.example:9443/challenge')
  })

  it('attaches exactly one AttachAddon and never locally echoes input or mirrors socket messages', async () => {
    render(<Terminal host="127.0.0.1" port={19020} />)
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))

    act(() => {
      MockWebSocket.instances[0].open()
    })

    expect(attachAddons).toHaveLength(1)
    expect(attachAddons[0].socket).toBe(MockWebSocket.instances[0])
    expect(MockWebSocket.instances[0].onmessage).toBeNull()

    const term = terminalInstances[0]
    expect(term.onData).not.toHaveBeenCalled()
    expect(term.onKey).not.toHaveBeenCalled()
    expect(term.write).not.toHaveBeenCalled()
  })

  it('releases Ctrl+V and Cmd+V to native paste without reading the Async Clipboard API', async () => {
    const readText = vi.fn()
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { readText },
    })

    render(<Terminal host="127.0.0.1" port={19020} />)
    await waitFor(() => expect(customKeyHandlers).toHaveLength(1))

    const handler = customKeyHandlers[0]
    expect(
      handler(
        new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }),
      ),
    ).toBe(false)
    expect(
      handler(
        new KeyboardEvent('keydown', { key: 'v', metaKey: true }),
      ),
    ).toBe(false)
    expect(
      handler(
        new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, altKey: true }),
      ),
    ).toBe(true)
    expect(
      handler(
        new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }),
      ),
    ).toBe(true)
    expect(readText).not.toHaveBeenCalled()
  })

  it('locally renders input for raw TCP Challenges when local echo is enabled', async () => {
    const { unmount } = render(
      <Terminal host="127.0.0.1" port={19020} localEcho />,
    )
    await waitFor(() => expect(dataHandlers).toHaveLength(1))

    act(() => {
      dataHandlers[0]('pasted command\rnext')
      dataHandlers[0]('\u007f\u007f\u007f\u007f\u007f')
    })

    expect(terminalInstances[0].write).toHaveBeenNthCalledWith(1, 'pasted command\r\nnext')
    expect(terminalInstances[0].write).toHaveBeenNthCalledWith(2, '\b \b\b \b\b \b\b \b')

    unmount()
    expect(dataSubscriptions[0].dispose).toHaveBeenCalledTimes(1)
  })

  it('fits from observed container size and reports changed PTY dimensions', async () => {
    const onPtyResize = vi.fn()
    render(<Terminal host="127.0.0.1" port={19020} onPtyResize={onPtyResize} />)

    await waitFor(() => expect(MockResizeObserver.instances).toHaveLength(1))
    expect(MockResizeObserver.instances[0].observe).toHaveBeenCalled()

    act(() => {
      MockResizeObserver.instances[0].callback(
        [{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry],
        MockResizeObserver.instances[0] as unknown as ResizeObserver,
      )
    })

    await waitFor(() => {
      expect(onPtyResize).toHaveBeenCalledWith({ cols: 100, rows: 40 })
    })
  })

  it('closes the socket, observer, and terminal on unmount', async () => {
    const { unmount } = render(<Terminal host="127.0.0.1" port={19020} />)
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    const socket = MockWebSocket.instances[0]
    const observer = MockResizeObserver.instances[0]
    const term = terminalInstances[0]

    unmount()

    expect(socket.close).toHaveBeenCalled()
    expect(observer.disconnect).toHaveBeenCalled()
    expect(term.dispose).toHaveBeenCalled()
  })

  it('replaces the previous connection when the endpoint changes', async () => {
    const { rerender } = render(<Terminal host="127.0.0.1" port={19020} />)
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    const first = MockWebSocket.instances[0]

    rerender(<Terminal host="127.0.0.1" port={19021} />)
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2))

    expect(first.close).toHaveBeenCalled()
    expect(MockWebSocket.instances[1].url).toBe('ws://127.0.0.1:19021')
  })

  it('survives Strict Mode setup-cleanup-setup with exactly one live socket', async () => {
    render(
      <React.StrictMode>
        <Terminal host="127.0.0.1" port={19020} />
      </React.StrictMode>,
    )

    await waitFor(() => {
      const openSockets = MockWebSocket.instances.filter(
        (socket) => socket.readyState !== MockWebSocket.CLOSED && !socket.close.mock.calls.length,
      )
      // After Strict Mode remount, prior sockets are closed; one live remains.
      const live = MockWebSocket.instances.filter((socket) => !socket.close.mock.calls.length)
      expect(live).toHaveLength(1)
      expect(openSockets.length).toBeLessThanOrEqual(1)
    })
  })

  it('exposes keyboard-accessible retry and exit controls after disconnect without terminal key listeners', async () => {
    const onExit = vi.fn()
    const user = userEvent.setup()
    render(<Terminal host="127.0.0.1" port={19020} onExit={onExit} />)
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))

    act(() => {
      MockWebSocket.instances[0].open()
    })
    act(() => {
      MockWebSocket.instances[0].disconnect()
    })

    const retry = await screen.findByRole('button', { name: /retry/i })
    const exit = screen.getByRole('button', { name: /exit/i })
    expect(terminalInstances[0].onKey).not.toHaveBeenCalled()

    await user.click(retry)
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(1)
    })

    act(() => {
      MockWebSocket.instances[MockWebSocket.instances.length - 1].disconnect()
    })
    await screen.findByRole('button', { name: /exit/i })
    await user.click(screen.getByRole('button', { name: /exit/i }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })
})
