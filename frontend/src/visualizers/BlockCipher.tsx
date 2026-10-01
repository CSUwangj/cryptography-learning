import React, { useMemo } from 'react'
import { hex, type BitsValue, type TraceCheckpoint, type TraceEvent, type WorkerExecutionSnapshot } from 'crypto_graph'
import { LearningPresentationView, type KeyExpansionLane, type LearningPresentation, type LearningRelationship, type LearningRoundKey, type LearningRow } from '../ui/learning'
import { executionTracePresentation } from './ExecutionTrace'
import { keyExpansionPresentation } from './KeyExpansion'
import { bitAt, stateSources } from './traceFlow'

type Locale = 'en-US' | 'zh-CN'
type Variant = 128 | 192 | 256
type Direction = 'encrypt' | 'decrypt'

export type BlockCipherPresentationMeta = {
  readonly algorithm: 'AES'
  readonly variant: Variant
  readonly direction: Direction
}

export type BlockCipherRendererProps = {
  readonly execution: WorkerExecutionSnapshot
  readonly locale: string
  readonly executionIdentity: string
  readonly presentation: BlockCipherPresentationMeta
}

const copy = {
  'en-US': {
    encrypt: (variant: Variant) => `AES-${variant} encryption`,
    decrypt: (variant: Variant) => `AES-${variant} decryption`,
    instructions: 'Every line is a structural bit relationship. Select a bit to emphasize its lineage.',
    openKey: ' Open a round key to see its key schedule.',
    bits: 'Bits',
    bit: 'Bit',
    selected: 'Selected lineage',
    none: 'No bit selected.',
    lane: 'Key expansion',
    closeLane: 'Close key expansion',
  },
  'zh-CN': {
    encrypt: (variant: Variant) => `AES-${variant} 加密`,
    decrypt: (variant: Variant) => `AES-${variant} 解密`,
    instructions: '每条连线都是一条结构位关系。选择一位以突出显示其谱系。',
    openKey: '展开某轮密钥以查看其密钥编排。',
    bits: '位',
    bit: '位',
    selected: '所选谱系',
    none: '未选择位。',
    lane: '密钥扩展',
    closeLane: '关闭密钥扩展',
  },
} as const

const range = (length: number, start = 0): readonly number[] => Array.from({ length }, (_, index) => start + index)

const isBitsEvent = (event: TraceCheckpoint | TraceEvent): event is TraceEvent & { readonly value: BitsValue } =>
  'level' in event && event.value?.type.family === 'bits' && 'bytes' in event.value

/**
 * Full-state block-cipher Learning presentation; variant/direction come only from explicit metadata.
 * Each round key sits right before the AddRoundKey that consumes it. When the same execution also
 * traced the key schedule, encryption round-key chips open it as the key-expansion lane.
 */
export const blockCipherPresentation = (
  execution: WorkerExecutionSnapshot,
  locale: string,
  executionIdentity: string,
  meta: BlockCipherPresentationMeta,
): LearningPresentation => {
  const text = copy[locale as Locale] ?? copy['en-US']
  const generic = executionTracePresentation(execution, locale, executionIdentity)
  const labels = new Map(generic.sections[0].rows.map((row) => [row.id, row.label]))
  const events = execution.trace.filter(isBitsEvent)
  const roundKeys = new Map(events.filter((event) => event.stage === 'round-key').map((event) => [event.path, event]))
  const stateEvents = events.filter((event) => event.path === 'plaintext' || event.path === 'ciphertext' || event.path.startsWith('cipher-'))

  const schedule = meta.direction === 'encrypt' && stateEvents[0]
    ? keyExpansionPresentation(execution, locale, executionIdentity, meta).sections[0].rows
    : []
  const keyExpansionLane: KeyExpansionLane | undefined = schedule[0]?.id === 'input'
    ? {
      caption: text.lane,
      closeLabel: text.closeLane,
      rows: schedule.map((row) => row.selectableKey
        ? { id: `schedule-${row.id}`, anchor: row.id }
        : {
          id: `schedule-${row.id}`,
          label: row.label,
          selectableBits: row.selectableBits,
          relationships: row.relationships,
          ...(row.bitGrouping ? { bitGrouping: row.bitGrouping } : {}),
          ...(row.id === 'input' ? { anchor: stateEvents[0].path } : {}),
        }),
    }
    : undefined

  const bitRow = (event: TraceEvent & { readonly value: BitsValue }, relationships: readonly LearningRelationship[], key?: LearningRoundKey): LearningRow => {
    const label = labels.get(event.path) ?? event.path
    return {
      id: event.path,
      label,
      cells: [{ value: event.round ?? '—' }, { value: hex(event.value) }],
      selectableBits: range(event.value.type.size).map((bit) => ({
        id: `${event.path}#${bit}`,
        bit,
        value: String(bitAt(event.value, bit)),
        ariaLabel: `${label}, ${text.bit} ${bit}: ${bitAt(event.value, bit)}`,
      })),
      relationships,
      ...(key ? { selectableKey: key } : {}),
    }
  }
  const rows: LearningRow[] = []
  let previous: string | undefined
  for (const event of stateEvents) {
    const roundKey = event.stage === 'add-round-key' ? roundKeys.get(`round-key-${event.round}`) : undefined
    if (roundKey) {
      const chip = keyExpansionLane && { id: roundKey.path, value: hex(roundKey.value), ariaLabel: `${labels.get(roundKey.path)}: ${hex(roundKey.value)}` }
      rows.push(bitRow(roundKey, [], chip || undefined))
    }
    const from = previous
    rows.push(bitRow(event, range(event.value.type.size).flatMap((bit) => [
      ...(from ? stateSources(event.stage, bit).map((source) => ({ from: `${from}#${source}`, to: `${event.path}#${bit}` })) : []),
      ...(roundKey ? [{ from: `${roundKey.path}#${bit}`, to: `${event.path}#${bit}` }] : []),
    ])))
    previous = event.path
  }
  rows.push(...generic.sections[0].rows.filter((row) => row.id === 'output'))

  return {
    ...generic,
    title: meta.direction === 'encrypt' ? text.encrypt(meta.variant) : text.decrypt(meta.variant),
    instructions: keyExpansionLane ? text.instructions + text.openKey : text.instructions,
    diagnostics: generic.diagnostics?.map((diagnostic) => ({ ...diagnostic, code: 'aes.cipher-trace-incomplete' })),
    keyExpansionLane,
    selectionStatus: (selected) => selected ? `${text.selected}: ${selected.ariaLabel}.` : text.none,
    sections: [
      { ...generic.sections[0], headers: [...generic.sections[0].headers.slice(0, 3), text.bits], rows },
      ...generic.sections.slice(1),
    ],
  }
}

export const BlockCipherRenderer: React.FC<BlockCipherRendererProps> = ({ execution, locale, executionIdentity, presentation }) => {
  const learning = useMemo(
    () => blockCipherPresentation(execution, locale, executionIdentity, presentation),
    [execution, locale, executionIdentity, presentation],
  )
  return <LearningPresentationView presentation={learning} />
}
