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
  {
    id: 'foundations', names: { 'en-US': 'Foundations', 'zh-CN': '基础知识' },
    lessons: [
      { id: 'xor', titles: { 'en-US': 'Exclusive OR', 'zh-CN': '异或运算' } },
      { id: 'bits-long', titles: {
        'en-US': 'From individual bits to complete blocks: reading binary values, byte boundaries, and hexadecimal notation',
        'zh-CN': '从单个位到完整分组：理解二进制数值、字节边界与十六进制表示之间的关系',
      } },
    ],
  },
  {
    id: 'block-ciphers', names: { 'en-US': 'Block ciphers', 'zh-CN': '分组密码' },
    lessons: [
      { id: 'aes-128', titles: { 'en-US': 'AES-128 encryption', 'zh-CN': 'AES-128 加密' } },
      { id: 'aes-192-long', titles: {
        'en-US': 'AES-192 encryption: following the complete 128-bit state from the plaintext through the initial round-key addition',
        'zh-CN': 'AES-192 加密过程：从明文输入到初始轮密钥加法，逐位观察完整的一百二十八位分组状态',
      } },
    ],
  },
]
const copy = {
  'en-US': {
    navigation: 'Learning Navigation', categories: 'Lesson categories', lessons: 'Lessons', catalog: 'All Lessons',
    selectCategory: 'Select a Lesson category', trace: 'Initial round', operation: 'Operation', value: 'Value', bits: 'Bits',
    plaintext: 'Plaintext', key: 'Initial round key', output: 'After AddRoundKey', selection: 'Selected', none: 'No bit selected',
    spacing: 'Prototype spacing', desktop: 'Desktop gutter (px)', narrow: 'Narrow gutter (px)', measure: 'Prose width (rem)',
    prose: 'A block is a fixed-width sequence of bits. The same value can be written in binary or hexadecimal: every hexadecimal digit represents four bits, and two digits represent one byte. Leading zeroes remain part of the block even when they do not change its numerical value.\n\nExclusive OR combines bits at the same position. Equal inputs produce zero; different inputs produce one. Applying the same key twice restores the original value, because each key bit cancels its earlier contribution.\n\n### Reading the state\n\nFor a 128-bit block, the state contains sixteen bytes. Byte boundaries help us group the value without changing the order of its bits. The first byte is still the first byte whether the entire state is written as bits, bytes, or one hexadecimal string.',
    after: 'The initial AddRoundKey combines the plaintext with the first 128 key bits. The key size determines the later key schedule; the cipher state remains 128 bits wide.',
  },
  'zh-CN': {
    navigation: '学习导航', categories: '课程分类', lessons: '课程', catalog: '全部课程',
    selectCategory: '选择课程分类', trace: '初始轮', operation: '操作', value: '数值', bits: '位',
    plaintext: '明文', key: '初始轮密钥', output: '轮密钥加法之后', selection: '已选择', none: '尚未选择位',
    spacing: '原型间距', desktop: '桌面留白（px）', narrow: '窄屏留白（px）', measure: '正文宽度（rem）',
    prose: '分组是一个固定宽度的位序列。同一个数值既可以用二进制表示，也可以用十六进制表示：每个十六进制数字代表四个位，两个数字代表一个字节。即使前导零不改变数值的大小，它们仍然是完整分组的一部分。\n\n异或运算将相同位置上的位组合起来。两个输入相同时得到零，不同时得到一。使用相同的密钥进行两次异或会恢复原始数值，因为每个密钥位都会抵消它在前一次运算中的作用。\n\n### 阅读状态\n\n一个一百二十八位的分组包含十六个字节。字节边界帮助我们对数值进行分组，而不会改变各个位的先后顺序。无论将完整状态写成位、字节，还是一串十六进制数字，第一个字节始终是第一个字节。',
    after: '初始轮密钥加法将明文与密钥的前一百二十八位进行异或。密钥长度决定后续的密钥扩展过程，而密码的分组状态始终保持一百二十八位宽。',
  },
}

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
  const text = copy[locale]
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
  const breadcrumb = [t('nav.learning'), category?.names[locale], lesson?.titles[locale]].filter(Boolean).join(' > ')

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    params.set('prototype', 'shell')
    params.set('lang', locale)
    if (params.toString() !== location.search.slice(1)) history.replace({ ...location, search: params.toString() })
    document.documentElement.lang = locale
    document.title = `${lesson?.titles[locale] ?? t('nav.learning')} | ${locale === 'zh-CN' ? 'P0 Shell 原型' : 'P0 Shell prototype'}`
  }, [location, history, locale, lesson, t])

  const presentation: LearningPresentation = {
    title: text.trace,
    selectionStatus: (bit) => bit ? `${text.selection}: ${bit.ariaLabel}` : text.none,
    sections: [{
      kind: 'trace', caption: 'AddRoundKey', headers: [text.operation, text.value, text.bits],
      // Public AES demo inputs and initial XOR only; no v2 execution or lineage is implied.
      rows: [
        ['plaintext', text.plaintext, '00112233445566778899aabbccddeeff'],
        ['key', text.key, '000102030405060708090a0b0c0d0e0f'],
        ['output', text.output, '00102030405060708090a0b0c0d0e0f0'],
      ].map(([id, label, hex]) => ({
        id, label, cells: [{ value: <code>{hex}</code> }], bitGrouping: { size: 8 },
        selectableBits: [...hex].flatMap((digit) => [...parseInt(digit, 16).toString(2).padStart(4, '0')]).map((value, bit) => ({
          id: `${id}-${bit}`, bit, value, ariaLabel: `${label}, ${text.bits} ${bit}: ${value}`,
        })),
      })),
    }],
  }
  return <Frame data-prototype="learning-shell">
    <Content $desktop={desktop} $narrow={narrow} $measure={measure}>
        {lesson ? <>
          <nav className="breadcrumb prose" aria-label={breadcrumb}><Link to={path('/learning')}>{t('nav.learning')}</Link>{' > '}{category?.names[locale]}{' > '}<span aria-current="page">{lesson.titles[locale]}</span></nav>
          <div className="prose"><H2>{lesson.titles[locale]}</H2><Markdown source={text.prose} /></div>
          {category?.id === 'block-ciphers' && <>
            <LearningPresentationView key={lesson.id} presentation={presentation} />
            <div className="prose"><Markdown source={text.after} /></div>
          </>}
        </> : isLearning ? <div className="prose">
          <H2>{t('learning.title')}</H2>
          {categories.map((item) => <section key={item.id}><H3>{item.names[locale]}</H3><ul>
            {item.lessons.map((entry) => <li key={entry.id}><Link to={path(`/learning/${entry.id}`)}>{entry.titles[locale]}</Link></li>)}
          </ul></section>)}
        </div> : <div className="prose">
          <H2>{t(location.pathname === '/' ? 'nav.home' : location.pathname === '/feedback' ? 'nav.feedback' : location.pathname === '/completion' ? 'nav.completion' : 'nav.practice')}</H2>
          <Link to={path('/learning')}>{text.catalog}</Link>
        </div>}
    </Content>
    <SpacingControls>
        <summary>{text.spacing}: {desktop}/{narrow}px · {measure}rem</summary>
        {[
          { label: text.desktop, value: desktop, set: setDesktop, min: 0, max: 64 },
          { label: text.narrow, value: narrow, set: setNarrow, min: 0, max: 32 },
          { label: text.measure, value: measure, set: setMeasure, min: 24, max: 80 },
        ].map(({ label, value, set, min, max }) =>
          <label key={label}>{label}<input type="number" min={min} max={max} value={value} onChange={(event) => {
            if (event.target.value && event.target.validity.valid) set(event.target.valueAsNumber)
          }} /></label>)}
    </SpacingControls>
  </Frame>
}

