import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { bits, executeWorkerRequest, teachingSpnGraph, type AvalancheComparison, type WorkerResponse } from 'crypto_graph'
import { RenderHost } from '../../visualizers'

const copy = {
  'en-US': { title: 'Avalanche comparison prototype', baseline: 'Baseline plaintext', changed: 'Changed plaintext', run: 'Compare', failure: 'Could not compare these executions.' },
  'zh-CN': { title: '雪崩比较原型', baseline: '基准明文', changed: '改变后的明文', run: '比较', failure: '无法比较这两次执行。' },
} as const

const graphFor = (value: string) => ({
  ...teachingSpnGraph,
  nodes: teachingSpnGraph.nodes.map((node) => node.id === 'state'
    ? { ...node, parameters: { ...node.parameters, value: bits(16, Uint8Array.of(Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16))) } }
    : node),
})

const compare = (baseline: string, changed: string): AvalancheComparison | undefined => {
  const response: WorkerResponse = executeWorkerRequest({
    requestId: 'prototype',
    kind: 'compare',
    payload: {
      left: { graph: graphFor(baseline) },
      right: { graph: graphFor(changed) },
    },
  })
  return response.kind === 'comparison' ? response.comparison : undefined
}

export const AvalanchePrototype: React.FC = () => {
  const { i18n } = useTranslation()
  const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US'
  const text = copy[locale]
  const [baseline, setBaseline] = useState('0x1234')
  const [changed, setChanged] = useState('0x1235')
  const [comparison, setComparison] = useState(() => compare('0x1234', '0x1235'))
  const [execution, setExecution] = useState(0)

  return <main style={{ margin: '0 auto', maxWidth: 1200, padding: 20 }}>
    <h1>{text.title}</h1>
    <form onSubmit={(event) => {
      event.preventDefault()
      setComparison(compare(baseline, changed))
      setExecution((value) => value + 1)
    }}>
      <label>{text.baseline} <input pattern="0x[0-9a-fA-F]{4}" required value={baseline} onChange={(event) => setBaseline(event.target.value)} /></label>{' '}
      <label>{text.changed} <input pattern="0x[0-9a-fA-F]{4}" required value={changed} onChange={(event) => setChanged(event.target.value)} /></label>{' '}
      <button type="submit">{text.run}</button>
    </form>
    {comparison
      ? <RenderHost comparison={comparison} dimensions={{ width: 1100, height: 700 }} executionIdentity={String(execution)} invocation={{ id: 'avalanche@1' }} locale={locale} reducedMotion />
      : <p role="alert">{text.failure}</p>}
  </main>
}
