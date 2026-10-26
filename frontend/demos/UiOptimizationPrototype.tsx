import React, { useEffect, useRef, useState } from 'react'
import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import {
  Breadcrumb, Breadcrumbs, Button, Card, Classes, Colors, H2, H4, Icon,
  MenuItem, Navbar, OverlaysProvider, PopoverNext, PopupKind,
} from '@blueprintjs/core'
import { Select } from '@blueprintjs/select'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { BrowserRouter, Redirect, Route, Switch, useHistory, useLocation } from 'react-router-dom'
import { of } from 'rxjs'

import { LearningPage } from 'learning'
import { PracticePage } from 'practice'
import { applicationIcons, contentWidth } from 'ui'
import { HomePage } from '../src/app/home/HomePage'
import { FeedbackPage } from '../src/app/feedback/FeedbackPage'
import { Shell } from '../src/app/shell/Shell'
import productionI18n from '../src/app/i18n'
import { aes256PrototypeLesson as lesson, aes256PrototypeLocales as lessonLocales } from './uiOptimizationPrototypeFixture'
import '../src/app/App.css'
import '../src/index.css'

type Locale = 'en-US' | 'zh-CN'
type Theme = 'light' | 'dark'
type Surface = 'learning' | 'practice'
type Variant = 'A' | 'B' | 'C' | 'D'
type PrototypeI18n = typeof productionI18n

const THEME_STORAGE_KEY = 'cryptography-learning-ui-theme-prototype'

// Public local fixture data; the real pages render it without a backend.
const labContent: Record<Locale, string> = {
  'en-US': `# Affine Cipher

Baseline Lab Description for characterization tests.

Ciphertext: \`baseline-affine-en\``,
  'zh-CN': `# 仿射加密

用于布局预览的公开实验示例。

密文： \`baseline-affine-zh\``,
}

const learningCatalog = (language: Locale) => ({
  lessonCategories: [{
    id: 'block-ciphers',
    name: [
      { lang: 'en-US', text: 'Block ciphers' },
      { lang: 'zh-CN', text: '分组密码' },
    ],
    lessons: [{ id: 'aes-256-preview', title: language === 'zh-CN' ? 'AES-256 — 轮密钥加与字节替换' : 'AES-256 — AddRoundKey and SubBytes' }],
  }],
})

const practiceCatalog = {
  __typename: 'Practice',
  labCategories: [{
    __typename: 'LabCategory',
    id: 'classical',
    name: [
      { __typename: 'Translation', lang: 'en-US', text: 'Classical' },
      { __typename: 'Translation', lang: 'zh-CN', text: '古典密码学' },
    ],
    labs: [{
      __typename: 'Lab',
      id: 'affine',
      wsEndpoints: [],
      tcpEndpoints: [{ __typename: 'Endpoint', host: 'lab.example.invalid', port: 19000 }],
      resources: [
        { __typename: 'ResourceWithTranslation', lang: 'en-US', name: 'Affine Cipher' },
        { __typename: 'ResourceWithTranslation', lang: 'zh-CN', name: '仿射加密' },
      ],
    }],
  }],
}

const createFixtureClient = (): ApolloClient => new ApolloClient({
  cache: new InMemoryCache(),
  link: new ApolloLink((operation) => {
    const language: Locale = operation.variables?.language === 'zh-CN' ? 'zh-CN' : 'en-US'
    switch (operation.operationName) {
      case 'LearningCatalog':
        return of({ data: { learning: learningCatalog(language) } })
      case 'LessonDocuments':
        return of({ data: { lessonDocuments: { lesson, locale: lessonLocales[language] } } })
      case 'Practices':
        return of({ data: { practice: practiceCatalog } })
      case 'Lab':
        return of({ data: { lab: {
          __typename: 'LabInstance',
          lang: language,
          name: language === 'zh-CN' ? '仿射加密' : 'Affine Cipher',
          content: labContent[language],
          wsEndpoints: [],
          tcpEndpoints: [{ __typename: 'Endpoint', host: 'lab.example.invalid', port: 19000 }],
        } } })
      default:
        return of({ data: {} })
    }
  }),
})

