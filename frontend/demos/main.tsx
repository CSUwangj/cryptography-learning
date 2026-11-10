import { useTranslation } from 'react-i18next'
import i18n from '../src/app/i18n'
import React, { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { AesAvalancheDemo } from './AesAvalancheDemo'
import { AesCipherDemo } from './AesCipherDemo'
import { AvalancheDemo } from './AvalancheDemo'
import { SpnDemo } from './SpnDemo'

const SlidingWindowDemo = lazy(() => import('./SlidingWindowDemo').then((module) => ({ default: module.SlidingWindowDemo })))

const SpnV2Demo = lazy(() => import('./SpnV2Demo').then((module) => ({ default: module.SpnV2Demo })))

const Aes192OverlayPrototype = lazy(() => import('./Aes192OverlayPrototype').then((module) => ({ default: module.Aes192OverlayPrototype })))
const LearningShellPrototype = lazy(() => import('./LearningShellPrototype').then((module) => ({ default: module.LearningShellPrototype })))
const UiOptimizationPrototype = lazy(() => import('./UiOptimizationPrototype').then((module) => ({ default: module.UiOptimizationPrototype })))
const LearningDemo = lazy(() => import('./LearningDemo').then((module) => ({ default: module.LearningDemo })))
const HorizontalClassicalCipherPrototype = lazy(() => import('./HorizontalClassicalCipherPrototype').then((module) => ({ default: module.HorizontalClassicalCipherPrototype })))
const ComparisonPrototype = lazy(() => import('./ComparisonPrototype').then((module) => ({ default: module.ComparisonPrototype })))

const Demos: React.FC = () => {
  const { t, i18n } = useTranslation()
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('prototype') === 'shell') {
    return <Suspense fallback={<div role="status" aria-busy="true" />}><LearningShellPrototype /></Suspense>
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('prototype') === 'ui-optimization') {
    return <Suspense fallback={<div role="status" aria-busy="true" />}><UiOptimizationPrototype /></Suspense>
  }
  if (window.location.pathname === '/horizontal-classical-cipher') {
    return <Suspense fallback={<div role="status" aria-busy="true" />}><HorizontalClassicalCipherPrototype /></Suspense>
  }
  if (import.meta.env.DEV && window.location.pathname === '/testaescipher' && new URLSearchParams(window.location.search).get('prototype') === 'overlay') {
    return <Suspense fallback={<div role="status" aria-busy="true" />}><Aes192OverlayPrototype /></Suspense>
  }
  if (window.location.pathname === '/testspnv2') {
    return <Suspense fallback={<div role="status" aria-busy="true" />}><SpnV2Demo /></Suspense>
  }
  if (window.location.pathname === '/learning' || window.location.pathname.startsWith('/learning/')) {
    return <Suspense fallback={<div role="status" aria-busy="true" />}><LearningDemo /></Suspense>
  }
  const Demo = {
    '/testspn': SpnDemo,
    '/testavalanche': AvalancheDemo,
    '/testkeyexpansion': SlidingWindowDemo,
    '/testaescipher': AesCipherDemo,
    '/testaesavalanche': import.meta.env.DEV && new URLSearchParams(window.location.search).get('prototype') === 'comparison' ? ComparisonPrototype : AesAvalancheDemo,
  }[window.location.pathname]
  return <>
    <nav>
      <a href="/testspn">/testspn</a> · <a href="/testspnv2">{t('spnV2.title', { ns: 'demos' })}</a> · <a href="/testavalanche">/testavalanche</a> · <a href="/testkeyexpansion">/testkeyexpansion</a> · <a href="/testaescipher">/testaescipher</a> · <a href="/testaesavalanche">/testaesavalanche</a> · <a href="/learning">{t('learning.link', { ns: 'demos' })}</a> · <a href="/horizontal-classical-cipher">Classical Cipher Prototype</a> ·{' '}
      <label>{t('nav.language')} <select value={i18n.resolvedLanguage ?? 'en-US'} onChange={(event) => { void i18n.changeLanguage(event.target.value) }}>
        <option value="en-US">{t('i18n.en-US')}</option>
        <option value="zh-CN">{t('i18n.zh-CN')}</option>
      </select></label>
    </nav>
    {Demo && <Suspense fallback={<div role="status" aria-busy="true" />}><Demo /></Suspense>}
  </>
}

const requestedLanguage = new URLSearchParams(window.location.search).get('lang')
if (requestedLanguage) await i18n.changeLanguage(requestedLanguage)

createRoot(document.getElementById('root')!).render(<Demos />)
