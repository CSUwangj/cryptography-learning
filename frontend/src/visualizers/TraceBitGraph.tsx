import React from 'react'
import type { TraceStage } from 'crypto_graph'

const pathTokens = {
  'zh-CN': {
    plaintext: '明文',
    output: '输出',
    repeat: '重复',
    round: '轮',
    key: '密钥',
    'key-mix': '密钥混合',
    substitute: '替换',
    permute: '置换',
  },
} as const

export const formatTracePath = (path: string, locale: string): string =>
  path.split(/([./])/).map((token) => pathTokens['zh-CN'][token as keyof typeof pathTokens['zh-CN']] && locale === 'zh-CN'
    ? pathTokens['zh-CN'][token as keyof typeof pathTokens['zh-CN']]
    : token).join('')

const textWidth = (text: string): number =>
  [...text].reduce((width, character) => width + (character.charCodeAt(0) > 0x7f ? 16 : 9), 0)

export const traceGraphLayout = (
  labels: readonly string[],
  bitCount: number,
  minimumWidth: number,
) => {
  const labelColumnWidth = Math.max(170, ...labels.map(textWidth)) + 24
  const bitGridX = 16 + labelColumnWidth
  const keyColumnX = bitGridX + bitCount * 30 + 40
  const width = Math.max(minimumWidth, keyColumnX + 196)
  return { bitGridX, keyColumnX, labelColumnWidth, width }
}

export const traceBitTargets = (
  stage: TraceStage | undefined,
  permutation: readonly number[] | undefined,
  bit: number,
): readonly number[] => stage === 'substitute'
  ? [Math.floor(bit / 4) * 4, Math.floor(bit / 4) * 4 + 1, Math.floor(bit / 4) * 4 + 2, Math.floor(bit / 4) * 4 + 3]
  : stage === 'permute'
    ? permutation ? [permutation[Math.floor(bit / 4)] * 4 + bit % 4] : []
    : [bit]

export type TraceBitCell = {
  readonly bit: number
  readonly value: string
  readonly different?: boolean
}

export const TraceBitCells: React.FC<{
  readonly cells: readonly TraceBitCell[]
  readonly x: number
  readonly y: number
  readonly active: ReadonlySet<number>
  readonly selectedBit?: number
  readonly onSelect: (bit: number) => void
  readonly ariaLabel: (cell: TraceBitCell) => string
}> = ({ cells, x, y, active, selectedBit, onSelect, ariaLabel }) => <>
  {cells.map((cell) => {
    const selected = selectedBit === cell.bit
    const related = active.has(cell.bit)
    return <g
      aria-label={ariaLabel(cell)}
      aria-pressed={selected}
      data-trace-bit-cell
      key={cell.bit}
      onClick={() => onSelect(cell.bit)}
      onFocus={() => onSelect(cell.bit)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(cell.bit)
        }
      }}
      role="button"
      tabIndex={0}
    >
      <rect
        fill={cell.different ? '#fde8e7' : related ? '#e5f1fb' : '#ffffff'}
        height="42"
        stroke={selected ? '#123d63' : related ? '#1d70b8' : '#8aa0b6'}
        strokeWidth={selected ? 3 : related ? 2 : 1}
        width="26"
        x={x + cell.bit * 30 - 13}
        y={y}
      />
      <text fill="#17324d" fontSize="10" textAnchor="middle" x={x + cell.bit * 30} y={y + 13}>{cell.bit}</text>
      <text fill="#17324d" fontSize="13" style={{ textDecoration: cell.different ? 'underline' : undefined }} textAnchor="middle" x={x + cell.bit * 30} y={y + 31}>{cell.value}</text>
    </g>
  })}
</>

export const TraceBitLinks: React.FC<{
  readonly count: number
  readonly x: number
  readonly fromY: number
  readonly toY: number
  readonly map: (bit: number) => readonly number[]
  readonly fromActive: ReadonlySet<number>
  readonly toActive: ReadonlySet<number>
}> = ({ count, x, fromY, toY, map, fromActive, toActive }) => <>
  {Array.from({ length: count }, (_, bit) => map(bit).map((target) => {
    const highlighted = fromActive.has(bit) && toActive.has(target)
    return <line
      key={`${bit}-${target}`}
      stroke={highlighted ? '#1d70b8' : '#a8b6c5'}
      strokeWidth={highlighted ? 3 : 1}
      x1={x + bit * 30}
      x2={x + target * 30}
      y1={fromY}
      y2={toY}
    />
  }))}
</>
