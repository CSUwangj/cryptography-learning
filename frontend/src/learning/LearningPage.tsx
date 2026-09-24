import React, { useEffect, useRef, useState } from 'react'
import { Button, Callout, H2, H3, InputGroup, Spinner } from '@blueprintjs/core'
import { useApolloClient } from '@apollo/client/react'
import { Link, Route, Switch, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Markdown } from 'practice'
import { NotFound } from 'ui'
import {
  createBrowserLessonSession,
  lessonDefaultLocale,
  rewriteLessonAssets,
  type BrowserLessonSession,
  type LessonDocuments as RuntimeLessonDocuments,
  type LessonSessionState,
} from 'lesson_runtime'
import { hex, type AlphabetPolicyValue, type AlphabetTextValue, type CryptoValue, type Diagnostic } from 'crypto_graph'
import { RenderHost, visualizerCatalog } from '../visualizers'
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

const hexValue = (value: CryptoValue): string => {
  const byteValue = value as Extract<CryptoValue, { bytes: Uint8Array } | { words: Uint8Array }>
  return 'words' in byteValue ? `0x${[...byteValue.words].map((byte) => byte.toString(16).padStart(2, '0')).join('')}` : hex(byteValue)
}

const valueText = (value: CryptoValue): string =>
  'symbol' in value
    ? `${value.symbol} (${value.type.family}<${value.type.mapping}>)`
    : 'symbols' in value
      ? `${value.symbols.join('')} (${value.type.family}<${value.type.mapping}>)`
      : 'value' in value
        ? `${value.value} (${value.type.family})`
        : `${hexValue(value)} (${value.type.family}<${(value.type as { size: number }).size}>)`

const inputText = (value: CryptoValue | string): string =>
  typeof value === 'string'
    ? value
    : 'symbol' in value
      ? value.symbol
      : 'symbols' in value
        ? value.symbols.join('')
        : 'value' in value
          ? String(value.value)
          : hexValue(value)

const diagnosticText = (value: Diagnostic): string =>
  `${value.code}: ${value.message}${value.path ? ` (${value.path})` : ''}${value.span ? ` at ${value.span.file}:${value.span.line}:${value.span.column}` : ''}`

