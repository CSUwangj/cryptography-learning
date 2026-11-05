// #128: existing horizontal comparison format in the real presentation component; fixed AES word excerpts.
import { Button, Card } from '@blueprintjs/core'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LearningPresentationView, type LearningPresentation, type LearningRow } from '../src/ui/learning'
import '../src/app/App.css'

import enUS from './comparisonPrototype.en-US.json'
import zhCN from './comparisonPrototype.zh-CN.json'

const copy = { 'en-US': enUS, 'zh-CN': zhCN } as const

type Copy = typeof copy[keyof typeof copy]

// shortcut: fixed 32-bit excerpts, replace with Worker comparison results during v2 integration.
const comparisonPrototypePresentation = (text: Copy, executionIdentity: string): LearningPresentation => {
  const row = (id: string, label: string, baseline: string, changed: string, source?: string, byteDependency = false): LearningRow => {
    const baselineBits = BigInt(`0x${baseline}`).toString(2).padStart(32, '0')
    const changedBits = BigInt(`0x${changed}`).toString(2).padStart(32, '0')
    return {
      id, label,
      cells: [{ value: `0x${baseline} | 0x${changed}` }],
      bitGrouping: { size: 8 },
      selectableBits: [...baselineBits].map((value, bit) => ({
        id: `${id}:${bit}`, bit, value,
        comparisonValue: changedBits[bit] === '1' ? '1' : '0',
        ariaLabel: `${label}, ${text.bit} ${bit}`,
      })),
      relationships: source ? Array.from({ length: 32 }, (_, bit) =>
        Array.from({ length: byteDependency ? 8 : 1 }, (_, offset) => ({
          from: `${source}:${byteDependency ? Math.floor(bit / 8) * 8 + offset : bit}`,
          to: `${id}:${bit}`,
        }))).flat() : [],
    }
  }
  const input = row('input', text.input, '00112233', '00112233')
  const key = row('key', text.key, '00010203', '80010203')
  const xor = row('xor', text.xor, '00102030', '80102030', 'input')
  const sub = row('sub', text.sub, '63cab704', 'cdcab704', 'xor', true)
  const original = row('original', text.original, '00010203', '80010203')
  const roundKey = row('schedule-key', text.key, '00010203', '80010203', 'original')
  const word = row('word', text.word, 'd6aa74fd', '56aa74fd', 'original')
  return {
    title: text.trace,
    executionIdentity,
    comparison: { baselineLabel: text.baseline, changedLabel: text.changed, differentLabel: text.different },
    selectionStatus: (selected) => selected ? `${text.selected}: ${selected.ariaLabel}` : text.empty,
    unitSelection: {
      label: text.size,
      sizeLabel: (size) => `${size} ${text.bits}`,
      rangeLabel: (selectedRow, start, end, value) => `${selectedRow.label}, ${text.bits} ${start}-${end}: ${value}`,
      selectedLabel: text.selected,
      relatedLabel: text.related,
    },
    sections: [{
      kind: 'trace', caption: text.trace,
      headers: [text.stage, `${text.baseline} | ${text.changed}`, text.units],
      rows: [input, {
        ...key,
        selectableKey: { id: 'key-chip', value: text.key, ariaLabel: text.open },
      }, {
        ...xor,
        relationships: [...xor.relationships!, ...Array.from({ length: 32 }, (_, bit) => ({ from: `key:${bit}`, to: `xor:${bit}` }))],
      }, sub],
    }],
    keyExpansionLane: {
      caption: text.schedule, closeLabel: text.close,
      headers: [text.schedule, text.units],
      sharedSelection: { toggleLabel: text.open, clearLabel: text.clear },
      rows: [original, roundKey, word].map((item, index) => ({
        ...item,
        cells: [{ value: item.label }],
        anchor: ['input', 'key', 'sub'][index],
      })),
    },
  }
}

export const ComparisonPrototype: React.FC = () => {
  const { i18n } = useTranslation()
  const text = copy[i18n.resolvedLanguage === 'zh-CN' ? 'zh-CN' : 'en-US']
  const [dark, setDark] = useState(document.body.classList.contains('bp6-dark'))
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    document.body.classList.add('app')
    return () => document.body.classList.remove('app')
  }, [])
  useEffect(() => { document.body.classList.toggle('bp6-dark', dark) }, [dark])
  return <main style={{ margin: '0 auto', maxWidth: 1200, padding: 20 }}>
    <h1>{text.title}</h1>
    <p>{text.scope}</p>
    <Button active={dark} aria-pressed={dark} onClick={() => setDark(!dark)}>{text.theme}</Button>{' '}
    <Button onClick={() => setRevision(revision + 1)}>{text.reset}</Button>
    <p>{text.legend}</p>
    <Card><LearningPresentationView presentation={comparisonPrototypePresentation(text, `fixture-${revision}`)} /></Card>
  </main>
}
