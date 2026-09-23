import React, { useEffect, useMemo, useState } from 'react'
import { hex, type BitsValue, type TraceEvent, type WorkerExecutionSnapshot } from 'crypto_graph'
import { PermutationVisual, SubstitutionVisual, XorVisual } from './OperationVisuals'
import { formatTracePath, traceGraphLayout, TraceBitCells, TraceBitLinks, traceBitTargets } from './TraceBitGraph'

type Locale = 'en-US' | 'zh-CN'
type Node = TraceEvent & { readonly value: BitsValue }
type Selection = { readonly row: number; readonly bit: number }

export type TeachingSpnRendererProps = {
  readonly execution: WorkerExecutionSnapshot
  readonly locale: string
  readonly dimensions: { readonly width: number }
  readonly executionIdentity: string
}

const copy = {
  'en-US': {
    title: 'Teaching SPN execution',
    instructions: 'Select a bit to inspect structural lineage. Lines show structural dependency, not individual causation.',
    stage: 'Stage',
    keys: 'Round keys',
    bit: 'Bit',
    value: 'Value',
    selected: 'Selected lineage',
    details: 'Operation detail',
    lookup: 'Selected lookup',
    input: 'Input state',
    output: 'Output state',
    round: 'Round',
    keyMix: 'Key-mixing result',
    substitution: 'S-box result',
    permutation: 'Permutation result',
    roundState: 'Round state',
    xor: 'XOR',
    sBox: 'S-box',
    incomplete: 'Trace is incomplete. Retained raw values remain visible; lineage stops at missing stages.',
    gap: 'Trace gap',
    raw: 'Retained raw execution values',
  },
  'zh-CN': {
    title: '教学 SPN 执行',
    instructions: '选择一位以查看结构谱系。连线表示结构依赖，不表示单个位的独立因果。',
    stage: '阶段',
    keys: '轮密钥',
    bit: '位',
    value: '值',
    selected: '所选谱系',
    details: '操作详情',
    lookup: '所选查表',
    input: '输入状态',
    output: '输出状态',
    round: '轮',
    keyMix: '密钥混合结果',
    substitution: 'S 盒结果',
    permutation: '置换结果',
    roundState: '轮状态',
    xor: '异或',
    sBox: 'S 盒',
    incomplete: '轨迹不完整。保留的原始值仍可见；谱系会在缺失阶段停止。',
    gap: '轨迹缺口',
    raw: '保留的原始执行值',
  },
} as const

const textFor = (locale: string) => copy[locale as Locale] ?? copy['en-US']
const bitAt = (value: BitsValue, bit: number): number => (value.bytes[Math.floor(bit / 8)] >> (7 - bit % 8)) & 1
const isNode = (event: TraceEvent): event is Node => event.value?.type.family === 'bits' && 'bytes' in event.value

const stageName = (node: Node, locale: string): string => {
  const text = textFor(locale)
  if (node.stage === 'input') return text.input
  if (node.stage === 'key-mix') return text.keyMix
  if (node.stage === 'substitute') return text.substitution
  if (node.stage === 'permute') return text.permutation
  if (node.stage === 'output') return node.round === undefined ? text.output : text.roundState
  return formatTracePath(node.path, locale)
}

const connected = (before: Node, after: Node): boolean =>
  (after.stage === 'key-mix' && (before.stage === 'input' || before.stage === 'output'))
  || (after.stage === 'substitute' && before.stage === 'key-mix')
  || (after.stage === 'permute' && before.stage === 'substitute')
  || (after.stage === 'output' && before.stage === 'permute')

