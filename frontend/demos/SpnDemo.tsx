import { useTranslation } from 'react-i18next'
import React, { useEffect, useRef, useState } from 'react'
import type { Diagnostic } from '../src/crypto_graph'
import { lessonDiagnosticCodes, createBrowserLessonSession, type BrowserLessonSession, type LessonSessionState } from '../src/lesson_runtime'
import { RenderHost, visualizerCatalog } from '../src/visualizers'
import { teachingSpnDemoDocuments } from './teachingSpnLesson'

export const SpnDemo: React.FC = () => {
  const { t: runtimeT } = useTranslation('translations')
  const { t, i18n } = useTranslation('demos', { keyPrefix: 'spn' })
  const [plaintext, setPlaintext] = useState('0x1234')
  const [state, setState] = useState<LessonSessionState>()
  const [failure, setFailure] = useState<{ readonly diagnostic?: Diagnostic }>()
  const session = useRef<BrowserLessonSession | undefined>(undefined)

  useEffect(() => {
    // UI language changes relabel retained results; only computation changes start a session.
    const locale = i18n.resolvedLanguage ?? 'en-US'
    const sessionT = i18n.getFixedT(locale, 'translations')
    const created = createBrowserLessonSession(teachingSpnDemoDocuments, locale, sessionT, visualizerCatalog)
    if (!created.ok) {
      setFailure({ diagnostic: created.diagnostics[0] })
      return
    }
    session.current = created.value
    let active = true
    void created.value.next().then((result) => {
      if (!active) return
      if (result.ok) {
        setState(result.value)
        const diagnostic = Object.values(result.value.executionDiagnostics)[0]
        if (diagnostic) setFailure({ diagnostic })
      } else setFailure({ diagnostic: result.diagnostics[0] })
    })
    return () => {
      active = false
      created.value.dispose()
    }
  }, [])

  const execution = state?.snapshots.visualize
  const executionIdentity = state?.executionIdentities.visualize ?? 'teaching-spn-demo'
  const invocation = session.current?.lesson.steps[0].visualizer

  return <main style={{ margin: '0 auto', maxWidth: 1200, padding: 20 }}>
    <h1>{t('title')}</h1>
    <form onSubmit={(event) => {
      event.preventDefault()
      const current = session.current
      if (!current) {
        setFailure({})
        return
      }
      const updated = current.setInput('plaintext', plaintext)
      if (!updated.ok) {
        setFailure({ diagnostic: updated.diagnostics[0] })
        return
      }
      setFailure(undefined)
      void current.next().then((result) => {
        if (result.ok) {
          setState(result.value)
          const diagnostic = Object.values(result.value.executionDiagnostics)[0]
          if (diagnostic) setFailure({ diagnostic })
        } else setFailure({ diagnostic: result.diagnostics[0] })
      })
    }}>
      <label>{t('plaintext')} <input pattern="0x[0-9a-fA-F]{4}" required value={plaintext} onChange={(event) => setPlaintext(event.target.value)} /></label>
      <button type="submit">{t('run')}</button>
    </form>
    {execution && invocation && <RenderHost
      dimensions={{ width: 1100, height: 700 }}
      execution={execution}
      executionIdentity={executionIdentity}
      invocation={invocation}
      reducedMotion={window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false}
    />}
    {failure && <p role="alert">{failure.diagnostic
      ? lessonDiagnosticCodes.has(failure.diagnostic.code)
        ? runtimeT(`learning.runtime.${failure.diagnostic.code}`, { defaultValue: failure.diagnostic.message })
        : failure.diagnostic.message
      : t('failure')}</p>}
  </main>
}
