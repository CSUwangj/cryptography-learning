import React, { useEffect, useMemo, useState } from 'react'
import { hex, type AvalancheCheckpoint, type AvalancheComparison } from 'crypto_graph'

type Locale = 'en-US' | 'zh-CN'
type Selection = { readonly row: number; readonly bit: number }
type CompleteCheckpoint = AvalancheCheckpoint & { readonly complete: true }

export type AvalancheRendererProps = {
  readonly comparison: AvalancheComparison
  readonly locale: string
  readonly dimensions: { readonly width: number; readonly height: number }
  readonly executionIdentity: string
  readonly reducedMotion: boolean
}

const copy = {
  'en-US': {
    title: 'Continuous avalanche comparison',
    instructions: 'Select one bit to inspect its structural lineage. Underlined cells differ; connected lines show dependency, not individual causation.',
    summary: 'Comparison summary',
    raw: 'Retained raw execution values',
    stage: 'Stage',
    baseline: 'Baseline',
    changed: 'Changed',
    mask: 'Difference mask',
    changedBits: 'Changed bits',
    ratio: 'Ratio',
    keys: 'Round keys',
    incomplete: 'Trace is incomplete. Raw retained values remain visible; paired differences and lineage stop at the gap.',
    gap: 'Trace gap',
    warning: 'This comparison changes inputs outside the supported plaintext-only scenario.',
    lineage: 'Selected bit lineage',
    noSelection: 'No differing plaintext bit is available.',
    fixedKey: 'Fixed key operand',
    keyMix: 'XOR operands and result',
    substitution: 'S-box input and output',
    permutation: 'Permutation source to destination',
    bit: 'Bit',
    different: 'different',
    key: 'key',
    run: 'Run',
    lookup: 'Selected lookup',
  },
  'zh-CN': {
    title: '连续雪崩比较',
    instructions: '选择一位以查看其结构谱系。带下划线的格表示差异；连线表示依赖关系，不表示单个位的独立因果。',
    summary: '比较摘要',
    raw: '保留的原始执行值',
    stage: '阶段',
    baseline: '基准执行',
    changed: '改变后执行',
    mask: '差异掩码',
    changedBits: '改变位数',
    ratio: '比例',
    keys: '轮密钥',
    incomplete: '轨迹不完整。保留的原始值仍可见；配对差异和位谱系会在缺口处停止。',
    gap: '轨迹缺口',
    warning: '此比较改变了不受支持的输入端口，而非仅改变明文。',
    lineage: '所选位的谱系',
    noSelection: '没有可选择的不同明文位。',
    fixedKey: '固定密钥操作数',
    keyMix: '异或操作数与结果',
    substitution: 'S 盒输入和输出',
    permutation: '置换来源到目标',
    bit: '位',
    different: '不同',
    key: '密钥',
    run: '执行',
    lookup: '所选查表',
  },
} as const

const textFor = (locale: string) => copy[locale as Locale] ?? copy['en-US']
const bitAt = (value: Uint8Array, bit: number): number => (value[Math.floor(bit / 8)] >> (7 - (bit % 8))) & 1
const firstChangedBit = (checkpoint: CompleteCheckpoint): number | undefined => {
  for (let bit = 0; bit < checkpoint.mask.type.size; bit += 1) if (bitAt(checkpoint.mask.bytes, bit)) return bit
  return undefined
}
const stateCheckpoints = (comparison: AvalancheComparison): readonly CompleteCheckpoint[] =>
  comparison.checkpoints.filter((checkpoint): checkpoint is CompleteCheckpoint =>
    checkpoint.complete && checkpoint.stage !== 'round-key')

const plaintextSelection = (rows: readonly CompleteCheckpoint[]): Selection | undefined => {
  const row = rows.findIndex((checkpoint) => checkpoint.stage === 'input' && checkpoint.path === 'plaintext')
  const bit = row < 0 ? undefined : firstChangedBit(rows[row])
  return row < 0 || bit === undefined ? undefined : { row, bit }
}

const mapping = (checkpoint: CompleteCheckpoint, from: number): readonly number[] => {
  if (checkpoint.stage === 'substitute') {
    const nibble = Math.floor(from / 4) * 4
    return [nibble, nibble + 1, nibble + 2, nibble + 3]
  }
  if (checkpoint.stage === 'permute') {
    const targetNibble = checkpoint.operation?.permutation?.[Math.floor(from / 4)]
    return targetNibble === undefined ? [] : [targetNibble * 4 + (from % 4)]
  }
  return [from]
}

const stageName = (checkpoint: AvalancheCheckpoint, locale: string): string => {
  const text = textFor(locale)
  if (checkpoint.stage === 'key-mix') return text.keyMix
  if (checkpoint.stage === 'substitute') return text.substitution
  if (checkpoint.stage === 'permute') return text.permutation
  return checkpoint.path
}

