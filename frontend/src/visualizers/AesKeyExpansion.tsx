import React, { useMemo } from 'react'
import { bits, hex, type BitsValue, type TraceCheckpoint, type TraceEvent, type TraceStage, type WorkerExecutionSnapshot } from 'crypto_graph'
import { LearningPresentationView, type KeyExpansionLane, type LearningDiagnostic, type LearningPresentation, type LearningRow } from '../ui/learning'

type Locale = 'en-US' | 'zh-CN'

export type AesKeyExpansionRendererProps = {
  readonly execution: WorkerExecutionSnapshot
  readonly locale: string
  readonly executionIdentity: string
}

const copy = {
  'en-US': {
    title: 'AES key expansion',
    instructions: 'Select a bit to inspect structural lineage. Open a round key to align it against the master key.',
    flow: 'Key schedule',
    stage: 'Stage',
    round: 'Round',
    value: 'Value',
    bit: 'Bit',
    selected: 'Selected lineage',
    keyWord: 'Key word',
    rotWord: 'RotWord',
    subWord: 'SubWord',
    rcon: 'Rcon',
    wordXor: 'Word XOR',
    roundKey: 'Round key',
    masterKeyRow: 'Master key',
    lane: 'Key expansion',
    closeLane: 'Close key expansion',
    incomplete: 'Trace is incomplete. Retained raw values remain visible; lineage stops at missing stages.',
    gap: 'Trace gap',
  },
  'zh-CN': {
    title: 'AES 密钥扩展',
    instructions: '选择一位以查看结构谱系。展开某轮密钥以将其与主密钥对齐。',
    flow: '密钥编排',
    stage: '阶段',
    round: '轮',
    value: '值',
    bit: '位',
    selected: '所选谱系',
    keyWord: '密钥字',
    rotWord: '字循环移位',
    subWord: '字节替换',
    rcon: '轮常量',
    wordXor: '字异或',
    roundKey: '轮密钥',
    masterKeyRow: '主密钥',
    lane: '密钥扩展',
    closeLane: '关闭密钥扩展',
    incomplete: '轨迹不完整。保留的原始值仍可见；谱系会在缺失阶段停止。',
    gap: '轨迹缺口',
  },
} as const

const textFor = (locale: string) => copy[locale as Locale] ?? copy['en-US']

const isBitsEvent = (event: TraceCheckpoint | TraceEvent): event is TraceEvent & { readonly value: BitsValue } =>
  'level' in event && event.level === 'detail' && event.value?.type.family === 'bits' && 'bytes' in event.value

const bitAt = (value: BitsValue, bit: number): number => (value.bytes[Math.floor(bit / 8)] >> (7 - bit % 8)) & 1
const bitRange = (size: number): readonly number[] => Array.from({ length: size }, (_, bit) => bit)

const stageName = (stage: TraceStage | undefined, text: ReturnType<typeof textFor>): string => ({
  input: text.keyWord,
  'rot-word': text.rotWord,
  'sub-word': text.subWord,
  rcon: text.rcon,
  'word-xor': text.wordXor,
} as Partial<Record<TraceStage, string>>)[stage as TraceStage] ?? String(stage)

