import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { WorkerExecutionSnapshot } from '../src/crypto_graph'
import { createBrowserLessonSession, type LessonSessionState } from '../src/lesson_runtime'
import { learningColors } from '../src/ui/learning'
import { RenderHost, visualizerCatalog } from '../src/visualizers'
import { teachingSpnDemoDocuments } from './teachingSpnLesson'

type Locale = 'en-US' | 'zh-CN'

// PROTOTYPE: throwaway reference for the aligned key-expansion lane (issue #83).
const copy = {
  'en-US': {
    title: 'SPN key expansion prototype',
    subtitle: 'PROTOTYPE — select any round-key chip to show how the master key expands into round keys, aligned with the encryption trace.',
    plaintext: 'Plaintext',
    masterKey: 'Master key',
    run: 'Run SPN',
    failure: 'Could not run this SPN execution.',
    expansion: 'Key expansion',
    rule: 'Round key r is the 16-bit window of the master key starting at bit 4(r−1).',
    close: 'Close key expansion',
    chip: 'Key expansion round',
    bit: 'bit',
    // Must match the Teaching SPN renderer's round-key chip aria-label prefix.
    traceKeys: 'Round keys',
  },
  'zh-CN': {
    title: 'SPN 密钥扩展原型',
    subtitle: '原型 — 选择任一轮密钥芯片，查看主密钥如何扩展为轮密钥，并与加密轨迹逐行对齐。',
    plaintext: '明文',
    masterKey: '主密钥',
    run: '运行 SPN',
    failure: '无法运行此 SPN 执行。',
    expansion: '密钥扩展',
    rule: '第 r 轮密钥是主密钥从第 4(r−1) 位开始的 16 位窗口。',
    close: '关闭密钥扩展',
    chip: '密钥扩展轮',
    bit: '位',
    traceKeys: '轮密钥',
  },
} as const

const rounds = 2
const windowStart = (round: number): number => 4 * (round - 1)
const masterBits = (masterKey: string): readonly number[] =>
  BigInt(masterKey).toString(2).padStart(32, '0').split('').map(Number)
const roundKeyHex = (bits: readonly number[], round: number): string =>
  `0x${parseInt(bits.slice(windowStart(round), windowStart(round) + 16).join(''), 2).toString(16).padStart(4, '0')}`

const documentsFor = (masterKey: string) => {
  const bits = masterBits(masterKey)
  const keys = Array.from({ length: rounds }, (_, index) => `"${roundKeyHex(bits, index + 1)}"`).join(', ')
  return { ...teachingSpnDemoDocuments, lesson: teachingSpnDemoDocuments.lesson.replace('roundKeys: ["0x0f0f", "0xf0f0"]', `roundKeys: [${keys}]`) }
}

/** Trace rows in the order the Teaching SPN renderer emits them. */
const traceRows = (execution: WorkerExecutionSnapshot) => execution.trace.flatMap((event) =>
  'value' in event && event.value?.type.family === 'bits' && 'bytes' in event.value ? [{ stage: event.stage, round: event.round }] : [])

type Layout = { readonly left: number; readonly top: number; readonly width: number; readonly height: number; readonly header: number; readonly rows: readonly { readonly top: number; readonly height: number }[] }

const cell = 16
const labelWidth = 190
const bitX = (bit: number): number => labelWidth + bit * cell + Math.floor(bit / 4) * 4