const classicalCipherData = (
  step: { readonly execute?: { readonly graph: string }; readonly visualizer?: { readonly id: string; readonly bindings?: Readonly<Record<string, unknown>> } },
  lesson: BrowserLessonSession['lesson'],
  state: LessonSessionState,
) => {
  if (step.visualizer?.id !== 'classical-cipher@1' || !step.execute) return undefined
  const value = (binding: unknown): CryptoValue | undefined => {
    if (typeof binding !== 'object' || binding === null) return undefined
    const reference = binding as { input?: unknown; step?: unknown; output?: unknown }
    const input = typeof reference.input === 'string' ? state.inputs[reference.input] : undefined
    const output = typeof reference.step === 'string' && typeof reference.output === 'string'
      ? state.snapshots[reference.step]?.outputs[reference.output]
      : undefined
    const resolved = input ?? output
    return typeof resolved === 'string' ? undefined : resolved
  }
  const plaintext = value(step.visualizer.bindings?.plaintext)
  const ciphertext = value(step.visualizer.bindings?.ciphertext)
  const policy = value(step.visualizer.bindings?.policy)
  if (plaintext?.type.family !== 'alphabet-text' || ciphertext?.type.family !== 'alphabet-text' || policy?.type.family !== 'alphabet-policy') return undefined
  const input = plaintext as AlphabetTextValue
  const output = ciphertext as AlphabetTextValue
  const mapping = lesson.graphs[step.execute.graph]?.graph.alphabetMappings?.find((item) => item.id === input.type.mapping)
  return mapping && input.type.mapping === output.type.mapping
    ? { input, output, mapping, policy: policy as AlphabetPolicyValue }
    : undefined
}

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
  const [visualizerSurface, setVisualizerSurface] = useState<HTMLDivElement | null>(null)
  const [visualizerDimensions, setVisualizerDimensions] = useState({ width: 0, height: 0 })
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    if (!visualizerSurface || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setVisualizerDimensions({
      width: Math.round(entry.contentRect.width),
      height: Math.round(entry.contentRect.height),
    }))
    observer.observe(visualizerSurface)
    return () => observer.disconnect()
  }, [visualizerSurface])

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    let disposed = false
    setLoad({ status: 'loading' })
    const apply = async (documents: RuntimeLessonDocuments) => {
      if (activeLesson.current === lessonId && session.current) {
        const updated = session.current.updateDocuments(documents, i18n.language, visualizerCatalog)
        if (!updated.ok) {
          if (!disposed) setLoad({ status: 'error', diagnostics: updated.diagnostics })
          return
        }
      } else {
        const created = createBrowserLessonSession(documents, i18n.language, visualizerCatalog)
        if (!created.ok) {
          if (!disposed) setLoad({ status: 'error', diagnostics: created.diagnostics })
          return
        }
        session.current?.dispose()
        session.current = created.value
        activeLesson.current = lessonId
      }
      const entered = await session.current!.enter()
      if (!disposed) {
        if (entered.ok) setLoad({ status: 'ready', state: entered.value })
        else setLoad({ status: 'error', diagnostics: entered.diagnostics })
      }
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
          if (!disposed) void apply({
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
          if (!disposed) void apply({
            lesson: selectedDocuments.lesson,
            locales: locale === null
              ? { [fallback]: fallbackLocale }
              : { [fallback]: fallbackLocale, [i18n.language]: locale },
          })
          return
        }
        if (!disposed) void apply({ lesson: selectedDocuments.lesson, locales: { [i18n.language]: locale } })
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
  const checkResult = state.checkResults[step.id]
  const acceptedDiagnostic = state.acceptedDiagnostics[step.id]
  const executionDiagnostic = state.executionDiagnostics[step.id]
  const cipher = classicalCipherData(step, current.lesson, state)
  const next = async () => {
    const result = await current.next()
    if (!result.ok) setLoad({ status: 'error', diagnostics: result.diagnostics })
    else setLoad({ status: 'ready', state: result.value })
  }

  return <section>
    <Link to="/learning">{t('learning.backToCatalog')}</Link>
    <H2>{locale.title}</H2>
    <p>{locale.summary}</p>
    {step.prose && <Markdown source={rewriteLessonAssets(locale.texts[step.prose] ?? '', lessonId)} />}
    {step.inputs?.map((input) => {
      const raw = state.inputs[input.input]
      const value = inputText(raw)
      const setInput = (next: string) => { current.setInput(input.input, next); refresh() }
      return <label key={input.input}>
        <p>{locale.texts[input.prompt]}</p>
        {input.type.family === 'alphabet-policy'
          ? <select value={value} onChange={(event) => setInput(event.target.value)}>
              <option value="preserve">{t('learning.policy.preserve')}</option>
              <option value="strict">{t('learning.policy.strict')}</option>
            </select>
          : <InputGroup
              value={value}
              inputMode={input.type.family === 'integer' ? 'numeric' : undefined}
              onChange={(event) => setInput(event.target.value)}
            />}
        {state.inputDiagnostics[input.input] && <Callout intent="danger">{state.inputDiagnostics[input.input].message}</Callout>}
      </label>
    })}
    {step.execute && state.snapshots[step.id] && <table>
      <caption>{t('learning.outputs')}</caption>
      <thead><tr><th>{t('learning.output')}</th><th>{t('learning.value')}</th></tr></thead>
      <tbody>{Object.entries(state.snapshots[step.id].outputs).map(([name, value]) => <tr key={name}><th>{name}</th><td>{valueText(value)}</td></tr>)}</tbody>
    </table>}
    {step.visualizer && (state.comparisons[step.id] || state.snapshots[step.id]) && <div ref={setVisualizerSurface}>
      <RenderHost
        comparison={state.comparisons[step.id]}
        dimensions={visualizerDimensions}
        execution={state.snapshots[step.id]}
        executionIdentity={state.executionIdentities[step.id] ?? step.id}
        invocation={step.visualizer}
        locale={state.locale}
        reducedMotion={reducedMotion}
        classicalCipher={cipher && {
          input: cipher.input,
          output: cipher.output,
          mapping: cipher.mapping,
          policy: cipher.policy,
          policyLabel: t(`learning.policy.${cipher.policy.value}`),
        }}
      />
    </div>}
    {acceptedDiagnostic && <Callout intent="primary">{diagnosticText(acceptedDiagnostic)}</Callout>}
    {executionDiagnostic && <Callout intent="danger">{diagnosticText(executionDiagnostic)}</Callout>}
    {step.check?.kind === 'choice' && <fieldset>
      <legend>{t('learning.check')}</legend>
      {step.check.options.map((option) => <Button
        key={option.id}
        active={checkResult?.kind === 'choice' && checkResult.selected === option.id}
        onClick={() => {
          const result = current.selectChoice(option.id)
          if (result.ok) setLoad({ status: 'ready', state: result.value })
          else setLoad({ status: 'error', diagnostics: result.diagnostics })
        }}
      >{locale.texts[option.label]}</Button>)}
    </fieldset>}
    {checkResult && <Callout intent={checkResult.kind === 'equal' ? (checkResult.matched ? 'success' : 'warning') : (checkResult.correct ? 'success' : 'warning')}>
      {locale.texts[checkResult.feedback]}
    </Callout>}
    <p>
      <Button disabled={state.stepIndex === 0} onClick={() => void current.previous().then((previous) => setLoad({ status: 'ready', state: previous }))}>{t('learning.previous')}</Button>
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