export const aesKeyExpansionPresentation = (execution: WorkerExecutionSnapshot, locale: string, executionIdentity: string): LearningPresentation => {
  const text = textFor(locale)
  const events = execution.trace.filter(isBitsEvent)
  const roundKeyEvents = events.filter((event) => event.stage === 'round-key')
  // Every word node (whether a direct key slice or a RotWord/SubWord/Rcon/XOR derivation) is
  // traced under the plain `word-N` path; those are the ones a round key's four word slots
  // reference by index below.
  const finalWordEvents = events.filter((event) => /^word-\d+$/.test(event.path))
    .sort((a, b) => Number(a.path.slice('word-'.length)) - Number(b.path.slice('word-'.length)))

  const masterKeyBitId = (bit: number): string => `master-key-bit-${bit}`
  const roundKeyBitId = (round: number | undefined, bit: number): string => `round-key-${round}-bit-${bit}`

  const rows: readonly LearningRow[] = events.map((event) => event.stage === 'round-key'
    ? {
      id: event.path,
      label: `${text.roundKey} ${event.round ?? ''}`.trim(),
      cells: [{ value: event.round ?? '—' }, { value: hex(event.value) }],
      selectableKey: { id: event.path, value: hex(event.value), ariaLabel: `${text.roundKey} ${event.round}: ${hex(event.value)}` },
    }
    : {
      id: event.path,
      label: stageName(event.stage, text),
      cells: [{ value: event.round ?? '—' }, { value: `${event.path}: ${hex(event.value)}` }],
      selectableBits: bitRange(event.value.type.size).map((bit) => ({
        id: `${event.path}#${bit}`,
        bit,
        value: String(bitAt(event.value, bit)),
        ariaLabel: `${stageName(event.stage, text)} ${event.path}, ${text.bit} ${bit}: ${bitAt(event.value, bit)}`,
      })),
    })

  // A structured diagnostic (stable code/path/details, like the ones `compile`/`execute` return
  // for invalid key type, key length, missing input, and malformed value) rather than only the
  // boolean `traceStatus.truncated` flag, so an incomplete trace is as machine-checkable as those
  // other cases instead of being conveyed solely through locale-specific UI copy.
  const traceIncompleteDiagnostic: LearningDiagnostic | undefined = execution.traceStatus.truncated
    ? {
      code: 'aes.key-expansion-trace-incomplete',
      message: text.incomplete,
      path: 'trace',
      details: { retained: execution.traceStatus.retained, dropped: execution.traceStatus.dropped },
    }
    : undefined

  // Reconstructing the master key from its first Nk words, and drawing FIPS-197 copy lineage
  // from it, both require every one of those words to be present. A truncated trace (some
  // detail-level events dropped) cannot be trusted to have them all, so skip the lane rather
  // than fabricate a master key or lineage from a partial word set.
  const masterKeyRow = finalWordEvents[0]
  const keyExpansionLane: KeyExpansionLane | undefined = masterKeyRow && !traceIncompleteDiagnostic
    ? (() => {
      const keySliceEvents = finalWordEvents.filter((event) => event.stage === 'input')
      const masterKeyBytes = new Uint8Array(keySliceEvents.length * 4)
      keySliceEvents.forEach((event, index) => masterKeyBytes.set(event.value.bytes, index * 4))
      const masterKey = bits(masterKeyBytes.length * 8, masterKeyBytes)
      // A round key's word slot is a byte-exact copy of the master key (FIPS-197) exactly when
      // that slot's word is itself a direct key slice (`stage: 'input'`, i.e. its index is below
      // Nk) rather than a RotWord/SubWord/Rcon/XOR derivation. For AES-192 this makes round key 1
      // a partial copy (its first two words only); for AES-256 round keys 0 and 1 are both full
      // copies, since Nk=8 spans two round keys' worth of words.
      const copyRelationships = roundKeyEvents.flatMap((event) => {
        const round = event.round ?? 0
        return bitRange(4).flatMap((slot) => {
          const wordIndex = round * 4 + slot
          const wordEvent = finalWordEvents[wordIndex]
          return wordEvent?.stage === 'input'
            ? bitRange(32).map((bit) => ({ from: masterKeyBitId(wordIndex * 32 + bit), to: roundKeyBitId(round, slot * 32 + bit) }))
            : []
        })
      })
      return {
        caption: text.lane,
        closeLabel: text.closeLane,
        rows: [
          {
            id: 'lane-master-key',
            anchor: masterKeyRow.path,
            selectableBits: bitRange(masterKey.type.size).map((bit) => ({
              id: masterKeyBitId(bit),
              bit,
              value: String(bitAt(masterKey, bit)),
              ariaLabel: `${text.masterKeyRow}, ${text.bit} ${bit}: ${bitAt(masterKey, bit)}`,
            })),
            relationships: copyRelationships.length ? copyRelationships : undefined,
          },
          ...roundKeyEvents.map((event) => ({
            id: `lane-${event.path}`,
            anchor: event.path,
            selectableBits: bitRange(event.value.type.size).map((bit) => ({
              id: roundKeyBitId(event.round, bit),
              bit,
              value: String(bitAt(event.value, bit)),
              ariaLabel: `${text.roundKey} ${event.round}, ${text.bit} ${bit}: ${bitAt(event.value, bit)}`,
            })),
          })),
        ],
      }
    })()
    : undefined

  return {
    title: text.title,
    instructions: text.instructions,
    executionIdentity,
    keyExpansionLane,
    diagnostics: traceIncompleteDiagnostic ? [traceIncompleteDiagnostic] : undefined,
    selectionStatus: (selected) => {
      if (!selected) return text.gap
      if (!('bit' in selected)) return `${text.selected}: ${selected.ariaLabel}`
      const laneRoundKey = /^round-key-(\d+)-bit-/.exec(selected.id)
      const label = rows.find((row) => row.selectableBits?.includes(selected))?.label
        ?? (laneRoundKey ? `${text.roundKey} ${laneRoundKey[1]}` : text.masterKeyRow)
      return `${text.selected}: ${label}, ${text.bit} ${selected.bit}.`
    },
    sections: [
      { kind: 'trace', caption: text.flow, headers: [text.stage, text.round, text.value, text.bit], rows },
      ...(traceIncompleteDiagnostic
        ? [{ kind: 'raw' as const, caption: traceIncompleteDiagnostic.message, headers: [text.stage, text.value], rows: [{ id: 'gap', label: text.gap, state: 'incomplete' as const, cells: [{ value: '—' }] }] }]
        : []),
    ],
  }
}

export const AesKeyExpansionRenderer: React.FC<AesKeyExpansionRendererProps> = ({ execution, locale, executionIdentity }) => {
  const presentation = useMemo(() => aesKeyExpansionPresentation(execution, locale, executionIdentity), [execution, locale, executionIdentity])
  return <LearningPresentationView presentation={presentation} />
}