const operationDetail = (
  checkpoint: CompleteCheckpoint,
  before: CompleteCheckpoint | undefined,
  locale: string,
  selectedBit?: number,
  key?: CompleteCheckpoint,
): string | undefined => {
  const text = textFor(locale)
  if (!before) return undefined
  if (checkpoint.stage === 'key-mix' && key) return `${hex(before.left)} ⊕ ${hex(key.left)} = ${hex(checkpoint.left)} · ${hex(before.right)} ⊕ ${hex(key.right)} = ${hex(checkpoint.right)}`
  if (checkpoint.stage === 'substitute') {
    const nibbles = [0, 1, 2, 3].map((index) => `${index}: ${hex(before.left).slice(2)[index]}→${hex(checkpoint.left).slice(2)[index]} | ${hex(before.right).slice(2)[index]}→${hex(checkpoint.right).slice(2)[index]}`)
    const lookup = selectedBit === undefined ? undefined : `${text.lookup}: S${Math.floor(selectedBit / 4)}`
    return [lookup, ...nibbles].filter((value): value is string => value !== undefined).join(' · ')
  }
  if (checkpoint.stage === 'permute') return checkpoint.operation?.permutation?.map((target, source) => `${source}→${target}`).join(' · ')
  return undefined
}

export const AvalancheRenderer: React.FC<AvalancheRendererProps> = ({
  comparison,
  locale,
  dimensions,
  executionIdentity,
  reducedMotion,
}) => {
  const text = textFor(locale)
  const rows = useMemo(() => stateCheckpoints(comparison), [comparison])
  const [selection, setSelection] = useState<Selection | undefined>(() => plaintextSelection(rows))
  const [selectedKey, setSelectedKey] = useState<string | undefined>()

  useEffect(() => {
    setSelection(plaintextSelection(rows))
    setSelectedKey(undefined)
  }, [executionIdentity, rows])

  const active = useMemo(() => {
    if (!selection) return rows.map(() => new Set<number>())
    const paths = rows.map(() => new Set<number>())
    paths[selection.row].add(selection.bit)
    for (let row = selection.row; row < rows.length - 1; row += 1) {
      for (const bit of paths[row]) for (const target of mapping(rows[row + 1], bit)) paths[row + 1].add(target)
    }
    for (let row = selection.row; row > 0; row -= 1) {
      for (let bit = 0; bit < rows[row - 1].left.type.size; bit += 1) {
        if (mapping(rows[row], bit).some((target) => paths[row].has(target))) paths[row - 1].add(bit)
      }
    }
    return paths
  }, [rows, selection])

  const keys = comparison.checkpoints.filter((checkpoint): checkpoint is CompleteCheckpoint =>
    checkpoint.complete && checkpoint.stage === 'round-key')
  const retained = comparison.truncated
    ? (['baseline', 'changed'] as const).flatMap((run) => comparison.executions[run].trace.flatMap((event) =>
      'value' in event && event.value && 'bytes' in event.value ? [{ run, path: event.path, value: hex(event.value) }] : [],
    ))
    : []
  const width = Math.max(900, dimensions.width || 900)
  const rowHeight = 104
  const svgHeight = Math.max(160, rows.length * rowHeight + 64)

  return <section aria-label={text.title} style={{ minWidth: 0 }}>
    <h3>{text.title}</h3>
    <p>{text.instructions}</p>
    {comparison.truncated && <p role="status">{text.incomplete}</p>}
    {comparison.checkpoints.some((checkpoint) => checkpoint.complete && checkpoint.stage === 'round-key' && checkpoint.changedBits > 0) && <p role="status">{text.warning}</p>}
    <p aria-live="polite">{selection ? `${text.lineage}: ${stageName(rows[selection.row], locale)}, ${text.bit} ${selection.bit}.` : text.noSelection}</p>
    <div style={{ overflowX: 'auto', border: '1px solid #c7d2df', borderRadius: 6 }}>
      <svg
        aria-label={text.title}
        height={svgHeight}
        role="img"
        style={{ display: 'block', minWidth: width, background: '#fbfdff' }}
        viewBox={`0 0 ${width} ${svgHeight}`}
        width={width}
      >
        <text fill="#17324d" fontSize="16" x="16" y="24">{text.stage}</text>
        <text fill="#17324d" fontSize="16" x="690" y="24">{text.keys}</text>
        {rows.map((row, rowIndex) => {
          const y = 44 + rowIndex * rowHeight
          const before = rows[rowIndex - 1]
          const key = row.stage === 'key-mix' ? keys.find((item) => item.round === row.round) : undefined
          return <g key={row.path}>
            {before && Array.from({ length: row.left.type.size }, (_, bit) => mapping(row, bit).map((target) => (
              <line
                key={`${bit}-${target}`}
                stroke={active[rowIndex - 1]?.has(bit) && active[rowIndex]?.has(target) ? '#1d70b8' : '#a8b6c5'}
                strokeWidth={active[rowIndex - 1]?.has(bit) && active[rowIndex]?.has(target) ? 3 : 1}
                x1={170 + bit * 30}
                x2={170 + target * 30}
                y1={y - 56}
                y2={y}
              />
            )))}
            <text fill="#17324d" fontSize="14" x="16" y={y + 16}>{stageName(row, locale)}</text>
            <text fill="#4b6075" fontSize="12" x="16" y={y + 34}>{`${text.mask}: ${hex(row.mask)} · ${row.changedBits}/${row.left.type.size} · ${row.ratio}`}</text>
            {Array.from({ length: row.left.type.size }, (_, bit) => {
              const difference = bitAt(row.mask.bytes, bit) === 1
              const chosen = selection?.row === rowIndex && selection.bit === bit
              const related = active[rowIndex]?.has(bit)
              return <g
                aria-label={`${stageName(row, locale)}, ${text.bit} ${bit}: ${bitAt(row.left.bytes, bit)} | ${bitAt(row.right.bytes, bit)}${difference ? `, ${text.different}` : ''}`}
                aria-pressed={chosen}
                key={bit}
                onClick={() => { setSelection({ row: rowIndex, bit }); setSelectedKey(undefined) }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelection({ row: rowIndex, bit })
                    setSelectedKey(undefined)
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <rect
                  fill={difference ? '#fde8e7' : '#ffffff'}
                  height="42"
                  stroke={chosen ? '#123d63' : related ? '#1d70b8' : '#8aa0b6'}
                  strokeWidth={chosen ? 3 : related ? 2 : 1}
                  width="26"
                  x={157 + bit * 30}
                  y={y}
                />
                <text fill="#17324d" fontSize="10" textAnchor="middle" x={170 + bit * 30} y={y + 13}>{bit}</text>
                <text
                  fill="#17324d"
                  fontSize="13"
                  style={{ textDecoration: difference ? 'underline' : undefined, transition: reducedMotion ? 'none' : undefined }}
                  textAnchor="middle"
                  x={170 + bit * 30}
                  y={y + 31}
                >{`${bitAt(row.left.bytes, bit)}|${bitAt(row.right.bytes, bit)}`}</text>
              </g>
            })}
            {operationDetail(row, before, locale, active[rowIndex]?.values().next().value, key) && <text fill="#334e68" fontSize="12" x="16" y={y + 56}>{operationDetail(row, before, locale, active[rowIndex]?.values().next().value, key)}</text>}
          </g>
        })}
        {keys.map((key, index) => {
          const mixIndex = rows.findIndex((row) => row.round === key.round && row.stage === 'key-mix')
          const connected = mixIndex >= 0
          const y = 44 + (connected ? mixIndex : 0) * rowHeight
          const chosen = selectedKey === key.path
          const related = chosen || (connected && active[mixIndex].size > 0)
          return <g
            aria-label={`${text.fixedKey}: ${hex(key.left)}`}
            aria-pressed={chosen}
            key={key.path}
            onClick={() => { setSelectedKey(key.path); setSelection(undefined) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setSelectedKey(key.path)
                setSelection(undefined)
              }
            }}
            role="button"
            tabIndex={0}
          >
            {connected && <line stroke={related ? '#1d70b8' : '#a8b6c5'} strokeWidth={related ? 3 : 1} x1="680" x2="635" y1={y + 27} y2={y + 21} />}
            <rect fill="#edf4fb" height="54" stroke={related ? '#1d70b8' : '#8aa0b6'} strokeWidth={related ? 3 : 1} width="180" x="680" y={y} />
            <text fill="#17324d" fontSize="13" x="692" y={y + 20}>{`${text.fixedKey} ${key.round ?? index + 1}`}</text>
            <text fill="#17324d" fontFamily="monospace" fontSize="13" x="692" y={y + 40}>{hex(key.left)}</text>
          </g>
        })}
      </svg>
    </div>
    <table>
      <caption>{text.summary}</caption>
      <thead><tr><th>{text.stage}</th><th>{text.baseline}</th><th>{text.changed}</th><th>{text.mask}</th><th>{text.changedBits}</th><th>{text.ratio}</th></tr></thead>
      <tbody>{comparison.checkpoints.map((checkpoint) => checkpoint.complete
        ? <tr key={checkpoint.path}>
            <th>{stageName(checkpoint, locale)}</th><td>{hex(checkpoint.left)}</td><td>{hex(checkpoint.right)}</td><td>{hex(checkpoint.mask)}</td><td>{checkpoint.changedBits}</td><td>{checkpoint.ratio}</td>
          </tr>
        : <tr key={checkpoint.path}><th>{stageName(checkpoint, locale)}</th><td colSpan={5}>{text.gap}</td></tr>)}</tbody>
    </table>
    {comparison.truncated && <table>
      <caption>{text.raw}</caption>
      <thead><tr><th>{text.run}</th><th>{text.stage}</th><th>{text.baseline}</th></tr></thead>
      <tbody>{retained.map((value) => <tr key={`${value.run}-${value.path}`}><th>{value.run === 'baseline' ? text.baseline : text.changed}</th><td>{value.path}</td><td>{value.value}</td></tr>)}</tbody>
    </table>}
  </section>
}
