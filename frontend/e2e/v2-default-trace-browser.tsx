import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { bits, type WorkerRequest, type WorkerResponse, hex } from '../src/crypto_graph'
import { createBrowserLessonSession, type LessonDocuments } from '../src/lesson_runtime'
import { RenderHost } from '../src/visualizers'

const documents: LessonDocuments = {
  lesson: `version: 2
id: browser-v2-xor
default_locale: en-US
inputs:
  plaintext: {type: {family: bits, size: 16}, encoding: hex, default: "0x1234"}
constants:
  mask: {type: {family: bits, size: 16}, encoding: hex, value: "0x00ff"}
graphs:
  mix:
    nodes:
      - {id: state, operation: core.source@1, parameters: {type: {family: bits, size: 16}}, role: state, round: 0, unit: 8}
      - {id: mask, operation: core.source@1, parameters: {type: {family: bits, size: 16}}, role: round-key, round: 0, unit: 8}
      - {id: mixed, operation: core.xor@1, inputs: {left: {node: state, port: value}, right: {node: mask, port: value}}, role: state, round: 0, unit: 8}
      - {id: result, operation: core.output@1, inputs: {value: {node: mixed, port: value}}, role: state, round: 0, unit: 8}
    outputs: [{node: result, port: value}]
steps:
  - id: run
    execute:
      graph: mix
      bindings: {state.value: {input: plaintext}, mask.value: {constant: mask}}
`,
  locales: {
    'en-US': 'title: Browser V2 XOR\nsummary: Run a default trace.\ntexts: {}',
    'zh-CN': 'title: 浏览器 V2 异或\nsummary: 运行默认轨迹。\ntexts: {}',
  },
}

export const warmDefaultTraceBrowserWorker = async (): Promise<void> => {
  const worker = new Worker(new URL('../src/crypto_graph/worker.ts', import.meta.url), { type: 'module' })
  try {
    const request: WorkerRequest = {
      requestId: 'browser-v2-warmup',
      kind: 'execute',
      payload: {
        graph: {
          schema: 2,
          nodes: [
            { id: 'state', operation: 'core.source@1', parameters: { type: { family: 'bits', size: 8 }, value: bits(8, Uint8Array.of(0xa5)) } },
            { id: 'result', operation: 'core.output@1', inputs: { value: { node: 'state', port: 'value' } } },
          ],
          outputs: [{ node: 'result', port: 'value' }],
        },
      },
    }
    const response = await new Promise<WorkerResponse>((resolve, reject) => {
      worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => resolve(event.data), { once: true })
      worker.addEventListener('error', () => reject(new Error('The v2 Worker module failed to start.')), { once: true })
      worker.postMessage(request)
    })
    if (response.kind !== 'snapshot') throw new Error(`The v2 Worker warmup failed: ${response.kind === 'diagnostic' ? response.diagnostics[0]?.code ?? 'diagnostic' : response.kind}.`)
  } finally {
    worker.terminate()
  }
}

export const runDefaultTraceBrowserProbe = async (locale: 'en-US' | 'zh-CN'): Promise<{ output: string; trace: readonly string[]; text: string }> => {
  const created = createBrowserLessonSession(documents, locale)
  if (!created.ok) throw new Error(created.diagnostics[0]?.message)
  const result = await created.value.enter()
  if (!result.ok) throw new Error(result.diagnostics[0]?.message)
  const execution = result.value.snapshots.run
  if (!execution) {
    const diagnostic = result.value.executionDiagnostics.run
    throw new Error(`The v2 execution snapshot is missing: ${diagnostic ? `${diagnostic.code}: ${diagnostic.message}` : 'no execution diagnostic was recorded'}.`)
  }
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  flushSync(() => root.render(<RenderHost execution={execution} executionIdentity={`browser-v2-${locale}`} locale={locale} dimensions={{ width: 640, height: 320 }} reducedMotion />))
  const probe = {
    output: hex(execution.outputs['result.value'] as Parameters<typeof hex>[0]),
    trace: execution.trace.map((event) => event.path),
    text: element.textContent ?? '',
  }
  root.unmount()
  element.remove()
  created.value.dispose()
  return probe
}
