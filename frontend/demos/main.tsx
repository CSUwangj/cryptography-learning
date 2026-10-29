import { useTranslation } from 'react-i18next'
import i18n from '../src/app/i18n'
import React, { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { AesAvalancheDemo } from './AesAvalancheDemo'
import { AesCipherDemo } from './AesCipherDemo'
import { AvalancheDemo } from './AvalancheDemo'
import { SpnDemo } from './SpnDemo'
import { KeyExpansionPrototype } from './KeyExpansionPrototype'

const Aes192OverlayPrototype = lazy(() => import('./Aes192OverlayPrototype').then((module) => ({ default: module.Aes192OverlayPrototype })))
const LearningShellPrototype = lazy(() => import('./LearningShellPrototype').then((module) => ({ default: module.LearningShellPrototype })))
const UiOptimizationPrototype = lazy(() => import('./UiOptimizationPrototype').then((module) => ({ default: module.UiOptimizationPrototype })))

const Demos: React.FC = () => {
  const { t, i18n } = useTranslation()
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('prototype') === 'shell') {
    return <Suspense fallback={<div role="status" aria-busy="true" />}><LearningShellPrototype /></Suspense>
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('prototype') === 'ui-optimization') {
    return <Suspense fallback={<div role="status" aria-busy="true" />}><UiOptimizationPrototype /></Suspense>
  }
  if (import.meta.env.DEV && window.location.pathname === '/testaescipher' && new URLSearchParams(window.location.search).get('prototype') === 'overlay') {
    return <Suspense fallback={<div role="status" aria-busy="true" />}><Aes192OverlayPrototype /></Suspense>
  }
  const Demo = {
    '/testspn': SpnDemo,
    '/testavalanche': AvalancheDemo,
    '/testkeyexpansion': KeyExpansionPrototype,
    '/testaescipher': AesCipherDemo,
    '/testaesavalanche': AesAvalancheDemo,
  }[window.location.pathname]
  return <>
    <nav>
      <a href="/testspn">/testspn</a> · <a href="/testavalanche">/testavalanche</a> · <a href="/testkeyexpansion">/testkeyexpansion</a> · <a href="/testaescipher">/testaescipher</a> · <a href="/testaesavalanche">/testaesavalanche</a> ·{' '}
      <label>{t('nav.language')} <select value={i18n.resolvedLanguage ?? 'en-US'} onChange={(event) => { void i18n.changeLanguage(event.target.value) }}>
        <option value="en-US">{t('i18n.en-US')}</option>
        <option value="zh-CN">{t('i18n.zh-CN')}</option>
      </select></label>
    </nav>
    {Demo && <Demo />}
  </>
}

const requestedLanguage = new URLSearchParams(window.location.search).get('lang')
if (requestedLanguage) await i18n.changeLanguage(requestedLanguage)

createRoot(document.getElementById('root')!).render(<Demos />)
