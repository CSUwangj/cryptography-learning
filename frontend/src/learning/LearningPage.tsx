import React, { useEffect, useRef, useState } from 'react'
import { Button, Callout, H2, H3, InputGroup, Spinner } from '@blueprintjs/core'
import { useApolloClient } from '@apollo/client/react'
import { Link, Route, Switch, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Markdown } from 'practice'
import { NotFound } from 'ui'
import {
  createBrowserLessonSession,
  lessonAssetUrl,
  lessonDefaultLocale,
  type BrowserLessonSession,
  type LessonDocuments as RuntimeLessonDocuments,
  type LessonSessionState,
} from 'lesson_runtime'
import { hex, type CryptoValue, type Diagnostic } from 'crypto_graph'
import { loadLessonDocuments, useLearningCatalog } from './data'

type LessonRoute = { lessonId: string }
type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; diagnostics: readonly Diagnostic[] }
  | { status: 'ready'; state: LessonSessionState }

const diagnostic = (message: string): Diagnostic => ({
  code: 'lesson.load-failed',
  message,
  path: '',
  details: {},
})

const text = (source: string, lessonId: string): string =>
  source
    .replace(/(!?\[[^\]]*]\()\<?assets\/([^)\s>]+)>?(?=(?:\s+["'][^"']*["'])?\))/g, (_, start: string, path: string) =>
    `${start}${lessonAssetUrl(lessonId, `assets/${path}`)}`)
    .replace(/^(\s*\[[^\]]+]:\s*)<?assets\/([^\s>]+)>?/gm, (_, start: string, path: string) =>
      `${start}${lessonAssetUrl(lessonId, `assets/${path}`)}`)

const hexValue = (value: Exclude<CryptoValue, { symbol: string }>): string =>
  'words' in value ? `0x${[...value.words].map((byte) => byte.toString(16).padStart(2, '0')).join('')}` : hex(value)

const valueText = (value: CryptoValue): string =>
  'symbol' in value
    ? `${value.symbol} (${value.type.family}<${value.type.mapping}>)`
    : `${hexValue(value)} (${value.type.family}<${value.type.size}>)`

const inputText = (value: CryptoValue | string): string =>
  typeof value === 'string' ? value : 'symbol' in value ? value.symbol : hexValue(value)

const diagnosticText = (value: Diagnostic): string =>
  `${value.code}: ${value.message}${value.path ? ` (${value.path})` : ''}${value.span ? ` at ${value.span.file}:${value.span.line}:${value.span.column}` : ''}`

const LessonCatalog: React.FC = () => {
  const { i18n, t } = useTranslation()
  const catalog = useLearningCatalog()
  if (catalog.loading) return <Spinner aria-label={t('learning.loadingCatalog')} />
  if (catalog.error) return <Callout intent="danger">{t('learning.catalogError')}</Callout>
  return <section>
    <H2>{t('learning.title')}</H2>
    {catalog.categories?.map((category) => {
      const name = category.names.find((item) => item.language === i18n.language)?.text
        ?? category.names.find((item) => item.language === 'en-US')?.text
        ?? category.id
      return <section key={category.id}>
        <H3>{name}</H3>
        <ul>{category.lessons.map((lesson) => <li key={lesson.id}><Link to={`/learning/${lesson.id}`}>{lesson.id}</Link></li>)}</ul>
      </section>
    })}
  </section>
}