export function LearningShellPrototype() {
  const [i18n] = useState(() => productionI18n.cloneInstance({
    lng: new URLSearchParams(window.location.search).get('lang') === 'zh-CN' ? 'zh-CN' : 'en-US',
    detection: { caches: [] }, debug: false,
  }))
  // Retained preview callers use the production Shell and local catalog fixtures only.
  const [client] = useState(() => new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => of({ data: {
      learning: { lessonCategories: categories.map((category) => ({
        id: category.id,
        name: Object.entries(category.names).map(([lang, text]) => ({ lang, text })),
        lessons: category.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.titles[operation.variables.language === 'zh-CN' ? 'zh-CN' : 'en-US'],
        })),
      })) },
      practice: { __typename: 'Practice', labCategories: [{
      __typename: 'LabCategory', id: 'classical', name: [
        { __typename: 'Translation', lang: 'en-US', text: 'Classical cryptography' },
        { __typename: 'Translation', lang: 'zh-CN', text: '古典密码' },
      ],
      labs: [{ __typename: 'Lab', id: 'caesar', wsEndpoints: [], tcpEndpoints: [], resources: [
        { __typename: 'ResourceWithTranslation', lang: 'en-US', name: 'Caesar cipher' },
        { __typename: 'ResourceWithTranslation', lang: 'zh-CN', name: '凯撒密码' },
      ] }],
    }] } } })),
  }))
  return <I18nextProvider i18n={i18n}><BrowserRouter><OverlaysProvider><ApolloProvider client={client}>
    <Shell><LearningPreview /></Shell>
  </ApolloProvider></OverlaysProvider></BrowserRouter></I18nextProvider>
}