const LEARNING_PATH = '/learning/aes-256-preview'
const PRACTICE_PATH = '/practice/classical/affine'
const variants = ['A', 'B', 'C', 'D'] as const
const readTheme = (): Theme => {
  const saved = localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
const copy = {
  'en-US': {
    prototype: 'UI prototype', previous: 'Previous layout', next: 'Next layout',
    layouts: { A: 'Compact top navigation', B: 'Side navigation', C: 'Context in one bar', D: 'Confirmation · A body + C navbar' },
    breadcrumb: 'Page breadcrumb', moreLevels: 'Show earlier levels',
    completion: 'Completion data is outside this layout preview.',
  },
  'zh-CN': {
    prototype: 'UI 原型', previous: '上一个布局', next: '下一个布局',
    layouts: { A: '紧凑顶栏', B: '左侧导航', C: '单行上下文栏', D: '确认版 · A 主体 + C 导航' },
    breadcrumb: '页面导航路径', moreLevels: '显示上级路径',
    completion: '此布局原型不展示完成记录数据。',
  },
}

const catalogItem = (surface: Surface, locale: Locale) => {
  if (surface === 'learning') {
    const category = learningCatalog(locale).lessonCategories[0]
    return { category: category.name.find((entry) => entry.lang === locale)!.text, title: category.lessons[0].title, path: LEARNING_PATH }
  }
  const category = practiceCatalog.labCategories[0]
  return { category: category.name.find((entry) => entry.lang === locale)!.text, title: category.labs[0].resources.find((entry) => entry.lang === locale)!.name, path: PRACTICE_PATH }
}

// Only the navigation presentation and outer spacing are replaced in this prototype.
// The two-column category/entry interaction follows the existing navigation panels.
const NavigationMenu: React.FC<{ surface: Surface; locale: Locale; pathname: string; go: (path: string) => void; fullPath?: boolean; iconOnly?: boolean }> = ({ surface, locale, pathname, go, fullPath, iconOnly }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(false)
  const item = catalogItem(surface, locale)
  const active = pathname.startsWith(`/${surface}`) || (surface === 'practice' && pathname === '/completion')
  const parts = [t(`nav.${surface}`), ...(fullPath && pathname === item.path ? [item.category, item.title] : []), ...(fullPath && pathname === '/completion' && surface === 'practice' ? [t('nav.completion')] : [])]
  const navigate = (path: string) => { setOpen(false); go(path) }
  return <div className={`ui-navigation-menu ${fullPath && active ? 'ui-current-menu' : ''}`}>
    <PopoverNext
      isOpen={open} onInteraction={(value) => { setOpen(value); if (value) setSelected(active) }}
      placement="bottom-start" popupKind={PopupKind.DIALOG} transitionDuration={0}
      content={<div className="ui-catalog-panel" role="dialog" aria-label={t(`${surface}Navigation.label`)}>
        <div><H4>{t(`${surface}Navigation.categories`)}</H4>
          <Button fill alignText="left" active={selected} onClick={() => setSelected(true)}>{item.category}</Button>
          <Button className="ui-catalog-index" fill minimal alignText="left" icon={surface === 'learning' ? applicationIcons.action.learningCatalog : applicationIcons.action.completionRecords} onClick={() => navigate(surface === 'learning' ? '/learning' : '/completion')}>{t(surface === 'learning' ? 'learning.title' : 'nav.completion')}</Button>
        </div>
        <div><H4>{t(surface === 'learning' ? 'learningNavigation.lessons' : 'practiceNavigation.labs')}</H4>
          {selected ? <Button fill alignText="left" active={pathname === item.path} onClick={() => navigate(item.path)}>{item.title}</Button> : <p className={Classes.TEXT_MUTED}>{t(`${surface}Navigation.selectCategory`)}</p>}
        </div>
      </div>}
    >
      <Button minimal active={active} intent={active ? 'primary' : undefined} alignText="left" icon={surface === 'learning' ? applicationIcons.navigation.learning : applicationIcons.navigation.practice} aria-label={parts.join(' > ')} title={parts.join(' > ')}>
        {!iconOnly && <span className="ui-trigger-path" aria-hidden="true">
          {parts.map((text, index) => <span className={parts.length === 3 && index === 1 ? 'ui-trigger-segment ui-category-segment' : 'ui-trigger-segment'} key={index}>
            {index > 0 && <Icon icon="chevron-right" size={12} />}
            <Breadcrumb text={text} current={index === parts.length - 1} />
          </span>)}
        </span>}
      </Button>
    </PopoverNext>
  </div>
}

const PageBreadcrumb: React.FC<{ surface: Surface; locale: Locale; pathname: string; go: (path: string) => void }> = ({ surface, locale, pathname, go }) => {
  const { t } = useTranslation()
  const location = useLocation()
  const item = catalogItem(surface, locale)
  const isEntry = pathname === item.path
  const isCompletion = pathname === '/completion'
  const rootText = t(surface === 'learning' && isEntry ? 'learning.backToCatalog' : `nav.${surface}`)
  return <nav className="ui-page-breadcrumb" aria-label={copy[locale].breadcrumb}>
    <Breadcrumbs minVisibleItems={1}
      overflowListProps={{ navigationAriaLabel: copy[locale].breadcrumb }}
      overflowButtonProps={{ 'aria-label': copy[locale].moreLevels }}
      items={[
        { text: rootText, ...((isEntry || isCompletion) ? { href: `/${surface}${location.search}`, onClick: (event: React.MouseEvent<HTMLAnchorElement>) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); go(`/${surface}`) } } } : {}) },
        ...(isEntry ? [{ text: item.category }, { text: item.title }] : []),
        ...(isCompletion ? [{ text: t('nav.completion') }] : []),
      ]}
      currentBreadcrumbRenderer={(props) => <span aria-current="page"><Breadcrumb {...props} current /></span>}
    />
  </nav>
}

