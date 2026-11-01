import React, { useEffect, useRef, useState } from 'react'
import { Button, Callout, Classes, FormGroup, H2, InputGroup } from '@blueprintjs/core'
import { Global } from '@emotion/react'
import { useTranslation } from 'react-i18next'
import type { Diagnostic } from '../src/crypto_graph'
import { LearningPageFrame } from '../src/learning'
import { createBrowserLessonSession, lessonDiagnosticCodes, type BrowserLessonSession, type LessonSessionState } from '../src/lesson_runtime'
import { RenderHost } from '../src/visualizers'
import { slidingWindowDemoDocuments } from './slidingWindowLesson'
import '../src/app/App.css'

export const SlidingWindowDemo: React.FC = () => {
  const { t: runtimeT } = useTranslation('translations')
  const { t, i18n } = useTranslation('demos', { keyPrefix: 'slidingWindow' })
  const [key, setKey] = useState('0x12345678')
  const [state, setState] = useState<LessonSessionState>()
  const [failure, setFailure] = useState<Diagnostic>()
  const session = useRef<BrowserLessonSession | undefined>(undefined)

  const run = (current: BrowserLessonSession): void => {
    void current.next().then((result) => {
      if (session.current !== current) return
      if (result.ok) {
        setState(result.value)
        setFailure(Object.values(result.value.executionDiagnostics)[0])
      } else setFailure(result.diagnostics[0])
    })
  }

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateTheme = () => {
      const saved = window.localStorage.getItem('cryptography-learning-theme')
      document.body.classList.toggle(Classes.DARK, saved === 'dark' || (saved !== 'light' && media.matches))
    }
    updateTheme()
    media.addEventListener('change', updateTheme)
    return () => {
      media.removeEventListener('change', updateTheme)
      document.body.classList.remove(Classes.DARK)
    }
  }, [])

  useEffect(() => {
    // Language changes relabel retained values without rerunning the Worker.
    const locale = i18n.resolvedLanguage ?? 'en-US'
    const created = createBrowserLessonSession(slidingWindowDemoDocuments, locale, i18n.getFixedT(locale, 'translations'))
    if (!created.ok) {
      setFailure(created.diagnostics[0])
      return
    }
    session.current = created.value
    run(created.value)
    return () => {
      session.current = undefined
      created.value.dispose()
    }
  }, [])

  const lesson = session.current?.lesson
  const locale = lesson?.locales[i18n.resolvedLanguage ?? 'en-US'] ?? lesson?.locales[lesson.defaultLocale]
  const execution = state?.snapshots.inspect

  return <main className="app" style={{ minHeight: '100vh' }}>
    <Global styles={{ body: { backgroundColor: 'var(--app-page)', margin: 0 } }} />
    <LearningPageFrame>
      <div className="learning-prose">
        <H2>{locale?.title}</H2>
        <p>{locale?.summary}</p>
        <form onSubmit={(event) => {
          event.preventDefault()
          const current = session.current
          if (!current) return
          const updated = current.setInput('key', key)
          if (!updated.ok) {
            setFailure(updated.diagnostics[0])
            return
          }
          setFailure(undefined)
          run(current)
        }}>
          <FormGroup label={t('masterKey')} labelFor="sliding-window-key">
            <InputGroup id="sliding-window-key" pattern="0x[0-9a-fA-F]{8}" required value={key} onChange={(event) => setKey(event.target.value)} />
          </FormGroup>
          <Button type="submit" text={t('run')} />
        </form>
        {failure && <Callout intent="danger" role="alert">{lessonDiagnosticCodes.has(failure.code)
          ? runtimeT(`learning.runtime.${failure.code}`, { defaultValue: failure.message })
          : failure.message}</Callout>}
      </div>
      {execution && lesson && <div className="learning-trace">
        <RenderHost
          execution={execution}
          executionIdentity={state.executionIdentities.inspect!}
          compiledGraph={lesson.graphs.schedule}
          presentation={lesson.steps[0].presentation}
          lessonTexts={locale?.texts}
          dimensions={{ width: 1100, height: 700 }}
          reducedMotion={window.matchMedia('(prefers-reduced-motion: reduce)').matches}
        />
      </div>}
    </LearningPageFrame>
  </main>
}
