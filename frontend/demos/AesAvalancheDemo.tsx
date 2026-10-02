import React, { useEffect, useState } from 'react'
import type { AvalancheComparison } from '../src/crypto_graph'
import { createBrowserLessonSession } from '../src/lesson_runtime'
import { RenderHost, visualizerCatalog } from '../src/visualizers'
import { aesCipherComparisonDocuments } from './aesCipherComparisonLesson'

type Locale = 'en-US' | 'zh-CN'
type Variant = 128 | 192 | 256

const scenarios = ['compare-plaintext', 'compare-key', 'compare-ciphertext', 'compare-decrypt-key'] as const
type Scenario = typeof scenarios[number]

const copy = {
  'en-US': {
    title: 'AES avalanche demo',
    variant: 'Variant',
    scenario: 'Scenario',
    running: 'Comparing…',
    failure: 'Could not run this comparison.',
    scenarios: {
      'compare-plaintext': 'Encryption: flip plaintext bit 0',
      'compare-key': 'Encryption: flip round key 0 bit 0',
      'compare-ciphertext': 'Decryption: flip ciphertext bit 0',
      'compare-decrypt-key': 'Decryption: flip round key 0 bit 0',
    },
  },
  'zh-CN': {
    title: 'AES 雪崩演示',
    variant: '变体',
    scenario: '场景',
    running: '比较中…',
    failure: '无法运行此比较。',
    scenarios: {
      'compare-plaintext': '加密：翻转明文第 0 位',
      'compare-key': '加密：翻转第 0 轮轮密钥第 0 位',
      'compare-ciphertext': '解密：翻转密文第 0 位',
      'compare-decrypt-key': '解密：翻转第 0 轮轮密钥第 0 位',
    },
  },
} as const

export const AesAvalancheDemo: React.FC<{ readonly locale: Locale }> = ({ locale }) => {
  const text = copy[locale]
  const [variant, setVariant] = useState<Variant>(128)
  const [scenario, setScenario] = useState<Scenario>('compare-plaintext')
  const [result, setResult] = useState<{ readonly comparison: AvalancheComparison; readonly identity: string }>()
  const [failure, setFailure] = useState<string>()

  useEffect(() => {
    setResult(undefined)
    setFailure(undefined)
    const created = createBrowserLessonSession(aesCipherComparisonDocuments(variant), locale, visualizerCatalog)
    if (!created.ok) {
      setFailure(created.diagnostics[0]?.message ?? text.failure)
      return
    }
    const session = created.value
    let active = true
    void (async () => {
      let state = await session.enter()
      for (let step = 0; step < scenarios.indexOf(scenario) && state.ok; step += 1) state = await session.next()
      if (!active) return
      const comparison = state.ok ? state.value.comparisons[scenario] : undefined
      if (comparison && state.ok) setResult({ comparison, identity: state.value.executionIdentities[scenario] ?? scenario })
      else setFailure((state.ok ? Object.values(state.value.executionDiagnostics)[0]?.message : state.diagnostics[0]?.message) ?? text.failure)
    })()
    return () => {
      active = false
      session.dispose()
    }
  }, [variant, scenario, locale, text.failure])

  return <main style={{ margin: '0 auto', maxWidth: 1200, padding: 20 }}>
    <h1>{text.title}</h1>
    <label>{text.variant}{' '}
      <select value={variant} onChange={(event) => setVariant(Number(event.target.value) as Variant)}>
        <option value={128}>AES-128</option>
        <option value={192}>AES-192</option>
        <option value={256}>AES-256</option>
      </select>
    </label>{' '}
    <label>{text.scenario}{' '}
      <select value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)}>
        {scenarios.map((id) => <option key={id} value={id}>{text.scenarios[id]}</option>)}
      </select>
    </label>
    {failure && <p role="alert">{failure}</p>}
    {!failure && !result && <p role="status">{text.running}</p>}
    {result && <RenderHost
      comparison={result.comparison}
      dimensions={{ width: 1100, height: 700 }}
      executionIdentity={result.identity}
      invocation={{ id: 'avalanche@1' }}
      locale={locale}
      reducedMotion={window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false}
    />}
  </main>
}
