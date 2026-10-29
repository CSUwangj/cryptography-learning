import { useTranslation } from 'react-i18next'
import React, { useEffect, useState } from 'react'
import type { AvalancheComparison, Diagnostic } from '../src/crypto_graph'
import { lessonDiagnosticKeys, createBrowserLessonSession } from '../src/lesson_runtime'
import { RenderHost, visualizerCatalog } from '../src/visualizers'
import { aesCipherComparisonDocuments } from './aesCipherComparisonLesson'

type Variant = 128 | 192 | 256

const scenarios = ['compare-plaintext', 'compare-key', 'compare-ciphertext', 'compare-decrypt-key'] as const
type Scenario = typeof scenarios[number]

export const AesAvalancheDemo: React.FC = () => {
  const { t: runtimeT } = useTranslation('translations')
  const { t, i18n } = useTranslation('demos', { keyPrefix: 'aesAvalanche' })
  const [variant, setVariant] = useState<Variant>(128)
  const [scenario, setScenario] = useState<Scenario>('compare-plaintext')
  const [result, setResult] = useState<{ readonly comparison: AvalancheComparison; readonly identity: string }>()
  const [failure, setFailure] = useState<{ readonly diagnostic?: Diagnostic }>()

  useEffect(() => {
    // UI language changes relabel retained results; only computation changes start a session.
    const locale = i18n.resolvedLanguage ?? 'en-US'
    const sessionT = i18n.getFixedT(locale, 'translations')
    setResult(undefined)
    const created = createBrowserLessonSession(aesCipherComparisonDocuments(variant), locale, sessionT, visualizerCatalog)
    if (!created.ok) {
      setFailure({ diagnostic: created.diagnostics[0] })
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
      else setFailure({ diagnostic: state.ok ? Object.values(state.value.executionDiagnostics)[0] : state.diagnostics[0] })
    })()
    return () => {
      active = false
      session.dispose()
    }
  }, [variant, scenario])

  return <main style={{ margin: '0 auto', maxWidth: 1200, padding: 20 }}>
    <h1>{t('title')}</h1>
    <label>{t('variant')}{' '}
      <select value={variant} onChange={(event) => { setFailure(undefined); setVariant(Number(event.target.value) as Variant) }}>
        <option value={128}>AES-128</option>
        <option value={192}>AES-192</option>
        <option value={256}>AES-256</option>
      </select>
    </label>{' '}
    <label>{t('scenario')}{' '}
      <select value={scenario} onChange={(event) => { setFailure(undefined); setScenario(event.target.value as Scenario) }}>
        {scenarios.map((id) => <option key={id} value={id}>{t(`scenarios.${id}`)}</option>)}
      </select>
    </label>
    {failure && <p role="alert">{failure.diagnostic
      ? Object.hasOwn(lessonDiagnosticKeys, failure.diagnostic.code)
        ? runtimeT(lessonDiagnosticKeys[failure.diagnostic.code], { defaultValue: failure.diagnostic.message })
        : failure.diagnostic.message
      : t('failure')}</p>}
    {!failure && !result && <p role="status">{t('running')}</p>}
    {result && <RenderHost
      comparison={result.comparison}
      dimensions={{ width: 1100, height: 700 }}
      executionIdentity={result.identity}
      invocation={{ id: 'avalanche@1' }}
      reducedMotion={window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false}
    />}
  </main>
}