const styles = `
body[data-ui-prototype-theme] { --ui-bg: ${Colors.LIGHT_GRAY5}; --ui-page: ${Colors.WHITE}; --ui-text: ${Colors.DARK_GRAY1}; --ui-border: ${Colors.LIGHT_GRAY1}; --ui-code: ${Colors.LIGHT_GRAY4}; --ui-selected: ${Colors.BLUE5}; --ui-related: #e1effa; color-scheme: light; }
body[data-ui-prototype-theme='dark'] { --ui-bg: ${Colors.DARK_GRAY1}; --ui-page: ${Colors.DARK_GRAY3}; --ui-text: ${Colors.LIGHT_GRAY5}; --ui-border: ${Colors.GRAY1}; --ui-code: ${Colors.DARK_GRAY2}; --ui-selected: ${Colors.BLUE2}; --ui-related: #234361; color-scheme: dark; }
.ui-real-prototype { height: 100%; min-width: 0; background: var(--ui-bg); color: var(--ui-text); }
.ui-original-shell { height: 100%; background: var(--ui-page); color: var(--ui-text); }
.ui-original-shell .bp6-navbar,
body[data-ui-prototype-theme] .bp6-popover-content > [role='dialog'] { background: var(--ui-page); color: var(--ui-text); }
.ui-real-prototype *, .ui-catalog-panel * { box-sizing: border-box; }
.ui-layout { display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; }
.ui-real-prototype .ui-header { display: flex; align-items: center; gap: 12px; height: 56px; flex: 0 0 56px; padding: 0 24px; z-index: 2; }
.ui-real-prototype .ui-home { flex: 0 0 auto; }
.ui-primary-actions { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }
.ui-utilities { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.ui-navigation-menu { min-width: 0; }
.ui-navigation-menu .bp6-popover-target { display: flex; min-width: 0; }
.ui-navigation-menu .bp6-button { min-width: 0; max-width: 100%; }
.ui-navigation-menu .bp6-button-text { min-width: 0; }
.ui-current-menu { flex: 1; }
.ui-current-menu .bp6-button { width: 100%; }
.ui-d .ui-navigation-menu:not(.ui-current-menu) { flex-shrink: 0; }
.ui-trigger-path { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ui-trigger-segment { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.ui-trigger-segment:first-child { flex-shrink: 0; }
.ui-trigger-segment .bp6-breadcrumb { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-trigger-segment .bp6-icon { flex-shrink: 0; }
.ui-main { min-width: 0; min-height: 0; flex: 1; overflow: auto; padding: 24px 24px 88px; scrollbar-gutter: stable; }
.ui-real-prototype .ui-page-root { margin: 0 auto; width: 100%; max-width: ${contentWidth}px; min-width: 0; padding: 24px 28px; }
.ui-page-breadcrumb { margin-bottom: 24px; min-width: 0; }
.ui-page-breadcrumb .bp6-breadcrumbs { flex-wrap: nowrap; }
.ui-page-breadcrumb .bp6-breadcrumb-current { white-space: normal; overflow-wrap: anywhere; }
.ui-page-content { min-width: 0; }
.ui-real-prototype [data-learning-page] { padding: 0; min-width: 0; }
.ui-real-prototype [data-learning-page] > nav.learning-prose { display: none; }
.ui-real-prototype .learning-prose { max-width: none; margin-inline: 0; }
.ui-real-prototype [data-learning-page] h2 { font-size: 28px; margin: 0 0 16px; }
.ui-real-prototype [data-learning-page] p { line-height: 1.6; }
.ui-real-prototype [data-learning-page] > table { display: block; max-width: 100%; overflow-x: auto; margin: 20px 0; text-align: left; }
.ui-real-prototype [data-learning-page] > table th, .ui-real-prototype [data-learning-page] > table td { padding: 6px 12px 6px 0; white-space: nowrap; }
.ui-real-prototype [data-learning-page] > p:last-child { display: flex; gap: 8px; margin: 24px 0 0; }
.ui-real-prototype .learning-trace { width: 100%; min-width: 0; margin: 24px 0; padding: 16px; border: 1px solid var(--ui-border); border-radius: 4px; overflow: hidden; }
.ui-real-prototype .learning-trace > section { max-width: 100%; overflow-x: auto; }
.ui-real-prototype .learning-trace h3 { margin-top: 0; }
.ui-real-prototype .learning-trace table { border-spacing: 2px; text-align: left; }
.ui-real-prototype .learning-trace th, .ui-real-prototype .learning-trace td { padding-inline: 8px; white-space: nowrap; }
.ui-real-prototype .learning-trace td { padding-block: 20px !important; }
.ui-real-prototype .learning-trace button[data-state] { min-width: 18px; padding: 2px; color: var(--ui-text) !important; background: var(--ui-code); border: 1px solid var(--ui-border) !important; border-radius: 3px; cursor: pointer; }
.ui-real-prototype .learning-trace button[data-state='selected'] { background: var(--ui-selected) !important; outline: 2px solid ${Colors.BLUE3}; }
.ui-real-prototype .learning-trace button[data-state='related'] { background: var(--ui-related) !important; }
body[data-ui-prototype-theme='dark'] .ui-real-prototype [data-lineage] line:is([data-state='selected'], [data-state='related']) { stroke: ${Colors.BLUE5}; }
.ui-real-prototype .ui-page-root[data-surface='practice'] .ui-page-content > div { min-height: 0; }
.ui-real-prototype .ui-page-root[data-surface='practice'] .ui-page-content > div > .bp6-card,
.ui-real-prototype .ui-page-root[data-surface='practice'] .ui-page-content > div > .bp6-card > .bp6-card { min-width: 0; max-width: none; margin: 0; padding: 0; background: transparent; }
.ui-real-prototype .ui-page-root[data-surface='practice'] .ui-page-content > div > .bp6-card > .bp6-card > div { padding: 0; }
.ui-real-prototype .ui-page-content [data-markdown-root] > h1:first-child { margin-top: 0; font-size: 28px; }
.ui-real-prototype .ui-page-content code { background: var(--ui-code); color: var(--ui-text); }
.ui-real-prototype .ui-page-content [data-markdown-root] pre { background: var(--ui-code) !important; color: var(--ui-text) !important; }
.ui-catalog-panel { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; width: min(520px, calc(100vw - 16px)); padding: 16px; background: var(--ui-page); color: var(--ui-text); }
.ui-catalog-panel > div { min-width: 0; }
.ui-catalog-panel h4 { margin: 0 0 12px; }
.ui-catalog-panel button { white-space: normal; overflow-wrap: anywhere; min-height: 36px; }
.ui-catalog-index { margin-top: 12px; }
.ui-layout.ui-b { display: grid; grid-template-columns: 184px minmax(0, 1fr); }
.ui-real-prototype .ui-sidebar { display: flex; flex-direction: column; padding: 16px 12px; border-radius: 0; gap: 24px; z-index: 2; }
.ui-sidebar .ui-home { align-self: flex-start; }
.ui-sidebar .ui-primary-actions { flex-direction: column; align-items: stretch; flex: 0; }
.ui-sidebar .ui-navigation-menu .bp6-button { width: 100%; }
.ui-sidebar .ui-utilities { margin-top: auto; }
.ui-b .ui-page-root { max-width: 1400px; }
.ui-c .ui-page-root { max-width: none; }
.ui-real-prototype .ui-prototype-switcher { position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%); z-index: 15; display: flex; align-items: center; gap: 6px; padding: 6px 8px; max-width: calc(100vw - 16px); white-space: nowrap; }
.ui-prototype-switcher small { margin-inline: 4px; }
@media (max-width: 760px) {
  .ui-real-prototype .ui-header { height: 48px; flex-basis: 48px; padding: 0 8px; gap: 4px; }
  .ui-layout.ui-b { display: flex; }
  .ui-real-prototype .ui-sidebar { flex-direction: row; padding: 8px; gap: 8px; }
  .ui-sidebar .ui-home { margin-right: 8px; }
  .ui-sidebar .ui-primary-actions { flex-direction: row; flex: 1; }
  .ui-sidebar .ui-utilities { margin: 0; }
  .ui-primary-actions { gap: 2px; }
  .ui-main { padding: 12px 12px 80px; }
  .ui-real-prototype .ui-page-root { padding: 16px; }
  .ui-prototype-switcher small { display: none; }
}
@media (max-width: 520px) {
  .ui-layout:not(.ui-d) .ui-header .ui-navigation-menu:not(.ui-current-menu) .ui-trigger-path, .ui-sidebar .ui-trigger-path, .ui-category-segment { display: none; }
  .ui-d .ui-header .bp6-button { padding-inline: 6px; gap: 4px; }
  .ui-d .ui-utilities { gap: 0; }
  .ui-d .ui-navigation-menu button > .bp6-icon, .ui-d .ui-feedback > .bp6-icon { display: none; }
  .ui-trigger-path { gap: 4px; }
  .ui-trigger-segment { gap: 4px; }
  .ui-main { padding: 8px 8px 80px; }
  .ui-real-prototype .ui-page-root { padding: 16px 12px; }
  .ui-real-prototype .learning-trace { padding: 10px; }
}
`

