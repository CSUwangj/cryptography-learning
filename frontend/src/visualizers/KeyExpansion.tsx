import React, { useMemo } from 'react'
import { bits, hex, type BitsValue, type TraceCheckpoint, type TraceEvent, type WorkerExecutionSnapshot } from 'crypto_graph'
import { LearningPresentationView, type LearningDiagnostic, type LearningPresentation, type LearningRelationship, type LearningRow } from '../ui/learning'
import { bitAt } from './traceFlow'

type Locale = 'en-US' | 'zh-CN'
type Variant = 128 | 192 | 256
type Stage = 'input' | 'rot-word' | 'sub-word' | 'rcon' | 'xor'

export type KeyExpansionPresentationMeta = {
  readonly algorithm: 'AES'
  readonly variant: Variant
}

export type KeyExpansionRendererProps = {
  readonly execution: WorkerExecutionSnapshot
  readonly locale: string
  readonly executionIdentity: string
  readonly presentation: KeyExpansionPresentationMeta
}

const copy = {
  'en-US': {
    title: (algorithm: string, variant: Variant) => `${algorithm}-${variant} key expansion`,
    teaching: (algorithm: string, size: number) => `${algorithm}-style teaching key schedule (${size}-bit key, not a FIPS-197 variant)`,
    instructions: 'Every line is a structural bit relationship. Select a bit to emphasize its lineage.',
    flow: 'Key schedule',
    stage: 'Stage',
    round: 'Round',
    roundKey: 'Round key',
    value: 'Value',
    bits: 'Bits',
    bit: 'Bit',
    selected: 'Selected lineage',
    none: 'No bit selected.',
    incomplete: 'Trace is incomplete. Retained operation rows remain visible; later rows and their lineage are missing.',
    gap: 'Trace gap',
    word: 'word',
    stages: { input: 'Input', 'rot-word': 'RotWord', 'sub-word': 'SubWord', rcon: 'Rcon', xor: 'XOR' },
  },
  'zh-CN': {
    title: (algorithm: string, variant: Variant) => `${algorithm}-${variant} 密钥扩展`,
    teaching: (algorithm: string, size: number) => `${algorithm} 风格教学密钥编排（${size} 位密钥，非 FIPS-197 变体）`,
    instructions: '每条连线都是一条结构位关系。选择一位以突出显示其谱系。',
    flow: '密钥编排',
    stage: '阶段',
    round: '轮',
    roundKey: '轮密钥',
    value: '值',
    bits: '位',
    bit: '位',
    selected: '所选谱系',
    none: '未选择位。',
    incomplete: '轨迹不完整。保留的操作行仍可见；后续行及其谱系缺失。',
    gap: '轨迹缺口',
    word: '字',
    stages: { input: '输入', 'rot-word': '字循环移位', 'sub-word': '字替换', rcon: '轮常量', xor: '异或' },
  },
} as const satisfies Record<Locale, { readonly stages: Record<Stage, string> } & Record<string, unknown>>

const isBitsEvent = (event: TraceCheckpoint | TraceEvent): event is TraceEvent & { readonly value: BitsValue } =>
  'level' in event && event.value?.type.family === 'bits' && 'bytes' in event.value

const range = (length: number, start = 0): readonly number[] => Array.from({ length }, (_, index) => start + index)

type StateRow = {
  readonly id: string
  readonly stage: Stage
  readonly round?: number
  readonly wordIndex?: number
  readonly value: BitsValue
  readonly relationships: readonly LearningRelationship[]
  readonly bitGrouping?: { readonly size: number; readonly active: number }
}

/**
 * Rebuilds the FIPS-197 schedule as complete `bit<32·Nk>` states: each row is one operation
 * applied to the whole Nk-word state. RotWord/SubWord/Rcon transform a working copy in the slot
 * of the word they read; XOR writes each new word into its slot and restores that working copy.
 * Bits an operation leaves alone pass straight through from the row above; XOR chains within one
 * row are flattened into fan-in from earlier rows. `wordRows` records which row wrote each word.
 * Nk comes from the traced input words, not from presentation metadata, so a small teaching
 * schedule renders at its own state width.
 */
