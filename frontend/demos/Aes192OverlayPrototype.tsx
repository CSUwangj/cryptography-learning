// PROTOTYPE: four AES-192 surface/anchor variants on /testaescipher?prototype=overlay&variant=A.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Global } from '@emotion/react'
import styled from '@emotion/styled'
import { Icon } from '@blueprintjs/core'
import { ComparisonRow, LineageDiagram, TraceTable, ValueCell, type LearningRelationship } from '../src/ui/learning'
import { alignedRows, bitRanges, prototypeData, range, selectedLineage, type PrototypeDirection, type PrototypeLocale, type PrototypeRow } from './aes192OverlayPrototypeData'

const copy = {
  'en-US': {
    title: 'AES-192 overlay', prototype: 'P0 prototype', forward: 'Forward: rk0 → rk1 → rk2', reverse: 'Reverse slice: rk2 → rk1 → rk0',
    direction: 'Key consumption', grain: 'Selection', units: 'Byte / word', bits: 'Bit', cipher: 'Cipher state', schedule: 'Key schedule',
    side: 'Side by side', cover: 'Covering lane', key: 'Round-key row', operation: 'AddRoundKey row',
    previous: 'Previous variant', next: 'Next variant', clear: 'Clear selection', close: 'Close key schedule', open: 'Open key schedule',
    stage: 'Operation / key', value: 'Value', selected: 'Selected', none: 'No selection', byte: 'Byte', word: 'Word', bit: 'Bit',
    source: 'Source order', related: 'Related bits', details: 'Bit lineage', row: 'Row', range: 'Bit positions', count: 'Count',
    initial: 'Initial key', batch: 'Generated batch 0', anchors: 'Anchors', full: 'Full AES-192 execution',
    language: 'Language', all: 'All demos', hidden: 'Cipher controls covered', generation: 'Original schedule order',
  },
  'zh-CN': {
    title: 'AES-192 overlay', prototype: 'P0 原型', forward: '正向：rk0 → rk1 → rk2', reverse: '倒序片段：rk2 → rk1 → rk0',
    direction: '轮密钥消费', grain: '选择粒度', units: '字节 / 字', bits: '位', cipher: '密码状态', schedule: '密钥编排',
    side: '并列', cover: '覆盖层', key: '轮密钥行', operation: 'AddRoundKey 行',
    previous: '上一个方案', next: '下一个方案', clear: '清除选择', close: '关闭密钥编排', open: '打开密钥编排',
    stage: '操作 / 轮密钥', value: '值', selected: '已选择', none: '未选择', byte: '字节', word: '字', bit: '位',
    source: '原始顺序', related: '关联位', details: '位依赖', row: '行', range: '位编号', count: '数量',
    initial: '初始密钥', batch: '生成批次 0', anchors: '锚点', full: '完整 AES-192 执行',
    language: '语言', all: '全部 demo', hidden: '密码位操作区已覆盖', generation: '密钥编排原始顺序',
  },
} as const
const variants = [
  { key: 'A', surface: 'side', anchor: 'key' },
  { key: 'B', surface: 'side', anchor: 'operation' },
  { key: 'C', surface: 'cover', anchor: 'key' },
  { key: 'D', surface: 'cover', anchor: 'operation' },
] as const
const Page = styled.main`
  color: #25302d; padding: 20px 24px 104px; font: 14px/1.45 system-ui, sans-serif;
  h1 { font-size: 24px; margin: 4px 0 16px; }
  button, select { font: inherit; color: inherit; }
  button { cursor: pointer; }
  button:focus-visible, select:focus-visible, summary:focus-visible { outline: 3px solid #b84359; outline-offset: 3px; }
  .eyebrow { color: #646d69; font-size: 12px; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: 12px 24px; margin-bottom: 16px; }
  .toolbar label { display: grid; gap: 4px; }
  fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
  legend { padding: 0 0 4px; }
  .segmented { display: flex; }
  .segmented button { background: white; border: 1px solid #a3aea8; padding: 7px 10px; font-size: 12px; min-height: 34px; }
  .segmented button:first-child { border-radius: 4px 0 0 4px; }
  .segmented button:last-child { border-radius: 0 4px 4px 0; }
  .segmented button[aria-pressed=true] { background: #244f3d; color: white; }
  select { background: white; border: 1px solid #a3aea8; border-radius: 4px; min-height: 34px; padding: 4px 8px; }
  .icon { display: inline-flex; align-items: center; justify-content: center; background: white; border: 1px solid #a3aea8; border-radius: 4px; width: 34px; height: 34px; flex-shrink: 0; }
  .status { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 0; min-height: 30px; border-top: 1px solid #d6dcd8; }
  .status output { overflow-wrap: anywhere; }
  .legend { display: flex; flex-wrap: wrap; gap: 10px 24px; color: #56635c; font-size: 12px; padding-bottom: 12px; }
  .legend code { color: #244f3d; }
  .viewport { overflow: auto; border-block: 1px solid #ccd5cf; max-height: 68vh; }
  .canvas { position: relative; width: max-content; min-width: 100%; }
  table { border-collapse: separate; border-spacing: 0; width: 100%; text-align: left; }
  caption { text-align: left; font-weight: 600; padding: 10px; background: #eef2ef; }
  thead th { position: sticky; top: 0; z-index: 3; background: #edf2ef; padding: 10px; border-bottom: 1px solid #a3aea8; font-size: 12px; }
  tbody th, tbody td { padding: 22px 10px; height: 88px; box-sizing: border-box; border-bottom: 1px solid #e0e5e1; vertical-align: middle; }
  tbody th { font-weight: 500; width: 130px; min-width: 130px; }
  .rowlabel { width: 125px; display: grid; gap: 4px; position: relative; z-index: 2; }
  .rowlabel code { max-width: 125px; overflow-wrap: anywhere; font-size: 11px; font-weight: 400; color: #57645e; }
  .rowlabel small { color: #637168; font-size: 11px; font-weight: 400; }
  .schedule-label { border-left: 2px solid #98b5a6; }
  .schedule-label, .schedule-units { background-color: #f2f8f3; }
  .units { display: flex; gap: 3px; position: relative; z-index: 2; }
  .unit { flex: 0 0 auto; display: grid; align-content: center; gap: 1px; background: #fff; border: 1px solid #a4b3aa; border-radius: 3px; padding: 2px; height: 45px; font-family: ui-monospace, monospace; font-size: 12px; }
  .unit small { font-size: 9px; color: #66746c; min-height: 12px; }
  .unit[data-related=true] { background: #def0e5; border-color: #467b5c; box-shadow: inset 0 -3px #467b5c; }
  .unit[aria-pressed=true] { background: #ffe8ee; border: 2px solid #a03853; }
  .anchor-tag { background: #244f3d; color: white; border-radius: 3px; font: 11px/1.5 ui-monospace, monospace; padding: 1px 5px; width: fit-content; }
  .key-toggle { border: 1px solid #70917f; border-radius: 3px; background: #eaf3ed; text-align: left; padding: 4px 8px; }
  [data-lineage] { z-index: 1; }
  [data-lineage] line[data-state=default] { stroke: #8ea499; stroke-opacity: .2; }
  [data-lineage] line[data-state=related] { stroke: #285c40; stroke-opacity: .8; }
  details { margin-top: 18px; }
  summary { cursor: pointer; font-weight: 600; }
  .audit { overflow-x: auto; }
  .audit td, .audit th { padding: 7px 10px; height: auto; }
  .audit code { white-space: normal; overflow-wrap: anywhere; }
  .switcher { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; align-items: center; background: #25332c; color: white; border-radius: 6px; padding: 8px; z-index: 10; box-shadow: 0 3px 12px #0003; max-width: calc(100vw - 24px); }
  .switcher output { min-width: 220px; text-align: center; font-size: 12px; }
  .switcher .icon { background: transparent; color: white; }
  @media (max-width: 600px) { padding: 16px 12px 110px; .toolbar { gap: 10px; } .switcher { gap: 4px; } .switcher output { min-width: 190px; } h1 { font-size: 22px; } }
`