const PrototypeApp: React.FC<{ i18n: PrototypeI18n }> = ({ i18n }) => {
  const { t } = useTranslation()
  const location = useLocation()
  const history = useHistory()
  const locale: Locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US'
  const params = new URLSearchParams(location.search)
  const selected = useRef<Variant>('D')
  const parameter = params.get('variant')
  if (parameter === 'A' || parameter === 'B' || parameter === 'C' || parameter === 'D') selected.current = parameter
  const variant = selected.current
  const [theme, setTheme] = useState<Theme>(readTheme)
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(THEME_STORAGE_KEY, next)
    setTheme(next)
  }
  const surface = location.pathname.startsWith('/learning') ? 'learning' : location.pathname.startsWith('/practice') ? 'practice' : undefined
  const search = `?prototype=ui-optimization&variant=${variant}&lang=${locale}`
  const go = (pathname: string) => history.push({ pathname, search })
  const changeVariant = (value: Variant) => history.replace({ ...location, search: `?prototype=ui-optimization&variant=${value}&lang=${locale}` })
  const cycle = (delta: number) => changeVariant(variants[(variants.indexOf(variant) + delta + variants.length) % variants.length])

  useEffect(() => {
    // Production page links omit demo parameters; retain the chosen preview on navigation.
    if (location.search !== search) history.replace({ ...location, search })
  }, [location, search, history])
  useEffect(() => {
    document.body.dataset.uiPrototypeTheme = theme
    document.body.classList.toggle(Classes.DARK, theme === 'dark')
    document.documentElement.lang = locale
    return () => { delete document.body.dataset.uiPrototypeTheme; document.body.classList.remove(Classes.DARK) }
  }, [theme, locale])
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const followSystem = () => { if (!localStorage.getItem(THEME_STORAGE_KEY)) setTheme(media.matches ? 'dark' : 'light') }
    media.addEventListener('change', followSystem)
    return () => media.removeEventListener('change', followSystem)
  }, [])
  useEffect(() => {
    if (!surface) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('button, a, input, textarea, select, [contenteditable], .learning-trace, .bp6-popover')) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const home = <Button className="ui-home" minimal icon={applicationIcons.navigation.home} aria-label={t('nav.homeAction')} title={t('nav.homeAction')} onClick={() => go('/')} />
  const navigation = <div className="ui-primary-actions">{(['learning', 'practice'] as const).map((entry) => <NavigationMenu key={entry} surface={entry} locale={locale} pathname={location.pathname} go={go} fullPath={(variant === 'C' || variant === 'D') && entry === surface} iconOnly={variant === 'C' && entry !== surface} />)}</div>
  const utilities = <div className="ui-utilities">
    <Button className="ui-feedback" minimal icon={applicationIcons.navigation.feedback} text={variant === 'D' ? t('nav.feedback') : undefined} aria-label={t('nav.feedback')} title={t('nav.feedback')} onClick={() => go('/feedback')} />
    <Button minimal icon={theme === 'dark' ? applicationIcons.state.lightTheme : applicationIcons.state.darkTheme} aria-label={t(theme === 'dark' ? 'light' : 'dark')} title={t(theme === 'dark' ? 'light' : 'dark')} onClick={toggleTheme} />
    <Select<Locale> filterable={false} items={['en-US', 'zh-CN']}
      itemRenderer={(item, { handleClick, modifiers }) => <MenuItem key={item} text={t(`i18n.${item}`)} active={modifiers.active} onClick={handleClick} roleStructure="listoption" />}
      onItemSelect={(value) => { void i18n.changeLanguage(value) }}
    ><Button minimal icon={applicationIcons.navigation.language} aria-label={t('nav.language')} title={t('nav.language')} /></Select>
  </div>

  // Home keeps its real layout and controls while sharing the prototype theme.
  if (!surface) return <div className="ui-original-shell">
    <style>{styles}</style>
    <Shell><Switch>
      <Route exact path="/" component={HomePage} />
      <Route path="/feedback" component={FeedbackPage} />
      <Route path="/completion"><H2>{t('nav.completion')}</H2><p>{copy[locale].completion}</p></Route>
    </Switch></Shell>
  </div>

  return <div className="ui-real-prototype" data-variant={variant}>
    <style>{styles}</style>
    <div className={`ui-layout ui-${variant.toLowerCase()}`}>
      {variant === 'B' ? <Card className="ui-sidebar">{home}{navigation}{utilities}</Card> : <Navbar className="ui-header">{home}{navigation}{utilities}</Navbar>}
      <div className="ui-main">
        <Card className="ui-page-root" data-surface={surface}>
          {surface && variant !== 'C' && <PageBreadcrumb surface={surface} locale={locale} pathname={location.pathname} go={go} />}
          <div className="ui-page-content"><Switch>
            <Route exact path="/learning/xor-intro"><Redirect to={{ pathname: LEARNING_PATH, search }} /></Route>
            <Route path="/learning" component={LearningPage} />
            <Route path="/practice" component={PracticePage} />
          </Switch></div>
        </Card>
      </div>
    </div>
    <Card elevation={2} className="ui-prototype-switcher" aria-label={copy[locale].prototype}>
      <Button minimal icon="chevron-left" aria-label={copy[locale].previous} onClick={() => cycle(-1)} />
      {variants.map((value) => <Button key={value} minimal active={variant === value} aria-pressed={variant === value} onClick={() => changeVariant(value)}>{value}</Button>)}
      <small>{copy[locale].layouts[variant]} · {locale} · {theme}</small>
      <Button minimal icon="chevron-right" aria-label={copy[locale].next} onClick={() => cycle(1)} />
    </Card>
  </div>
}

/** Throwaway #116 UI study on real Learning and Practice pages. */
export const UiOptimizationPrototype: React.FC = () => {
  const [i18n] = useState(() => productionI18n.cloneInstance({
    lng: new URLSearchParams(window.location.search).get('lang') === 'zh-CN' ? 'zh-CN' : 'en-US',
    detection: { caches: [] }, debug: false,
  }))
  const [client] = useState(createFixtureClient)
  return <I18nextProvider i18n={i18n}><BrowserRouter><OverlaysProvider><ApolloProvider client={client}><PrototypeApp i18n={i18n} /></ApolloProvider></OverlaysProvider></BrowserRouter></I18nextProvider>
}