const scheduleRows = (execution: WorkerExecutionSnapshot): { readonly rows: readonly StateRow[]; readonly wordRows: ReadonlyMap<number, string> } => {
  const events = new Map(execution.trace.filter(isBitsEvent).map((event) => [event.path, event]))
  const word = (index: number, suffix = '') => events.get(`word-${index}${suffix}`)

  let nk = 0
  while (word(nk)?.stage === 'input') nk++
  if (nk === 0) return { rows: [], wordRows: new Map() }

  const width = nk * 32
  const totalWords = 4 * (nk + 7)
  const rows: StateRow[] = []
  const wordRows = new Map<number, string>()
  const slots: Uint8Array[] = []
  const slotWords: number[] = []
  const producers = new Map<number, readonly string[]>()
  const bitIds = (rowId: string, slot: number) => range(32, slot * 32).map((bit) => `${rowId}#${bit}`)
  const state = (override?: { readonly slot: number; readonly bytes: Uint8Array }): BitsValue => {
    const bytes = new Uint8Array(nk * 4)
    slots.forEach((slot, index) => bytes.set(override?.slot === index ? override.bytes : slot, index * 4))
    return bits(width, bytes)
  }
  // Rows are named by the round key their words belong to; when Nk < 4 several schedule
  // iterations share a round, so later ones are disambiguated by the word they produce.
  const rowId = (base: string, index: number) => rows.some((row) => row.id === base) ? `${base}-w${index}` : base

  const inputs = range(nk).map((index) => word(index)!)
  inputs.forEach((event, index) => {
    slots[index] = event.value.bytes
    slotWords[index] = index
    producers.set(index, bitIds('input', index))
    wordRows.set(index, 'input')
  })
  rows.push({ id: 'input', stage: 'input', value: state(), relationships: [] })

  let pending: { readonly index: number; readonly event: TraceEvent & { readonly value: BitsValue }; readonly sources: readonly (readonly string[])[] }[] = []
  const flush = (): void => {
    if (!pending.length) return
    const id = rowId(`xor-${pending[0].event.round}`, pending[0].index)
    const wordIndex = pending[0].index
    const relationships = range(nk).flatMap((slot) => {
      const written = pending.find((item) => item.index % nk === slot)
      if (!written) return producers.get(slotWords[slot])!.map((from, bit) => ({ from, to: `${id}#${slot * 32 + bit}` }))
      slots[slot] = written.event.value.bytes
      slotWords[slot] = written.index
      wordRows.set(written.index, id)
      return written.sources.flatMap((from, bit) => from.map((source) => ({ from: source, to: `${id}#${slot * 32 + bit}` })))
    })
    range(nk).forEach((slot) => producers.set(slotWords[slot], bitIds(id, slot)))
    rows.push({ id, stage: 'xor', round: pending[0].event.round, wordIndex, value: state(), relationships })
    pending = []
  }

  for (let index = nk; index < totalWords; index += 1) {
    let temp: readonly string[] | undefined
    if (index % nk === 0 || (nk > 6 && index % nk === 4)) {
      flush()
      const active = (index - 1) % nk
      temp = producers.get(index - 1)!
      const transform = (
        stage: Exclude<Stage, 'input' | 'xor'>,
        event: TraceEvent & { readonly value: BitsValue },
        sourceBits: (bit: number) => readonly number[],
        affected: readonly number[],
        bitGrouping: { readonly size: number; readonly active: number },
      ) => {
        const id = rowId(`${stage}-${event.round}`, index)
        const before = temp!
        const above = rows[rows.length - 1].id
        rows.push({
          id,
          stage,
          round: event.round,
          wordIndex: index,
          value: state({ slot: active, bytes: event.value.bytes }),
          relationships: range(width).flatMap((bit) => Math.floor(bit / 32) === active && affected.includes(bit % 32)
            ? sourceBits(bit % 32).map((source) => ({ from: before[source], to: `${id}#${bit}` }))
            : [{ from: `${above}#${bit}`, to: `${id}#${bit}` }]),
          bitGrouping,
        })
        temp = bitIds(id, active)
        range(nk).forEach((slot) => slot !== active && producers.set(slotWords[slot], bitIds(id, slot)))
      }
      const word32 = { size: 32, active }
      if (index % nk === 0) {
        const rot = word(index, '-rot')
        const sub = word(index, '-sub')
        const rcon = word(index, '-temp')
        if (!rot || !sub || !rcon) break
        transform('rot-word', rot, (bit) => [(bit + 8) % 32], range(32), word32)
        transform('sub-word', sub, (bit) => range(8, bit - bit % 8), range(32), word32)
        transform('rcon', rcon, (bit) => [bit], range(8), { size: 8, active: active * 4 })
      } else {
        const sub = word(index, '-sub')
        if (!sub) break
        transform('sub-word', sub, (bit) => range(8, bit - bit % 8), range(32), word32)
      }
    }
    const event = word(index)
    if (!event) {
      pending = []
      break
    }
    const previous = pending.find((item) => item.index === index - 1)
    pending.push({
      index,
      event,
      sources: range(32).map((bit) => [
        producers.get(index - nk)![bit],
        ...(temp ? [temp[bit]] : previous ? previous.sources[bit] : [producers.get(index - 1)![bit]]),
      ]),
    })
    if (index === totalWords - 1) flush()
  }
  return { rows, wordRows }
}

