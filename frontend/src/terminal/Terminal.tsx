import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { AttachAddon } from '@xterm/addon-attach'
import '@xterm/xterm/css/xterm.css'

export type TerminalProps = {
  /** Complete `ws:` / `wss:` Challenge URL. Preferred over host/port. */
  url?: string
  host?: string
  port?: number
  id?: string
  onExit?: () => void
  /** Render input locally for raw TCP Challenges that do not provide PTY echo. */
  localEcho?: boolean
  /** Called after a successful local fit when the caller’s protocol can apply PTY size. */
  onPtyResize?: (dimensions: { cols: number; rows: number }) => void
}

type TerminalViewProps = TerminalProps & {
  /** Harness-only session probe; not part of the public module contract. */
  onSession?: (session: { getVisibleText: () => string }) => void
}

function resolveChallengeWsUrl(
  input: { url?: string; host?: string; port?: number },
  pageProtocol: string,
): string {
  if (input.url !== undefined) {
    if (!/^wss?:\/\//i.test(input.url)) {
      throw new Error('Terminal URL must be a complete ws: or wss: URL')
    }
    return input.url
  }
  if (input.host === undefined || input.port === undefined) {
    throw new Error('Terminal requires a complete ws/wss URL or host and port')
  }
  const scheme = pageProtocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${input.host}:${input.port}`
}

function shouldReleaseNativePaste(event: KeyboardEvent): boolean {
  if (event.type !== 'keydown') {
    return false
  }
  if (event.altKey) {
    return false
  }
  if (!(event.ctrlKey || event.metaKey)) {
    return false
  }
  return event.key === 'v' || event.key === 'V'
}

function renderLocalEcho(
  data: string,
  currentInputLength: number,
): { output: string; inputLength: number } {
  const input = data
    .replaceAll('\x1b[200~', '')
    .replaceAll('\x1b[201~', '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replaceAll('\r\n', '\n')
  let output = ''
  let inputLength = currentInputLength

  for (const character of input) {
    if (character === '\r' || character === '\n') {
      output += '\r\n'
      inputLength = 0
    } else if (character === '\b' || character === '\u007f') {
      if (inputLength > 0) {
        output += '\b \b'
        inputLength -= 1
      }
    } else if (character === '\t' || character >= ' ') {
      output += character
      inputLength += 1
    }
  }

  return { output, inputLength }
}

type ConnectionStatus = 'connecting' | 'open' | 'closed'

export const Terminal: React.FC<TerminalViewProps> = ({
  url,
  host,
  port,
  id,
  onExit,
  localEcho = false,
  onPtyResize,
  onSession,
}) => {
  const [reconnectNonce, setReconnectNonce] = useState(0)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const containerRef = useRef<HTMLDivElement>(null)
  const onPtyResizeRef = useRef(onPtyResize)
  onPtyResizeRef.current = onPtyResize
  const onSessionRef = useRef(onSession)
  onSessionRef.current = onSession

  const wsUrl = useMemo(
    () => resolveChallengeWsUrl({ url, host, port }, window.location.protocol),
    [url, host, port],
  )

  const retry = useCallback(() => {
    setStatus('connecting')
    setReconnectNonce((value) => value + 1)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    setStatus('connecting')

    const xterm = new XTerm({
      cursorBlink: true,
      scrollback: 1000,
      tabStopWidth: 8,
      convertEol: true,
    })
    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)
    xterm.open(container)
    onSessionRef.current?.({
      getVisibleText: () => {
        const buffer = xterm.buffer.active
        const lines: string[] = []
        for (let i = 0; i < buffer.length; i += 1) {
          lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
        }
        return lines.join('\n').trimEnd()
      },
    })

    xterm.attachCustomKeyEventHandler((event) => {
      if (shouldReleaseNativePaste(event)) {
        return false
      }
      return true
    })
    let localEchoInputLength = 0
    const localEchoSubscription = localEcho
      ? xterm.onData((data) => {
          const rendered = renderLocalEcho(data, localEchoInputLength)
          localEchoInputLength = rendered.inputLength
          if (rendered.output) {
            xterm.write(rendered.output)
          }
        })
      : undefined

    const socket = new WebSocket(wsUrl)
    socket.binaryType = 'arraybuffer'
    let attachAddon: AttachAddon | undefined
    let disposed = false
    let fitFrame = 0
    let lastCols = 0
    let lastRows = 0

    const reportDimensions = () => {
      if (disposed) {
        return
      }
      if (xterm.cols === lastCols && xterm.rows === lastRows) {
        return
      }
      lastCols = xterm.cols
      lastRows = xterm.rows
      onPtyResizeRef.current?.({ cols: xterm.cols, rows: xterm.rows })
    }

    const scheduleFit = () => {
      if (fitFrame !== 0) {
        cancelAnimationFrame(fitFrame)
      }
      fitFrame = requestAnimationFrame(() => {
        fitFrame = 0
        if (disposed) {
          return
        }
        fitAddon.fit()
        reportDimensions()
      })
    }

    const observer = new ResizeObserver(() => {
      scheduleFit()
    })
    observer.observe(container)
    scheduleFit()

    socket.onopen = () => {
      if (disposed) {
        return
      }
      attachAddon = new AttachAddon(socket)
      xterm.loadAddon(attachAddon)
      setStatus('open')
      scheduleFit()
    }

    socket.onclose = () => {
      if (disposed) {
        return
      }
      xterm.options.disableStdin = true
      setStatus('closed')
    }

    socket.onerror = () => {
      // Closure follows through onclose; keep status transitions there.
    }

    return () => {
      disposed = true
      if (fitFrame !== 0) {
        cancelAnimationFrame(fitFrame)
      }
      observer.disconnect()
      localEchoSubscription?.dispose()
      attachAddon?.dispose()
      fitAddon.dispose()
      if (
        socket.readyState === WebSocket.CONNECTING ||
        socket.readyState === WebSocket.OPEN
      ) {
        socket.close()
      }
      socket.onopen = null
      socket.onclose = null
      socket.onerror = null
      socket.onmessage = null
      xterm.dispose()
    }
  }, [wsUrl, reconnectNonce, localEcho])

  return (
    <div>
      <div ref={containerRef} id={id ?? 'terminal'} />
      {status === 'closed' ? (
        <div role="status" aria-live="polite">
          <p>Disconnected from Challenge</p>
          <button type="button" onClick={retry}>
            Retry
          </button>
          {onExit ? (
            <button type="button" onClick={onExit}>
              Exit
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