const LessonView: React.FC = () => {
  const { lessonId } = useParams<LessonRoute>()
  const { i18n, t } = useTranslation()
  const client = useApolloClient()
  const session = useRef<BrowserLessonSession | null>(null)
  const activeLesson = useRef<string | null>(null)
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let disposed = false
    setLoad({ status: 'loading' })
    const apply = (documents: RuntimeLessonDocuments) => {
      if (activeLesson.current === lessonId && session.current) {
        const updated = session.current.updateDocuments(documents, i18n.language)
        if (!updated.ok) {
          setLoad({ status: 'error', diagnostics: updated.diagnostics })
          return
        }
      } else {
        const created = createBrowserLessonSession(documents, i18n.language)
        if (!created.ok) {
          setLoad({ status: 'error', diagnostics: created.diagnostics })
          return
        }
        session.current?.dispose()
        session.current = created.value
        activeLesson.current = lessonId
      }
      setLoad({ status: 'ready', state: session.current!.state() })
    }
    const loadDocuments = async () => {
      try {
        const selectedDocuments = await loadLessonDocuments(client, lessonId, i18n.language)
        if (!selectedDocuments) {
          setLoad({ status: 'error', diagnostics: [diagnostic(t('learning.loadError'))] })
          return
        }
        const fallback = lessonDefaultLocale(selectedDocuments.lesson)
        if (!fallback) {
          if (!disposed) apply({
            lesson: selectedDocuments.lesson,
            locales: selectedDocuments.locale === null ? {} : { [i18n.language]: selectedDocuments.locale },
          })
          return
        }
        const locale = selectedDocuments.locale
        if (locale === null || fallback !== i18n.language) {
          const fallbackDocuments = await loadLessonDocuments(client, lessonId, fallback)
          const fallbackLocale = fallbackDocuments?.locale
          if (fallbackLocale === null || fallbackLocale === undefined) {
            setLoad({ status: 'error', diagnostics: [diagnostic(t('learning.missingDefaultLocale'))] })
            return
          }
          if (!disposed) apply({
            lesson: selectedDocuments.lesson,
            locales: locale === null
              ? { [fallback]: fallbackLocale }
              : { [fallback]: fallbackLocale, [i18n.language]: locale },
          })
          return
        }
        if (!disposed) apply({ lesson: selectedDocuments.lesson, locales: { [i18n.language]: locale } })
      } catch (error) {
        const graphQLErrors = (error as { errors?: readonly { extensions?: { code?: string } }[] }).errors
        if (!disposed) setLoad(graphQLErrors?.some((item) => item.extensions?.code?.endsWith(' not found'))
          ? { status: 'not-found' }
          : { status: 'error', diagnostics: [diagnostic(t('learning.loadError'))] })
      }
    }
    void loadDocuments()
    return () => { disposed = true }
  }, [client, i18n.language, lessonId, t])

  useEffect(() => () => session.current?.dispose(), [])

  if (load.status === 'loading') return <Spinner aria-label={t('learning.loadingLesson')} />
  if (load.status === 'not-found') return <NotFound />
  if (load.status === 'error') return <Callout intent="danger">{load.diagnostics.map((item) => <p key={`${item.code}-${item.path}`}>{diagnosticText(item)}</p>)}</Callout>

  const current = session.current!
  const state = load.state
  const step = current.lesson.steps[state.stepIndex]
  const locale = current.lesson.locales[state.locale]
  const refresh = () => setLoad({ status: 'ready', state: current.state() })
  const next = async () => {
    const result = await current.next()
    if (!result.ok) setLoad({ status: 'error', diagnostics: result.diagnostics })
    else setLoad({ status: 'ready', state: result.value })
  }

  return <section>
    <Link to="/learning">{t('learning.backToCatalog')}</Link>
    <H2>{locale.title}</H2>
    <p>{locale.summary}</p>
    {step.prose && <Markdown source={text(locale.texts[step.prose] ?? '', lessonId)} />}
    {step.inputs?.map((input) => {
      const raw = state.inputs[input.input]
      const value = inputText(raw)
      return <label key={input.input}>
        <p>{locale.texts[input.prompt]}</p>
        <InputGroup value={value} onChange={(event) => { current.setInput(input.input, event.target.value); refresh() }} />
        {state.inputDiagnostics[input.input] && <Callout intent="danger">{state.inputDiagnostics[input.input].message}</Callout>}
      </label>
    })}
    {step.execute && state.snapshots[step.id] && <table>
      <caption>{t('learning.outputs')}</caption>
      <thead><tr><th>{t('learning.output')}</th><th>{t('learning.value')}</th></tr></thead>
      <tbody>{Object.entries(state.snapshots[step.id].outputs).map(([name, value]) => <tr key={name}><th>{name}</th><td>{valueText(value)}</td></tr>)}</tbody>
    </table>}
    <p>
      <Button disabled={state.stepIndex === 0} onClick={() => { current.previous(); refresh() }}>{t('learning.previous')}</Button>
      <Button onClick={() => void next()}>{t('learning.next')}</Button>
    </p>
  </section>
}

export const LearningPage: React.FC = () => {
  const { t } = useTranslation()
  useEffect(() => {
    const title = document.title
    document.title = t('nav.learning')
    return () => { document.title = title }
  }, [t])
  return <Switch>
    <Route exact path="/learning/:lessonId" component={LessonView} />
    <Route exact path="/learning" component={LessonCatalog} />
  </Switch>
}