/**
 * Standalone key-expansion Learning presentation; variant comes only from explicit metadata.
 * Round keys are plain value rows: the standalone view has no overlay or round-key chips.
 */
export const keyExpansionPresentation = (
  execution: WorkerExecutionSnapshot,
  locale: string,
  executionIdentity: string,
  meta: KeyExpansionPresentationMeta,
): LearningPresentation => {
  const text = copy[locale as Locale] ?? copy['en-US']
  const label = (row: StateRow) => {
    const base = row.round === undefined ? text.stages[row.stage] : `${text.stages[row.stage]} ${row.round}`
    return row.id.endsWith(`-w${row.wordIndex}`) ? `${base} (${text.word} ${row.wordIndex})` : base
  }
  const { rows: stateRows, wordRows } = scheduleRows(execution)
  const rows: LearningRow[] = stateRows.map((row) => ({
    id: row.id,
    label: label(row),
    cells: [{ value: row.round ?? '—' }, { value: hex(row.value) }],
    selectableBits: range(row.value.type.size).map((bit) => ({
      id: `${row.id}#${bit}`,
      bit,
      value: String(bitAt(row.value, bit)),
      ariaLabel: `${label(row)}, ${text.bit} ${bit}: ${bitAt(row.value, bit)}`,
    })),
    relationships: row.relationships,
    ...(row.bitGrouping ? { bitGrouping: row.bitGrouping } : {}),
  }))
  const roundKeys = execution.trace.filter(isBitsEvent).filter((event) => event.stage === 'round-key')
  const roundKeyRow = (event: TraceEvent & { readonly value: BitsValue }): LearningRow => ({
    id: event.path,
    label: `${text.roundKey} ${event.round}`,
    cells: [{ value: event.round ?? '—' }, { value: hex(event.value) }],
  })
  const roundKeyAfter = (event: TraceEvent): string | undefined => wordRows.get((event.round ?? 0) * 4 + 3)
  const orderedRows = [
    ...rows.flatMap((row) => [row, ...roundKeys.filter((key) => roundKeyAfter(key) === row.id).map(roundKeyRow)]),
    ...roundKeys.filter((key) => roundKeyAfter(key) === undefined).map(roundKeyRow),
  ]
  const traceIncompleteDiagnostic: LearningDiagnostic | undefined = execution.traceStatus.truncated
    ? {
      code: 'aes.key-expansion-trace-incomplete',
      message: text.incomplete,
      path: 'trace',
      details: { retained: execution.traceStatus.retained, dropped: execution.traceStatus.dropped },
    }
    : undefined
  return {
    // The heading names the traced state width; a schedule narrower or wider than the declared
    // variant is a teaching schedule and is never labeled as that FIPS-197 variant.
    title: stateRows.length && stateRows[0].value.type.size !== meta.variant
      ? text.teaching(meta.algorithm, stateRows[0].value.type.size)
      : text.title(meta.algorithm, meta.variant),
    instructions: text.instructions,
    executionIdentity,
    diagnostics: traceIncompleteDiagnostic ? [traceIncompleteDiagnostic] : undefined,
    selectionStatus: (selected) => selected ? `${text.selected}: ${selected.ariaLabel}.` : text.none,
    sections: [
      { kind: 'trace', caption: text.flow, headers: [text.stage, text.round, text.value, text.bits], rows: orderedRows },
      ...(traceIncompleteDiagnostic
        ? [{ kind: 'raw' as const, caption: text.incomplete, headers: [text.stage, text.value], rows: [{ id: 'gap', label: text.gap, state: 'incomplete' as const, cells: [{ value: '—' }] }] }]
        : []),
    ],
  }
}

export const KeyExpansionRenderer: React.FC<KeyExpansionRendererProps> = ({ execution, locale, executionIdentity, presentation }) => {
  const learning = useMemo(
    () => keyExpansionPresentation(execution, locale, executionIdentity, presentation),
    [execution, locale, executionIdentity, presentation],
  )
  return <LearningPresentationView presentation={learning} />
}
