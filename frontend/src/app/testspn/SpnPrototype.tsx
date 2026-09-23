import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createBrowserLessonSession, type BrowserLessonSession, type LessonSessionState } from '../../lesson_runtime'
import { RenderHost, visualizerCatalog } from '../../visualizers'
import { teachingSpnDemoDocuments } from './demoLesson'

const copy = {
  'en-US': { title: 'Teaching SPN demo', plaintext: 'Plaintext', run: 'Run SPN', failure: 'Could not run this SPN execution.' },
  'zh-CN': { title: '教学 SPN 演示', plaintext: '明文', run: '运行 SPN', failure: '无法运行此 SPN 执行。' },
} as const

export const SpnPrototype: React.FC = () => {
  const { i18n } = useTranslation()
  const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US'
  const text = copy[locale]
  const [plaintext, setPlaintext] = useState('0x1234')
  const [state, setState] = useState<LessonSessionState>()
  const [failure, setFailure] = useState<string>()
  const session = useRef<BrowserLessonSession | undefined>(undefined)

  useEffect(() => {
    const created = createBrowserLessonSession(teachingSpnDemoDocuments, locale, visualizerCatalog)
    if (!created.ok) {
      setFailure(created.diagnostics[0]?.message ?? text.failure)
      return
    }
    session.current = created.value
    void created.value.next().then((result) => {
      if (result.ok) setState(result.value)
      else setFailure(result.diagnostics[0]?.message ?? text.failure)
    })
    return () => created.value.dispose()
  }, [locale, text.failure])

  const execution = state?.snapshots.visualize
  const executionIdentity = state?.executionIdentities.visualize ?? 'teaching-spn-demo'
  const invocation = session.current?.lesson.steps[0].visualizer

  return <main style={{ margin: '0 auto', maxWidth: 1200, padding: 20 }}>
    <h1>{text.title}</h1>
    <form onSubmit={(event) => {
      event.preventDefault()
      const current = session.current
      if (!current) {
        setFailure(text.failure)
        return
      }
      const updated = current.setInput('plaintext', plaintext)
      if (!updated.ok) {
        setFailure(updated.diagnostics[0]?.message ?? text.failure)
        return
      }
      setFailure(undefined)
      void current.next().then((result) => {
        if (result.ok) setState(result.value)
        else setFailure(result.diagnostics[0]?.message ?? text.failure)
      })
    }}>
      <label>{text.plaintext} <input pattern="0x[0-9a-fA-F]{4}" required value={plaintext} onChange={(event) => setPlaintext(event.target.value)} /></label>
      <button type="submit">{text.run}</button>
    </form>
    {execution && invocation && <RenderHost
      dimensions={{ width: 1100, height: 700 }}
      execution={execution}
      executionIdentity={executionIdentity}
      invocation={invocation}
      locale={locale}
      reducedMotion={window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false}
    />}
    {failure && <p role="alert">{failure}</p>}
  </main>
}