export const Aes192OverlayPrototype: React.FC = () => {
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search))
  const locale: PrototypeLocale = query.get('lang') === 'zh-CN' ? 'zh-CN' : 'en-US'
  const direction: PrototypeDirection = query.get('direction') === 'reverse' ? 'reverse' : 'forward'
  const variant = variants.find((item) => item.key === query.get('variant')) ?? variants[0]
  const text = copy[locale]
  const [bitMode, setBitMode] = useState(false)
  const [openKey, setOpenKey] = useState<number>()
  const [selection, setSelection] = useState<{ row: string; start: number; width: number }>()
  const data = useMemo(() => prototypeData(locale, direction), [locale, direction])
  const seeds = useMemo(() => selection ? range(selection.width, selection.start).map((bit) => `${selection.row}#${bit}`) : [], [selection])
  const related = useMemo(() => selectedLineage(data, seeds), [data, seeds])
  const rows = useMemo(() => alignedRows(data, variant.anchor), [data, variant.anchor])
  const cover = variant.surface === 'cover' && openKey !== undefined
  const canvas = useRef<HTMLDivElement>(null)
  const targets = useRef(new Map<string, HTMLButtonElement>())
  const [geometry, setGeometry] = useState({ width: 0, height: 0, locations: new Map<string, { x: number; y: number }>() })
  const update = (name: string, value: string) => {
    const next = new URLSearchParams(window.location.search)
    next.set(name, value)
    window.history.replaceState(null, '', `${window.location.pathname}?${next}`)
    setQuery(next)
    if (name === 'direction') { setSelection(undefined); setOpenKey(undefined) }
  }
  const cycle = (offset: number) => update('variant', variants[(variants.indexOf(variant) + offset + variants.length) % variants.length].key)
  useEffect(() => {
    const onPop = () => setQuery(new URLSearchParams(window.location.search))
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, button, [contenteditable=true]')) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1) }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('popstate', onPop)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('popstate', onPop) }
  })
  useLayoutEffect(() => {
    const measure = () => {
      if (!canvas.current) return
      const origin = canvas.current.getBoundingClientRect()
      const locations = new Map<string, { x: number; y: number }>()
      targets.current.forEach((target, id) => {
        const box = target.getBoundingClientRect()
        locations.set(id, { x: box.left - origin.left + box.width / 2, y: box.top - origin.top + box.height / 2 })
      })
      setGeometry({ width: origin.width, height: origin.height, locations })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [rows, cover, bitMode, locale, variant.surface])

  const unitId = (row: PrototypeRow, bit: number) => `${row.id}@${Math.floor(bit / (bitMode ? 1 : row.unit))}`
  const displayEdges = useMemo(() => {
    const byId = new Map(data.allRows.map((row) => [row.id, row]))
    const edges = new Map<string, LearningRelationship>()
    for (const edge of data.relationships) {
      if (edge.from[0] !== edge.to[0]) continue
      const [fromRow, fromBit] = edge.from.split('#')
      const [toRow, toBit] = edge.to.split('#')
      const from = unitId(byId.get(fromRow)!, Number(fromBit))
      const to = unitId(byId.get(toRow)!, Number(toBit))
      const id = `${from}>${to}`
      const highlighted = related.has(edge.from) && related.has(edge.to)
      if (!edges.has(id) || highlighted) edges.set(id, { from, to, state: highlighted ? 'related' : 'default' })
    }
    return [...edges.values()]
  }, [data, related, bitMode])

  const audit = data.allRows.map((row) => ({ row, bits: range(row.bitValues.length).filter((bit) => related.has(`${row.id}#${bit}`)) })).filter((item) => item.bits.length)
  useEffect(() => {
    console.info('AES-192 prototype state', { variant: variant.key, surface: variant.surface, anchor: variant.anchor, direction, openKey, selection, seeds, related: audit.map(({ row, bits }) => ({ row: row.id, bits })), scheduleOrder: data.scheduleRows.map((row) => ({ id: row.id, sourceOrder: row.sourceOrder })) })
  }, [variant, direction, openKey, selection, seeds, related, data])

  const renderUnits = (row: PrototypeRow) => {
    const width = bitMode ? 1 : row.unit
    return <div className="units">{range(row.bitValues.length / width).map((index) => {
      const start = index * width
      const positions = range(width, start)
      const active = positions.filter((bit) => related.has(`${row.id}#${bit}`))
      const value = parseInt(row.bitValues.slice(start, start + width).join(''), 2).toString(width === 1 ? 2 : 16).padStart(Math.ceil(width / 4), '0')
      const name = width === 1 ? text.bit : width === 8 ? text.byte : text.word
      const id = unitId(row, start)
      return <button className="unit" type="button" key={id} data-unit-id={id} data-related={active.length > 0} data-related-bits={active.join(',')}
        style={{ width: width === 32 ? 80 : width === 8 ? 28 : 22 }}
        aria-label={`${row.label}, ${name} ${index}, ${text.range} ${start}..${start + width - 1}: ${value}, ${text.related} ${active.length}/${width}`}
        aria-pressed={selection?.row === row.id && selection.start === start && selection.width === width}
        title={`${text.range}: ${start}..${start + width - 1}; ${text.related}: ${bitRanges(active) || '0'}`}
        ref={(target) => { if (target) targets.current.set(id, target); else targets.current.delete(id) }}
        onClick={() => setSelection({ row: row.id, start, width })}>
        <small>{index}</small><span>{value}</span><small>{active.length ? `${active.length}/${width}` : '\u00a0'}</small>
      </button>
    })}</div>
  }
  const scheduleLabel = (row: PrototypeRow, anchor?: number) => <div className="rowlabel">
    {anchor !== undefined && <span className="anchor-tag">rk{anchor}</span>}
    <span>{row.label}</span><small>{text.source} {row.sourceOrder} · {row.words}</small><code>{row.value}</code>
  </div>
  const selectedRow = data.allRows.find((row) => row.id === selection?.row)

  return <Page data-prototype="aes192-overlay" data-variant={variant.key} data-direction={direction}>
    <Global styles={{ body: { margin: 0, background: '#fff' }, '*': { boxSizing: 'border-box' } }} />
    <div className="eyebrow">{text.prototype} · #95</div>
    <h1>{text.title}</h1>
    <div className="toolbar">
      <fieldset><legend>{text.direction}</legend><div className="segmented">
        <button type="button" aria-pressed={direction === 'forward'} onClick={() => update('direction', 'forward')}>{text.forward}</button>
        <button type="button" aria-pressed={direction === 'reverse'} onClick={() => update('direction', 'reverse')}>{text.reverse}</button>
      </div></fieldset>
      <fieldset><legend>{text.grain}</legend><div className="segmented">
        <button type="button" aria-pressed={!bitMode} onClick={() => { setBitMode(false); setSelection(undefined) }}>{text.units}</button>
        <button type="button" aria-pressed={bitMode} onClick={() => { setBitMode(true); setSelection(undefined) }}>{text.bits}</button>
      </div></fieldset>
      <label>{text.language}<select value={locale} aria-label={text.language} onChange={(event) => update('lang', event.target.value)}>
        <option value="en-US">English</option><option value="zh-CN">简体中文</option>
      </select></label>
      {variant.surface === 'cover' && <button className="icon" title={cover ? text.close : text.open} aria-label={cover ? text.close : text.open} onClick={() => setOpenKey(cover ? undefined : direction === 'forward' ? 0 : 2)}><Icon icon={cover ? 'cross' : 'layers'} /></button>}
      <a href="/testaescipher">{text.full}</a>
    </div>
    <div className="legend"><span>rk1 = <code>w4,w5</code> ({text.initial}) + <code>w6,w7</code> ({text.batch})</span><span>{text.anchors}: {variant.anchor === 'key' ? text.key : text.operation}</span>{cover && <span>{text.hidden}</span>}</div>
    <div className="status" role="status" aria-live="polite">
      <button className="icon" title={text.clear} aria-label={text.clear} onClick={() => setSelection(undefined)}><Icon icon="reset" /></button>
      <output>{selection ? `${text.selected}: ${selectedRow?.label} · ${text.range} ${selection.start}..${selection.start + selection.width - 1} · ${text.related}: ${related.size}` : text.none}</output>
    </div>
    <div className="viewport" tabIndex={0} aria-label={`${text.cipher} / ${text.schedule}`}>
      <div className="canvas" ref={canvas}>
        <LineageDiagram relationships={displayEdges} locations={geometry.locations} width={geometry.width} height={geometry.height} related={new Set()} />
        <TraceTable caption={`${text.cipher} · ${direction === 'forward' ? text.forward : text.reverse}`} headers={variant.surface === 'side'
          ? [text.stage, text.value, text.cipher, text.schedule, text.units]
          : [text.stage, text.value, cover ? text.schedule : text.cipher]}>
          {rows.map(({ cipher, schedule: scheduleRow, anchor }, index) => <ComparisonRow key={`${cipher?.id ?? ''}|${scheduleRow?.id ?? ''}`} rowId={cipher?.id ?? `pad-${index}`} label={cipher?.label ?? ''}>
            <ValueCell><div className="rowlabel">
              {cipher && <>
                {anchor !== undefined && <span className="anchor-tag">rk{anchor}</span>}
                {variant.surface === 'cover' && cipher.round !== undefined
                  ? <button className="key-toggle" type="button" aria-pressed={openKey === cipher.round} onClick={() => setOpenKey(openKey === cipher.round ? undefined : cipher.round)}>{cipher.label}</button>
                  : null}
                <code>{cipher.value}</code>
              </>}
            </div></ValueCell>
            {variant.surface === 'side' ? <>
              <td data-cipher-row={cipher?.id}>{cipher && renderUnits(cipher)}</td>
              <td className="schedule-label" data-schedule-row={scheduleRow?.id} data-anchor={anchor}>{scheduleRow && scheduleLabel(scheduleRow, anchor)}</td>
              <td className="schedule-units">{scheduleRow && renderUnits(scheduleRow)}</td>
            </> : <td className={cover ? 'schedule-units' : ''} data-cipher-row={!cover ? cipher?.id : undefined} data-schedule-row={cover ? scheduleRow?.id : undefined} data-anchor={cover ? anchor : undefined}>
              {cover ? scheduleRow && <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>{scheduleLabel(scheduleRow, anchor)}{renderUnits(scheduleRow)}</div> : cipher && renderUnits(cipher)}
            </td>}
          </ComparisonRow>)}
        </TraceTable>
      </div>
    </div>
    <details open={selection !== undefined}>
      <summary>{text.details} · {audit.length}</summary>
      <div className="audit"><TraceTable caption={text.related} headers={[text.row, text.count, text.range]}>
        {audit.map(({ row, bits }) => <ComparisonRow key={row.id} label={`${row.id.startsWith('s/') ? text.schedule : text.cipher}: ${row.label}`}>
          <ValueCell>{bits.length}/{row.bitValues.length}</ValueCell><ValueCell><code>{bitRanges(bits)}</code></ValueCell>
        </ComparisonRow>)}
      </TraceTable></div>
    </details>
    <details><summary>{text.generation}</summary><div className="audit"><TraceTable caption={text.schedule} headers={[text.row, text.source, text.value]}>
      {[...data.scheduleRows].sort((a, b) => a.sourceOrder! - b.sourceOrder!).map((row) => <ComparisonRow key={row.id} label={row.label}><ValueCell>{row.sourceOrder} · {row.words}</ValueCell><ValueCell><code>{row.value}</code></ValueCell></ComparisonRow>)}
    </TraceTable></div></details>
    {import.meta.env.DEV && <div className="switcher" aria-label={text.prototype}>
      <button className="icon" title={text.previous} aria-label={text.previous} onClick={() => cycle(-1)}><Icon icon="arrow-left" /></button>
      <output>{variant.key} · {variant.surface === 'side' ? text.side : text.cover} · {variant.anchor === 'key' ? text.key : text.operation}</output>
      <button className="icon" title={text.next} aria-label={text.next} onClick={() => cycle(1)}><Icon icon="arrow-right" /></button>
    </div>}
  </Page>
}
