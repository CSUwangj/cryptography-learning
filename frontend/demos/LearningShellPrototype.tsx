// Throwaway #95 P0-A5/A6: one real-Shell candidate on /learning, with adjustable spacing.
import React, { useEffect, useState } from 'react'
import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { H2, H3, OverlaysProvider } from '@blueprintjs/core'
import styled from '@emotion/styled'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { BrowserRouter, Link, matchPath, useHistory, useLocation } from 'react-router-dom'
import { of } from 'rxjs'
import { Markdown } from 'practice'
import { learningColors, LearningPresentationView, type LearningPresentation } from '../src/ui/learning'
import productionI18n from '../src/app/i18n'
import { Shell } from '../src/app/shell/Shell'
import '../src/app/App.css'
import '../src/index.css'

type Locale = 'en-US' | 'zh-CN'

const categories = [
  { id: 'foundations', lessons: [{ id: 'xor' }, { id: 'bits-long' }] },
  { id: 'block-ciphers', lessons: [{ id: 'aes-128' }, { id: 'aes-192-long' }] },
]

const Frame = styled.div`
  height: 100%;
`
const Content = styled.main<{ $desktop: number; $narrow: number; $measure: number }>`
  box-sizing: border-box;
  min-width: 0;
  padding: 24px ${({ $desktop }) => $desktop}px 96px;
  overflow-wrap: anywhere;
  .prose { max-width: ${({ $measure }) => $measure}rem; margin-inline: auto; }
  .breadcrumb { margin-bottom: 16px; }
  li { margin-block: 8px; }
  > section[aria-label] {
    border: 1px solid ${learningColors.border};
    border-radius: 4px;
    margin-block: 16px;
    padding: 12px;
  }
  @media (max-width: 520px) { padding: 16px ${({ $narrow }) => $narrow}px 96px; }
`
const SpacingControls = styled.details`
  position: fixed;
  right: 8px;
  bottom: 8px;
  padding: 8px;
  max-width: calc(100vw - 16px);
  background: #fff;
  color: #1c2127;
  border: 1px solid #d8dee6;
  z-index: 10;
  summary { cursor: pointer; }
  label { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 8px; }
  input { width: 64px; }
`