export const TeachingSpnRenderer: React.FC<TeachingSpnRendererProps> = ({
  execution,
  locale,
  dimensions,
  executionIdentity,
}) => {
  const text = textFor(locale)
  const nodes = useMemo(() => execution.trace.flatMap((event) => 'value' in event && isNode(event) ? [event] : []), [execution])
  const rows = useMemo(() => nodes.filter((node) => node.stage !== 'round-key'), [nodes])
  const keys = useMemo(() => nodes.filter((node) => node.stage === 'round-key'), [nodes])
  const [selection, setSelection] = useState<Selection | undefined>(() => rows[0] ? { row: 0, bit: 0 } : undefined)
  const [selectedKey, setSelectedKey] = useState<string | undefined>()

  useEffect(() => {
    setSelection(rows[0] ? { row: 0, bit: 0 } : undefined)
    setSelectedKey(undefined)
  }, [executionIdentity])

  const active = useMemo(() => {
    const paths = rows.map(() => new Set<number>())
    if (!selection || !rows[selection.row]) return paths
    paths[selection.row].add(selection.bit)
    for (let row = selection.row; row < rows.length - 1; row += 1) {
      if (!connected(rows[row], rows[row + 1])) continue
      for (const bit of paths[row]) for (const target of traceBitTargets(rows[row + 1].stage, rows[row + 1].operation?.permutation, bit)) paths[row + 1].add(target)
    }
    for (let row = selection.row; row > 0; row -= 1) {
      if (!connected(rows[row - 1], rows[row])) continue
      for (let bit = 0; bit < rows[row - 1].value.type.size; bit += 1) {
        if (traceBitTargets(rows[row].stage, rows[row].operation?.permutation, bit).some((target) => paths[row].has(target))) paths[row - 1].add(bit)
      }
    }
    return paths
  }, [rows, selection])

  const bitCount = Math.max(0, ...rows.map((row) => row.value.type.size))
  const layout = traceGraphLayout(
    rows.flatMap((row) => [
      stageName(row, locale),
      `${formatTracePath(row.path, locale)}: ${hex(row.value)}`,
    ]),
    bitCount,
    Math.max(900, dimensions.width || 900),
  )
  const rowHeight = 104
  const svgHeight = Math.max(160, rows.length * rowHeight + 64)
  const input = rows.find((row) => row.stage === 'input')
  const output = [...rows].reverse().find((row) => row.path === 'output' || row.stage === 'output')

  return <section aria-label={text.title} style={{ minWidth: 0 }}>
    <h3>{text.title}</h3>
    <p>{text.instructions}</p>
    {execution.traceStatus.truncated && <p role="status">{text.incomplete}</p>}
    <p aria-live="polite">{selection && rows[selection.row] ? `${text.selected}: ${stageName(rows[selection.row], locale)}, ${text.bit} ${selection.bit}.` : text.gap}</p>
    <div style={{ overflowX: 'auto', border: '1px solid #c7d2df', borderRadius: 6 }}>
      <svg aria-label={text.title} height={svgHeight} style={{ background: '#fbfdff', display: 'block', minWidth: layout.width }} viewBox={`0 0 ${layout.width} ${svgHeight}`} width={layout.width}>
        <text fill="#17324d" fontSize="16" x="16" y="24">{text.stage}</text>
        <text fill="#17324d" fontSize="16" x={layout.keyColumnX + 12} y="24">{text.keys}</text>
        {rows.map((row, rowIndex) => {
          const y = 44 + rowIndex * rowHeight
          const before = rows[rowIndex - 1]
          return <g data-trace-row={row.path} key={row.path}>
            {before && connected(before, row) && <TraceBitLinks count={row.value.type.size} fromActive={active[rowIndex - 1] ?? new Set()} map={(bit) => traceBitTargets(row.stage, row.operation?.permutation, bit)} toActive={active[rowIndex] ?? new Set()} fromY={y - 56} toY={y} x={layout.bitGridX} />}
            <text data-trace-label fill="#17324d" fontSize="14" x="16" y={y + 16}>{stageName(row, locale)}</text>
            <text data-trace-label fill="#4b6075" fontSize="12" x="16" y={y + 34}>{`${formatTracePath(row.path, locale)}: ${hex(row.value)}`}</text>
            <TraceBitCells
              active={active[rowIndex] ?? new Set()}
              ariaLabel={(cell) => `${stageName(row, locale)}, ${text.bit} ${cell.bit}: ${cell.value}`}
              cells={Array.from({ length: row.value.type.size }, (_, bit) => ({ bit, value: String(bitAt(row.value, bit)) }))}
              onSelect={(bit) => { setSelection({ row: rowIndex, bit }); setSelectedKey(undefined) }}
              selectedBit={selection?.row === rowIndex ? selection.bit : undefined}
              x={layout.bitGridX}
              y={y}
            />
          </g>
        })}
        {keys.map((key, index) => {
          const rowIndex = rows.findIndex((row) => row.round === key.round && row.stage === 'key-mix')
          const y = 44 + (rowIndex < 0 ? index : rowIndex) * rowHeight
          const chosen = selectedKey === key.path
          const related = chosen || (rowIndex >= 0 && active[rowIndex].size > 0)
          return <g
            aria-label={`${text.keys}: ${hex(key.value)}`}
            aria-pressed={chosen}
            data-round-key={key.round ?? index + 1}
            key={key.path}
            onClick={() => { setSelectedKey(key.path); setSelection(undefined) }}
            onFocus={() => { setSelectedKey(key.path); setSelection(undefined) }}
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
            {rowIndex >= 0 && <line stroke={related ? '#1d70b8' : '#a8b6c5'} strokeWidth={related ? 3 : 1} x1={layout.keyColumnX} x2={layout.keyColumnX - 40} y1={y + 27} y2={y + 21} />}
            <rect fill="#edf4fb" height="54" stroke={related ? '#1d70b8' : '#8aa0b6'} strokeWidth={related ? 3 : 1} width="180" x={layout.keyColumnX} y={y} />
            <text fill="#17324d" fontSize="13" x={layout.keyColumnX + 12} y={y + 20}>{`${text.keys} ${key.round ?? index + 1}`}</text>
            <text fill="#17324d" fontFamily="monospace" fontSize="13" x={layout.keyColumnX + 12} y={y + 40}>{hex(key.value)}</text>
          </g>
        })}
      </svg>
    </div>
    <table>
      <caption>{text.details}</caption>
      <thead><tr><th>{text.stage}</th><th>{text.round}</th><th>{text.value}</th><th>{text.details}</th></tr></thead>
      <tbody>
        {input && <tr><th>{text.input}</th><td>—</td><td>{hex(input.value)}</td><td>{input.path}</td></tr>}
        {rows.filter((node) => node !== input).map((node) => {
          const rowIndex = rows.indexOf(node)
          const before = rows[rowIndex - 1]
          const key = node.stage === 'key-mix' ? keys.find((item) => item.round === node.round) : undefined
          const detail = node.stage === 'key-mix' && before && key
            ? <XorVisual label={text.xor} terms={[{ left: hex(before.value), right: hex(key.value), output: hex(node.value) }]} />
            : node.stage === 'substitute' && before && node.operation?.sBox
              ? <SubstitutionVisual lanes={[{ input: hex(before.value), output: hex(node.value) }]} lookupLabel={text.lookup} sBox={node.operation.sBox} selectedBit={active[rowIndex]?.values().next().value} />
              : node.stage === 'permute' && node.operation?.permutation
                ? <PermutationVisual permutation={node.operation.permutation} />
                : node.path
          return <tr key={node.path}>
            <th>{stageName(node, locale)}</th><td>{node.round ?? '—'}</td><td>{hex(node.value)}</td><td>{detail}</td>
          </tr>
        })}
        {execution.traceStatus.truncated && <tr><th>{text.gap}</th><td colSpan={3}>{text.incomplete}</td></tr>}
      </tbody>
    </table>
    <p>{`${text.input}: ${input ? hex(input.value) : '—'} · ${text.output}: ${output ? hex(output.value) : '—'}`}</p>
  </section>
}
