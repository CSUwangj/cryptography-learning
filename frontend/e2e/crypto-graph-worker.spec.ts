import { expect, test } from '@playwright/test'

test.describe('CryptoGraph Worker (#28)', () => {
  test('executes, cancels, compares, and marks truncated traces', async ({ page }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'imports the TypeScript source module served only by Vite')
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const graph = await import('/src/crypto_graph/index.ts')
      const fixture = (value: number[]) => ({
        nodes: [
          { id: 'input', operation: 'core.source@1', parameters: { type: { family: 'bits' as const, size: 16 }, value: graph.bits(16, Uint8Array.from(value)) } },
          { id: 'output', operation: 'core.output@1', inputs: { value: { node: 'input', port: 'value' } } },
        ],
        outputs: [{ node: 'output', port: 'value' }],
        traceLevel: 'summary' as const,
      })
      const client = new graph.CryptoGraphWorkerClient()
      const cancelled = client.execute({ requestId: 'cancelled', kind: 'execute', payload: { graph: fixture([0x0f, 0x0f]) } })
      cancelled.cancel()
      const NativeWorker = window.Worker
      let staleDelivered = false
      class DelayedWorker extends EventTarget {
        postMessage(request: { requestId: string }): void {
          window.setTimeout(() => {
            staleDelivered ||= request.requestId === 'stale'
            this.dispatchEvent(new MessageEvent('message', {
              data: request.requestId === 'stale'
                ? { requestId: 'stale', kind: 'diagnostic', diagnostics: [] }
                : { requestId: 'current', kind: 'snapshot', snapshot: { outputs: {}, trace: [], traceStatus: { truncated: false, retained: 0, dropped: 0 } } },
            }))
          }, request.requestId === 'stale' ? 0 : 10)
        }
        terminate(): void {}
      }
      Object.defineProperty(window, 'Worker', { configurable: true, value: DelayedWorker })
      const stale = client.execute({ requestId: 'stale', kind: 'execute', payload: { graph: fixture([0x0f, 0x0f]) } })
      const current = await client.execute({ requestId: 'current', kind: 'execute', payload: { graph: fixture([0x0f, 0x0f]) } }).result
      Object.defineProperty(window, 'Worker', { configurable: true, value: NativeWorker })
      const comparison = await client.execute({
        requestId: 'comparison',
        kind: 'compare',
        payload: {
          left: { graph: fixture([0x0f, 0x0f]) },
          right: { graph: fixture([0x00, 0xff]) },
        },
      }).result
      const execution = await client.execute({
        requestId: 'execution',
        kind: 'execute',
        payload: { graph: fixture([0x0f, 0x0f]) },
      }).result
      const cleanedUp = !client.running
      let timeoutWorkerTerminated = false
      class NeverRespondingWorker extends EventTarget {
        postMessage(): void {}
        terminate(): void {
          timeoutWorkerTerminated = true
        }
      }
      Object.defineProperty(window, 'Worker', { configurable: true, value: NeverRespondingWorker })
      const timedOut = await client.execute({
        requestId: 'timeout',
        kind: 'execute',
        payload: { graph: fixture([0x0f, 0x0f]), limits: { timeoutMs: 1 } },
      }).result
      Object.defineProperty(window, 'Worker', { configurable: true, value: NativeWorker })
      const cleanedUpAfterTimeout = !client.running
      const truncated = await client.execute({
        requestId: 'truncated',
        kind: 'execute',
        payload: { graph: { ...graph.teachingSpnGraph, traceLevel: 'detail' }, limits: { traceEvents: 1 } },
      }).result
      const cancelledResponse = await cancelled.result
      const staleResponse = await stale.result
      client.dispose()

      return {
        cancelled: cancelledResponse.kind,
        stale: staleResponse.kind,
        staleDelivered,
        current: current.kind,
        execution: execution.kind,
        cleanedUp,
        timeout: timedOut.kind === 'diagnostic' ? timedOut.diagnostics[0]?.code : timedOut.kind,
        timeoutWorkerTerminated,
        cleanedUpAfterTimeout,
        comparison: comparison.kind === 'comparison'
          ? comparison.comparison.checkpoints.map(({ path, mask, changedBits, ratio }) => ({ path, mask: graph.hex(mask), changedBits, ratio }))
          : comparison,
        traceStatus: truncated.kind === 'snapshot' ? truncated.snapshot.traceStatus : truncated,
      }
    })

    expect(result.cancelled).toBe('cancelled')
    expect(result.stale).toBe('cancelled')
    expect(result.staleDelivered).toBe(true)
    expect(result.current).toBe('snapshot')
    expect(result.execution).toBe('snapshot')
    expect(result.cleanedUp).toBe(true)
    expect(result.timeout).toBe('execution.timeout')
    expect(result.timeoutWorkerTerminated).toBe(true)
    expect(result.cleanedUpAfterTimeout).toBe(true)
    expect(result.comparison).toEqual([{ path: 'output', mask: '0x0ff0', changedBits: 8, ratio: 0.5 }])
    expect(result.traceStatus).toEqual({ truncated: true, retained: 1, dropped: 8 })
  })
})