function LearningPreview() {
  const { i18n, t } = useTranslation()
  const locale: Locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US'

  const history = useHistory()
  const location = useLocation()
  const [desktop, setDesktop] = useState(24)
  const [narrow, setNarrow] = useState(16)
  const [measure, setMeasure] = useState(60)
  const lessonId = matchPath<{ lessonId: string }>(location.pathname, { path: '/learning/:lessonId', exact: true })?.params.lessonId
  const category = categories.find((item) => item.lessons.some((lesson) => lesson.id === lessonId))
  const lesson = category?.lessons.find((item) => item.id === lessonId)
  const isLearning = location.pathname.startsWith('/learning')
  const path = (pathname: string) => ({ pathname, search: `?prototype=shell&lang=${locale}` })
  const breadcrumb = [t('nav.learning'), category && t(`learningShell.categoryNames.${category.id}`, { ns: 'demos' }), lesson && t(`learningShell.lessonTitles.${lesson.id}`, { ns: 'demos' })].filter(Boolean).join(' > ')

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    params.set('prototype', 'shell')
    params.set('lang', locale)
    if (params.toString() !== location.search.slice(1)) history.replace({ ...location, search: params.toString() })
    document.documentElement.lang = locale
    document.title = `${(lesson && t(`learningShell.lessonTitles.${lesson.id}`, { ns: 'demos' })) || t('nav.learning')} | ${t('learningShell.documentTitle', { ns: 'demos' })}`
  }, [location, history, locale, lesson, t])

  const presentation: LearningPresentation = {
    title: t('learningShell.trace', { ns: 'demos' }),
    selectionStatus: (bit) => bit ? `${t('learningShell.selection', { ns: 'demos' })}: ${bit.ariaLabel}` : t('learningShell.none', { ns: 'demos' }),
    sections: [{
      kind: 'trace', caption: 'AddRoundKey', headers: [t('learningShell.operation', { ns: 'demos' }), t('learningShell.value', { ns: 'demos' }), t('learningShell.bits', { ns: 'demos' })],
      // Public AES demo inputs and initial XOR only; no v2 execution or lineage is implied.
      rows: [
        ['plaintext', t('learningShell.plaintext', { ns: 'demos' }), '00112233445566778899aabbccddeeff'],
        ['key', t('learningShell.key', { ns: 'demos' }), '000102030405060708090a0b0c0d0e0f'],
        ['output', t('learningShell.output', { ns: 'demos' }), '00102030405060708090a0b0c0d0e0f0'],
      ].map(([id, label, hex]) => ({
        id, label, cells: [{ value: <code>{hex}</code> }], bitGrouping: { size: 8 },
        selectableBits: [...hex].flatMap((digit) => [...parseInt(digit, 16).toString(2).padStart(4, '0')]).map((value, bit) => ({
          id: `${id}-${bit}`, bit, value, ariaLabel: `${label}, ${t('learningShell.bits', { ns: 'demos' })} ${bit}: ${value}`,
        })),
      })),
    }],
  }
  return <Frame data-prototype="learning-shell">
    <Content $desktop={desktop} $narrow={narrow} $measure={measure}>
        {lesson ? <>
          <nav className="breadcrumb prose" aria-label={breadcrumb}><Link to={path('/learning')}>{t('nav.learning')}</Link>{' > '}{category && t(`learningShell.categoryNames.${category.id}`, { ns: 'demos' })}{' > '}<span aria-current="page">{t(`learningShell.lessonTitles.${lesson.id}`, { ns: 'demos' })}</span></nav>
          <div className="prose"><H2>{t(`learningShell.lessonTitles.${lesson.id}`, { ns: 'demos' })}</H2><Markdown source={t('learningShell.prose', { ns: 'demos' })} /></div>
          {category?.id === 'block-ciphers' && <>
            <LearningPresentationView key={lesson.id} presentation={presentation} />
            <div className="prose"><Markdown source={t('learningShell.after', { ns: 'demos' })} /></div>
          </>}
        </> : isLearning ? <div className="prose">
          <H2>{t('learning.title')}</H2>
          {categories.map((item) => <section key={item.id}><H3>{t(`learningShell.categoryNames.${item.id}`, { ns: 'demos' })}</H3><ul>
            {item.lessons.map((entry) => <li key={entry.id}><Link to={path(`/learning/${entry.id}`)}>{t(`learningShell.lessonTitles.${entry.id}`, { ns: 'demos' })}</Link></li>)}
          </ul></section>)}
        </div> : <div className="prose">
          <H2>{t(location.pathname === '/' ? 'nav.home' : location.pathname === '/feedback' ? 'nav.feedback' : location.pathname === '/completion' ? 'nav.completion' : 'nav.practice')}</H2>
          <Link to={path('/learning')}>{t('learningShell.catalog', { ns: 'demos' })}</Link>
        </div>}
    </Content>
    <SpacingControls>
        <summary>{t('learningShell.spacing', { ns: 'demos' })}: {desktop}/{narrow}px · {measure}rem</summary>
        {[
          { label: t('learningShell.desktop', { ns: 'demos' }), value: desktop, set: setDesktop, min: 0, max: 64 },
          { label: t('learningShell.narrow', { ns: 'demos' }), value: narrow, set: setNarrow, min: 0, max: 32 },
          { label: t('learningShell.measure', { ns: 'demos' }), value: measure, set: setMeasure, min: 24, max: 80 },
        ].map(({ label, value, set, min, max }) =>
          <label key={label}>{label}<input type="number" min={min} max={max} value={value} onChange={(event) => {
            if (event.target.value && event.target.validity.valid) set(event.target.valueAsNumber)
          }} /></label>)}
    </SpacingControls>
  </Frame>
}

export function LearningShellPrototype() {
  // Retained preview callers use the production Shell and local catalog fixtures only.
  const [client] = useState(() => new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => of({ data: {
      learning: { lessonCategories: categories.map((category) => ({
        id: category.id,
        name: ['en-US', 'zh-CN'].map((lang) => ({ lang, text: productionI18n.getFixedT(lang, 'demos')(`learningShell.categoryNames.${category.id}`) })),
        lessons: category.lessons.map((lesson) => ({
          id: lesson.id,
          title: productionI18n.getFixedT(operation.variables.language, 'demos')(`learningShell.lessonTitles.${lesson.id}`),
        })),
      })) },
      practice: { __typename: 'Practice', labCategories: [{
      __typename: 'LabCategory', id: 'classical', name: ['en-US', 'zh-CN'].map((lang) => ({
        __typename: 'Translation', lang, text: productionI18n.getFixedT(lang, 'demos')('learningShell.practiceCategory'),
      })),
      labs: [{ __typename: 'Lab', id: 'caesar', wsEndpoints: [], tcpEndpoints: [], resources: ['en-US', 'zh-CN'].map((lang) => ({
        __typename: 'ResourceWithTranslation', lang, name: productionI18n.getFixedT(lang, 'demos')('learningShell.practiceTitle'),
      })) }],
    }] } } })),
  }))
  return <I18nextProvider i18n={productionI18n}><BrowserRouter><OverlaysProvider><ApolloProvider client={client}>
    <Shell><LearningPreview /></Shell>
  </ApolloProvider></OverlaysProvider></BrowserRouter></I18nextProvider>
}