const KeyExpansionOverlay: React.FC<{
  readonly text: typeof copy[Locale]
  readonly layout: Layout
  readonly execution: WorkerExecutionSnapshot
  readonly bits: readonly number[]
  readonly masterKey: string
  readonly open: number
  readonly setOpen: (round: number | undefined) => void
}> = ({ text, layout, execution, bits, masterKey, open, setOpen }) => {
  const [selected, setSelected] = useState<number>()
  const rows = traceRows(execution)
  const masterRow = rows.findIndex((row) => row.stage === 'input')
  const keyRow = (round: number) => rows.findIndex((row) => row.stage === 'round-key' && row.round === round)
  const middle = (row: number) => layout.rows[row] ? layout.rows[row].top + layout.rows[row].height / 2 : 0
  const inWindow = (bit: number, round: number) => bit >= windowStart(round) && bit < windowStart(round) + 16
  const bitColor = (bit: number, round?: number): string =>
    selected !== undefined
      ? bit === selected ? learningColors.selected : learningColors.canvas
      : round === open || (round === undefined && inWindow(bit, open)) ? learningColors.related : learningColors.canvas
  const bitCell = (bit: number, row: number, round?: number) => <button
    aria-label={`${round === undefined ? text.masterKey : `K${round}`} ${text.bit} ${round === undefined ? bit : bit - windowStart(round)}: ${bits[bit]}`}
    aria-pressed={bit === selected}
    key={`${row}-${bit}`}
    onClick={() => setSelected(bit === selected ? undefined : bit)}
    style={{ background: bitColor(bit, round), border: `1px solid ${learningColors.border}`, color: learningColors.text, fontSize: 11, height: 20, left: bitX(bit), padding: 0, position: 'absolute', top: middle(row) - 10, width: cell }}
    type="button"
  >{bits[bit]}</button>

  return <div aria-label={text.expansion} role="region" style={{ background: 'white', border: `1px solid ${learningColors.border}`, boxShadow: '0 2px 8px rgba(0,0,0,.2)', height: layout.height, left: layout.left, position: 'absolute', top: layout.top, width: layout.width, zIndex: 1 }}>
    <div style={{ alignItems: 'center', display: 'flex', gap: 8, height: layout.header, padding: '0 8px' }}>
      <strong>{text.expansion}</strong><small style={{ color: learningColors.mutedText }}>{text.rule}</small>
      <button aria-label={text.close} onClick={() => setOpen(undefined)} style={{ marginLeft: 'auto' }} type="button">×</button>
    </div>
    <svg aria-hidden="true" height={layout.height} style={{ left: 0, pointerEvents: 'none', position: 'absolute', top: 0 }} width={layout.width}>
      {Array.from({ length: rounds }, (_, index) => index + 1).flatMap((round) => Array.from({ length: 16 }, (_, offset) => {
        const bit = windowStart(round) + offset
        const highlighted = selected === undefined ? round === open : bit === selected
        return <line
          key={`${round}-${bit}`}
          stroke={highlighted ? learningColors.text : learningColors.border}
          strokeWidth={highlighted ? 2 : 1}
          x1={bitX(bit) + cell / 2}
          x2={bitX(bit) + cell / 2}
          y1={middle(masterRow) + 10}
          y2={middle(keyRow(round)) - 10}
        />
      }))}
    </svg>
    <span style={{ left: 8, position: 'absolute', top: middle(masterRow) - 9 }}>{text.masterKey} <code>{masterKey}</code></span>
    {bits.map((_, bit) => bitCell(bit, masterRow))}
    {Array.from({ length: rounds }, (_, index) => index + 1).map((round) => {
      const key = roundKeyHex(bits, round)
      return <React.Fragment key={round}>
        <span style={{ left: 8, position: 'absolute', top: middle(keyRow(round)) - 11 }}>
          <button
            aria-label={`${text.chip} ${round}: ${key}`}
            aria-pressed={round === open}
            onClick={() => setOpen(round === open ? undefined : round)}
            style={{ background: round === open ? learningColors.selected : undefined, borderColor: learningColors.border, color: learningColors.text }}
            type="button"
          >{key}</button>{' '}
          <code>K{round} = K[{windowStart(round)}..{windowStart(round) + 15}]</code>
        </span>
        {Array.from({ length: 16 }, (_, offset) => bitCell(windowStart(round) + offset, keyRow(round), round))}
      </React.Fragment>
    })}
  </div>
}

