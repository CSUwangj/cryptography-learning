import {
  maxWorkerLimits,
  type Diagnostic,
  type WorkerRequest,
  type WorkerResponse,
} from './index'

export type PendingWorkerRequest = {
  readonly result: Promise<WorkerResponse>
  cancel: () => void
}

type ActiveWorkerRequest = {
  readonly requestId: string
  settle: (response: WorkerResponse) => void
}

const workerDiagnostic = (requestId: string, code: string, message: string): WorkerResponse => ({
  requestId,
  kind: 'diagnostic',
  diagnostics: [{ code, message, path: 'request', details: {} } satisfies Diagnostic],
})

const timeoutFor = (request: WorkerRequest): number => {
  const limits = request.kind === 'compare'
    ? [request.payload.limits, request.payload.left.limits, request.payload.right.limits]
    : [request.payload.limits]
  return Math.min(
    maxWorkerLimits.timeoutMs,
    ...limits.flatMap((limit) => {
      const value = limit?.timeoutMs
      return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= maxWorkerLimits.timeoutMs ? [value] : []
    }),
  )
}

const isWorkerResponse = (value: unknown): value is WorkerResponse =>
  typeof value === 'object' && value !== null && 'requestId' in value && 'kind' in value

export class CryptoGraphWorkerClient {
  private active: ActiveWorkerRequest | undefined
  private worker: Worker | undefined

  get running(): boolean {
    return this.active !== undefined
  }

  private workerForRequests(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (!isWorkerResponse(event.data) || event.data.requestId !== this.active?.requestId) return
      this.active.settle(event.data)
    })
    worker.addEventListener('error', () => {
      if (this.worker !== worker) return
      const active = this.active
      this.worker = undefined
      worker.terminate()
      if (active) active.settle(workerDiagnostic(active.requestId, 'execution.worker-error', 'Worker execution failed.'))
    })
    this.worker = worker
    return worker
  }

  execute(request: WorkerRequest): PendingWorkerRequest {
    this.cancel()
    const requestId = request.requestId
    let settle: (response: WorkerResponse) => void = () => {}
    const result = new Promise<WorkerResponse>((resolve) => {
      settle = resolve
    })
    let message: WorkerRequest
    try {
      message = structuredClone(request)
    } catch {
      settle(workerDiagnostic(requestId, 'execution.invalid-request', 'Worker request is not structured-cloneable.'))
      return { result, cancel: () => {} }
    }

    const worker = this.workerForRequests()
    const active: ActiveWorkerRequest = {
      requestId,
      settle: (response) => {
        clearTimeout(timeout)
        if (this.active === active) this.active = undefined
        settle(structuredClone(response))
      },
    }
    const timeout = window.setTimeout(
      () => {
        active.settle(workerDiagnostic(requestId, 'execution.timeout', 'Worker execution timed out.'))
        if (this.worker === worker) {
          worker.terminate()
          this.worker = undefined
        }
      },
      timeoutFor(message),
    )
    this.active = active
    try {
      worker.postMessage(message)
    } catch {
      active.settle(workerDiagnostic(requestId, 'execution.invalid-request', 'Worker request is not structured-cloneable.'))
    }
    return {
      result,
      cancel: () => {
        if (this.active === active) active.settle({ requestId, kind: 'cancelled' })
      },
    }
  }

  cancel(): void {
    if (!this.active) return
    this.active.settle({ requestId: this.active.requestId, kind: 'cancelled' })
  }

  dispose(): void {
    this.cancel()
    this.worker?.terminate()
    this.worker = undefined
  }
}
