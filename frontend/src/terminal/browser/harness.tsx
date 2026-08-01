import React, { useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Terminal } from '../Terminal'

declare global {
  interface Window {
    __terminalHarness?: {
      getVisibleText: () => string
    outbound: string[]
    inbound: string[]
      resizeEvents: Array<{ cols: number; rows: number }>
      switchEndpoint: (nextUrl: string) => void
      socketCounts: { opened: number; closed: number }
    }
    __terminalHarnessRoot?: Root
  }
}

const params = new URLSearchParams(window.location.search)
const url = params.get('url')
if (!url) {
  throw new Error('terminal harness requires ?url=ws://...')
}

const outbound: string[] = []
const inbound: string[] = []
const resizeEvents: Array<{ cols: number; rows: number }> = []
const socketCounts = { opened: 0, closed: 0 }
const OriginalWebSocket = window.WebSocket

class RecordingWebSocket extends OriginalWebSocket {
  constructor(wsUrl: string, protocols?: string | string[]) {
    super(wsUrl, protocols)
    socketCounts.opened += 1
    this.addEventListener('close', () => {
      socketCounts.closed += 1
    })
    this.addEventListener('message', (event) => {
      const data = event.data
      if (typeof data === 'string') {
        inbound.push(data)
      } else if (data instanceof ArrayBuffer) {
        inbound.push(new TextDecoder().decode(data))
      }
    })
  }

  override send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (typeof data === 'string') {
      outbound.push(data)
    } else if (data instanceof ArrayBuffer) {
      outbound.push(new TextDecoder().decode(data))
    } else if (ArrayBuffer.isView(data)) {
      outbound.push(new TextDecoder().decode(data as ArrayBufferView))
    }
    super.send(data as string | Blob | BufferSource)
  }
}

window.WebSocket = RecordingWebSocket as unknown as typeof WebSocket

const Harness: React.FC = () => {
  const [endpoint, setEndpoint] = useState(url)
  return (
    <div style={{ width: 800, height: 400 }}>
      <Terminal
        url={endpoint}
        onSession={(session) => {
          window.__terminalHarness = {
            getVisibleText: session.getVisibleText,
            outbound,
            inbound,
            resizeEvents,
            switchEndpoint: setEndpoint,
            socketCounts,
          }
        }}
        onPtyResize={(dimensions) => {
          resizeEvents.push(dimensions)
        }}
      />
    </div>
  )
}

const mount = document.getElementById('root')
if (!mount) {
  throw new Error('missing #root')
}
const root = window.__terminalHarnessRoot ?? createRoot(mount)
window.__terminalHarnessRoot = root
root.render(
  params.has('strict') ? (
    <React.StrictMode>
      <Harness />
    </React.StrictMode>
  ) : (
    <Harness />
  ),
)
