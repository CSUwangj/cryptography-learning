import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AvalancheDemo } from './AvalancheDemo'
import { SpnDemo } from './SpnDemo'

const Demos: React.FC = () => {
  const [locale, setLocale] = useState<'en-US' | 'zh-CN'>('en-US')
  const Demo = { '/testspn': SpnDemo, '/testavalanche': AvalancheDemo }[window.location.pathname]
  return <>
    <nav>
      <a href="/testspn">/testspn</a> · <a href="/testavalanche">/testavalanche</a> ·{' '}
      <label>Language / 语言 <select value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)}>
        <option value="en-US">English</option>
        <option value="zh-CN">简体中文</option>
      </select></label>
    </nav>
    {Demo && <Demo locale={locale} />}
  </>
}

createRoot(document.getElementById('root')!).render(<Demos />)