export const KeyExpansionPrototype: React.FC<{ readonly locale: Locale }> = ({ locale }) => {
  const text = copy[locale]
  const [plaintext, setPlaintext] = useState('0x1234')
  const [masterKey, setMasterKey] = useState('0x0f0f0f0f')
  const [run, setRun] = useState({ plaintext: '0x1234', masterKey: '0x0f0f0f0f' })
  const [state, setState] = useState<LessonSessionState>()
  const [failure, setFailure] = useState<string>()
  const [invocation, setInvocation] = useState<{ readonly id: string }>()
  const [open, setOpen] = useState<number>()
  const [layout, setLayout] = useState<Layout>()
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const created = createBrowserLessonSession(documentsFor(run.masterKey), locale, visualizerCatalog)
    if (!created.ok) {
      setFailure(created.diagnostics[0]?.message ?? text.failure)
      return
    }
    let active = true
    const updated = created.value.setInput('plaintext', run.plaintext)
    if (!updated.ok) {
      setFailure(updated.diagnostics[0]?.message ?? text.failure)
      return () => created.value.dispose()
    }
    setInvocation(created.value.lesson.steps[0].visualizer)
    void created.value.next().then((result) => {
      if (!active) return
      if (result.ok) {
        setFailure(undefined)
        setState(result.value)
      } else setFailure(result.diagnostics[0]?.message ?? text.failure)
    })
    return () => {
      active = false
      created.value.dispose()
    }
  }, [locale, run, text.failure])

  const execution = state?.snapshots.visualize

  useLayoutEffect(() => {
    const measure = () => {
      const wrapper = container.current
      const table = wrapper?.querySelector('table')
      const head = table?.querySelector('thead tr')
      const body = table ? [...table.querySelectorAll('tbody tr')] : []
      const firstCovered = body[0]?.children[3]
      if (!wrapper || !table || !head || !firstCovered) return setLayout(undefined)
      const origin = wrapper.getBoundingClientRect()
      const tableBox = table.getBoundingClientRect()
      const headBox = head.getBoundingClientRect()
      const left = firstCovered.getBoundingClientRect().left - origin.left
      const top = headBox.top - origin.top
      setLayout({
        left,
        top,
        width: Math.max(tableBox.right - origin.left - left, bitX(32) + 8),
        height: tableBox.bottom - headBox.top,
        header: headBox.height,
        rows: body.map((row) => { const box = row.getBoundingClientRect(); return { top: box.top - headBox.top, height: box.height } }),
      })
    }
    if (open === undefined) return
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, execution])

  // PROTOTYPE seam: the shared view exposes no chip-selection callback, so chip clicks are detected by aria-label.
  const onChipClick = (event: React.MouseEvent) => {
    const chip = (event.target as HTMLElement).closest('button')
    const label = chip?.getAttribute('aria-label') ?? ''
    if (!label.startsWith(`${text.traceKeys}:`) || !container.current) return
    const chips = [...container.current.querySelectorAll('button')].filter((button) => button.getAttribute('aria-label')?.startsWith(`${text.traceKeys}:`))
    const round = chips.indexOf(chip as HTMLButtonElement) + 1
    setOpen(round === open ? undefined : round)
  }

  return <main style={{ margin: '0 auto', maxWidth: 1200, padding: 20 }}>
    <h1>{text.title}</h1>
    <p>{text.subtitle}</p>
    <form onSubmit={(event) => {
      event.preventDefault()
      setOpen(undefined)
      setRun({ plaintext, masterKey })
    }}>
      <label>{text.plaintext} <input pattern="0x[0-9a-fA-F]{4}" required value={plaintext} onChange={(event) => setPlaintext(event.target.value)} /></label>{' '}
      <label>{text.masterKey} <input pattern="0x[0-9a-fA-F]{8}" required value={masterKey} onChange={(event) => setMasterKey(event.target.value)} /></label>{' '}
      <button type="submit">{text.run}</button>
    </form>
    {failure && <p role="alert">{failure}</p>}
    <div onClickCapture={onChipClick} ref={container} style={{ position: 'relative' }}>
      {execution && invocation && <RenderHost
        dimensions={{ width: 1100, height: 700 }}
        execution={execution}
        executionIdentity={state.executionIdentities.visualize ?? 'key-expansion-prototype'}
        invocation={invocation}
        locale={locale}
        reducedMotion={window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false}
      />}
      {execution && open !== undefined && layout && <KeyExpansionOverlay
        bits={masterBits(run.masterKey)}
        execution={execution}
        layout={layout}
        masterKey={run.masterKey}
        open={open}
        setOpen={setOpen}
        text={text}
      />}
    </div>
  </main>
}
