import React, { useEffect, useMemo, useState } from 'react'
import { hex, type AvalancheCheckpoint, type AvalancheComparison } from 'crypto_graph'
import { PermutationVisual, SubstitutionVisual, XorVisual } from './OperationVisuals'
import { formatTracePath, traceGraphLayout, TraceBitCells, TraceBitLinks, traceBitTargets } from './TraceBitGraph'

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
    details: 'Operation details',
    incomplete: 'Trace is incomplete. Raw retained values remain visible; paired differences and lineage stop at the gap.',
    gap: 'Trace gap',
    warning: 'This comparison changes inputs outside the supported plaintext-only scenario.',
    lineage: 'Selected bit lineage',
    noSelection: 'No differing plaintext bit is available.',
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
    details: '操作详情',
    incomplete: '轨迹不完整。保留的原始值仍可见；配对差异和位谱系会在缺口处停止。',
    gap: '轨迹缺口',
    warning: '此比较改变了不受支持的输入端口，而非仅改变明文。',
    lineage: '所选位的谱系',
    noSelection: '没有可选择的不同明文位。',
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

const stageName = (checkpoint: AvalancheCheckpoint, locale: string): string => {
  const text = textFor(locale)
  if (checkpoint.stage === 'key-mix') return text.keyMix
  if (checkpoint.stage === 'substitute') return text.substitution
  if (checkpoint.stage === 'permute') return text.permutation
  return formatTracePath(checkpoint.path, locale)
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
      for (const bit of paths[row]) for (const target of traceBitTargets(rows[row + 1].stage, rows[row + 1].operation?.permutation, bit)) paths[row + 1].add(target)
    }
    for (let row = selection.row; row > 0; row -= 1) {
      for (let bit = 0; bit < rows[row - 1].left.type.size; bit += 1) {
        if (traceBitTargets(rows[row].stage, rows[row].operation?.permutation, bit).some((target) => paths[row].has(target))) paths[row - 1].add(bit)
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
  const bitCount = Math.max(0, ...rows.map((row) => row.left.type.size))
  const layout = traceGraphLayout(
    rows.flatMap((row) => [
      stageName(row, locale),
      `${formatTracePath(row.path, locale)}: ${hex(row.left)} | ${hex(row.right)}`,
      `${text.mask}: ${hex(row.mask)} · ${row.changedBits}/${row.left.type.size} · ${row.ratio}`,
    ]),
    bitCount,
    Math.max(900, dimensions.width || 900),
  )
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
        style={{ display: 'block', minWidth: layout.width, background: '#fbfdff' }}
        viewBox={`0 0 ${layout.width} ${svgHeight}`}
        width={layout.width}
      >
        <text fill="#17324d" fontSize="16" x="16" y="24">{text.stage}</text>
        <text fill="#17324d" fontSize="16" x={layout.keyColumnX + 12} y="24">{text.keys}</text>
        {rows.map((row, rowIndex) => {
          const y = 44 + rowIndex * rowHeight
          const before = rows[rowIndex - 1]
          return <g data-trace-row={row.path} key={row.path}>
            {before && <TraceBitLinks count={row.left.type.size} fromActive={active[rowIndex - 1] ?? new Set()} map={(bit) => traceBitTargets(row.stage, row.operation?.permutation, bit)} toActive={active[rowIndex] ?? new Set()} fromY={y - 56} toY={y} x={layout.bitGridX} />}
            <text data-trace-label fill="#17324d" fontSize="14" x="16" y={y + 16}>{stageName(row, locale)}</text>
            <text data-trace-label fill="#4b6075" fontSize="12" x="16" y={y + 34}>{`${formatTracePath(row.path, locale)}: ${hex(row.left)} | ${hex(row.right)}`}</text>
            <text data-trace-label fill="#4b6075" fontSize="12" x="16" y={y + 50}>{`${text.mask}: ${hex(row.mask)} · ${row.changedBits}/${row.left.type.size} · ${row.ratio}`}</text>
            <TraceBitCells
              active={active[rowIndex] ?? new Set()}
              ariaLabel={(cell) => `${stageName(row, locale)}, ${text.bit} ${cell.bit}: ${cell.value}${cell.different ? `, ${text.different}` : ''}`}
              cells={Array.from({ length: row.left.type.size }, (_, bit) => ({ bit, different: bitAt(row.mask.bytes, bit) === 1, value: `${bitAt(row.left.bytes, bit)}|${bitAt(row.right.bytes, bit)}` }))}
              onSelect={(bit) => { setSelection({ row: rowIndex, bit }); setSelectedKey(undefined) }}
              selectedBit={selection?.row === rowIndex ? selection.bit : undefined}
              x={layout.bitGridX}
              y={y}
            />
          </g>
        })}
        {keys.map((key, index) => {
          const mixIndex = rows.findIndex((row) => row.round === key.round && row.stage === 'key-mix')
          const connected = mixIndex >= 0
          const y = 44 + (connected ? mixIndex : 0) * rowHeight
          const chosen = selectedKey === key.path
          const related = chosen || (connected && active[mixIndex].size > 0)
          return <g
            aria-label={`${text.keys}: ${hex(key.left)}`}
            aria-pressed={chosen}
            data-round-key={key.round ?? index + 1}
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
            {connected && <line stroke={related ? '#1d70b8' : '#a8b6c5'} strokeWidth={related ? 3 : 1} x1={layout.keyColumnX} x2={layout.keyColumnX - 40} y1={y + 27} y2={y + 21} />}
            <rect fill="#edf4fb" height="54" stroke={related ? '#1d70b8' : '#8aa0b6'} strokeWidth={related ? 3 : 1} width="180" x={layout.keyColumnX} y={y} />
            <text fill="#17324d" fontSize="13" x={layout.keyColumnX + 12} y={y + 20}>{`${text.keys} ${key.round ?? index + 1}`}</text>
            <text fill="#17324d" fontFamily="monospace" fontSize="13" x={layout.keyColumnX + 12} y={y + 40}>{hex(key.left)}</text>
          </g>
        })}
      </svg>
    </div>
    <table>
      <caption>{text.details}</caption>
      <thead><tr><th>{text.stage}</th><th>{text.details}</th></tr></thead>
      <tbody>{rows.map((row, rowIndex) => {
        const before = rows[rowIndex - 1]
        const key = row.stage === 'key-mix' ? keys.find((item) => item.round === row.round) : undefined
        const detail = row.stage === 'key-mix' && before && key
          ? <XorVisual label={text.keyMix} terms={[{ left: hex(before.left), right: hex(key.left), output: hex(row.left) }, { left: hex(before.right), right: hex(key.right), output: hex(row.right) }]} />
          : row.stage === 'substitute' && before && row.operation?.sBox
            ? <SubstitutionVisual lanes={[{ input: hex(before.left), output: hex(row.left) }, { input: hex(before.right), output: hex(row.right) }]} lookupLabel={text.lookup} sBox={row.operation.sBox} selectedBit={active[rowIndex]?.values().next().value} />
            : row.stage === 'permute' && row.operation?.permutation
              ? <PermutationVisual permutation={row.operation.permutation} />
              : undefined
        return detail && <tr key={row.path}><th>{stageName(row, locale)}</th><td>{detail}</td></tr>
      })}</tbody>
    </table>
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
