import React, { useMemo } from 'react'
import { hex, type CryptoValue, type TraceCheckpoint, type TraceEvent, type TraceStage, type WorkerExecutionSnapshot } from 'crypto_graph'
import { learningColors, LearningPresentationView, type LearningDiagnostic, type LearningPresentation, type LearningRow } from '../ui/learning'
import { PermutationVisual } from './OperationVisuals'

type Locale = 'en-US' | 'zh-CN'

export type ExecutionTraceRendererProps = {
  readonly execution: WorkerExecutionSnapshot
  readonly locale: string
  readonly executionIdentity: string
}

const copy = {
  'en-US': {
    title: 'Execution trace',
    flow: 'Traced state',
    stage: 'Stage',
    round: 'Round',
    value: 'Value',
    details: 'Operation detail',
    sBox: 'S-box',
    plaintextInput: 'Plaintext input',
    ciphertextInput: 'Ciphertext input',
    output: 'Output',
    checkpoint: 'Traced value',
    incomplete: 'Trace is incomplete. Retained checkpoints remain visible; later checkpoints are missing.',
    gap: 'Trace gap',
    modeMissing: 'This trace contains a key schedule, but the Step declares no key-expansion presentation. Showing the default trace without key-schedule rows.',
    grid: 'Transposition grid', empty: 'Empty cell', emptyMarker: '[empty]', spaceMarker: '[space]', order: 'Write/read order',
    transpositionEncryptWarning: 'The text length is smaller than the encryption parameter; encryption leaves the text unchanged.',
    transpositionDecryptWarning: 'The text length is smaller than the decryption parameter; decryption leaves the text unchanged.',
    writePositions: 'Write order', readPositions: 'Read order',
    positionLegend: 'Each cell shows input index:character. Input indices start at 0; follow the arrows in order.',
    stages: {
      input: 'Input',
      'round-key': 'Round key',
      'key-mix': 'Key mixing',
      substitute: 'Substitution',
      permute: 'Permutation',
      output: 'Round state',
      'rot-word': 'RotWord',
      'sub-word': 'SubWord',
      rcon: 'Rcon',
      'word-xor': 'Word XOR',
      'add-round-key': 'AddRoundKey',
      'sub-bytes': 'SubBytes',
      'inv-sub-bytes': 'InvSubBytes',
      'shift-rows': 'ShiftRows',
      'inv-shift-rows': 'InvShiftRows',
      'mix-columns': 'MixColumns',
      'inv-mix-columns': 'InvMixColumns',
      transposition: 'Transposition',
    },
  },
  'zh-CN': {
    title: '执行轨迹',
    flow: '轨迹状态',
    stage: '阶段',
    round: '轮',
    value: '值',
    details: '操作详情',
    sBox: 'S 盒',
    plaintextInput: '明文输入',
    ciphertextInput: '密文输入',
    output: '输出',
    checkpoint: '轨迹值',
    incomplete: '轨迹不完整。保留的检查点仍可见；后续检查点缺失。',
    gap: '轨迹缺口',
    modeMissing: '此轨迹包含密钥编排，但该步骤未声明密钥扩展展示方式。当前显示不含密钥编排行的默认轨迹。',
    grid: '转置网格', empty: '空单元格', emptyMarker: '[空单元格]', spaceMarker: '[空格]', order: '写入/读取顺序',
    transpositionEncryptWarning: '文本长度小于加密参数，加密不会改变文本。',
    transpositionDecryptWarning: '文本长度小于解密参数，解密不会改变文本。',
    writePositions: '写入顺序', readPositions: '读取顺序',
    positionLegend: '每格显示输入序号:字符。输入序号从 0 开始，按箭头顺序写入或读取。',
    stages: {
      input: '输入',
      'round-key': '轮密钥',
      'key-mix': '密钥混合',
      substitute: '替换',
      permute: '置换',
      output: '轮状态',
      'rot-word': '字循环',
      'sub-word': '字替换',
      rcon: '轮常量',
      'word-xor': '字异或',
      'add-round-key': '轮密钥加',
      'sub-bytes': '字节替换',
      'inv-sub-bytes': '逆字节替换',
      'shift-rows': '行移位',
      'inv-shift-rows': '逆行移位',
      'mix-columns': '列混合',
      'inv-mix-columns': '逆列混合',
      transposition: '转置',
    },
  },
} as const satisfies Record<Locale, { readonly stages: Record<TraceStage, string> } & Record<string, unknown>>

const textFor = (locale: string) => copy[locale as Locale] ?? copy['en-US']

const valueText = (value: CryptoValue | undefined): string => {
  if (!value) return '—'
  if ('symbol' in value) return value.symbol
  if ('symbols' in value) return value.symbols.join('')
  if ('value' in value) return String(value.value)
  if ('words' in value) return `0x${[...value.words].map((word) => word.toString(16).padStart(2, '0')).join('')}`
  return hex(value)
}

const stageLabel = (event: TraceEvent | TraceCheckpoint, text: ReturnType<typeof textFor>, outputs: WorkerExecutionSnapshot['outputs']): string => {
  if (event.path === 'plaintext') return text.plaintextInput
  if (event.path === 'ciphertext') return text.ciphertextInput
  if (event.path === 'output') return text.output
  if ('summary' in event || !event.stage) return `${event.path in outputs ? text.output : text.checkpoint} (${event.path})`
  const round = event.round
  return round === undefined ? text.stages[event.stage] : `${text.stages[event.stage]} ${round}`
}

const operationDetail = (event: TraceEvent | TraceCheckpoint, text: ReturnType<typeof textFor>): React.ReactNode => {
  const operation = 'operation' in event ? event.operation : undefined
  if (operation?.permutation) return <PermutationVisual permutation={operation.permutation} />
  if (operation?.sBox) return `${text.sBox}: ${operation.sBox.map((entry) => entry.toString(16)).join(' ')}`
  if (operation?.grid) {
    const grid = operation.grid
    const symbolText = (cell: string) => cell === ' ' ? text.spaceMarker : cell
    const symbols = new Map(grid.rows.flatMap((row, rowIndex) => row.flatMap((cell, columnIndex) =>
      cell === null ? [] : [[grid.inputPositions[rowIndex][columnIndex], symbolText(cell)] as const])))
    const sequence = (positions: readonly number[]) => positions.map((position) => `${position}:${symbols.get(position)}`).join(' → ')
    return <section aria-label={text.grid}>
      <p>{text.positionLegend}</p>
      <table><caption>{text.order}</caption><tbody>
        {grid.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex}
          aria-label={cell === null ? text.empty : undefined}
          style={{ border: `1px solid ${learningColors.border}`, padding: '0.5rem', textAlign: 'center', whiteSpace: 'pre-wrap', backgroundColor: cell === null ? learningColors.incomplete : undefined }}>
          {cell === null ? text.emptyMarker : `${grid.inputPositions[rowIndex][columnIndex]}:${symbolText(cell)}`}
        </td>)}</tr>)}
      </tbody></table>
      <p>{text.writePositions}: {sequence(grid.writeOrder)}</p>
      <p>{text.readPositions}: {sequence(grid.readOrder)}</p>
    </section>
  }
  return undefined
}

/**
 * Descriptor-free rendering for any ordinary execution trace: every retained trace event becomes
 * one row labeled from its semantic stage and round, so new algorithms need no renderer descriptor.
 * Internal key-schedule words stay trace metadata; their presence without presentation metadata
 * is reported instead of rendered as a word log.
 */
export const executionTracePresentation = (execution: WorkerExecutionSnapshot, locale: string, executionIdentity: string): LearningPresentation => {
  const text = textFor(locale)
  const events = execution.trace.filter((event) => !('word' in event && event.word !== undefined))
  const modeMissingDiagnostic: LearningDiagnostic | undefined = events.length < execution.trace.length
    ? { code: 'presentation.key-expansion-mode-missing', message: text.modeMissing, path: 'presentation' }
    : undefined
  const rows: LearningRow[] = events.map((event) => {
    const detail = operationDetail(event, text)
    const value = 'summary' in event ? execution.outputs[event.path] : event.value
    return {
      id: event.path,
      label: stageLabel(event, text, execution.outputs),
      ...(!('summary' in event) && !event.value ? { state: 'incomplete' as const } : {}),
      cells: [
        { value: 'round' in event && event.round !== undefined ? event.round : '—' },
        { value: valueText(value) },
      ],
      ...(detail ? { detail } : {}),
    }
  })
  const traceIncompleteDiagnostic: LearningDiagnostic | undefined = execution.traceStatus.truncated
    ? {
      code: 'trace.incomplete',
      message: text.incomplete,
      path: 'trace',
      details: { retained: execution.traceStatus.retained, dropped: execution.traceStatus.dropped },
    }
    : undefined
  const diagnostics = [modeMissingDiagnostic, traceIncompleteDiagnostic].filter((item): item is LearningDiagnostic => item !== undefined)
  const warnings = execution.warnings?.map((warning) => ({
    code: warning.code,
    message: warning.details.direction === 'decrypt' ? text.transpositionDecryptWarning : text.transpositionEncryptWarning,
    path: warning.path,
  })) ?? []
  const allDiagnostics = [...diagnostics, ...warnings]
  return {
    title: text.title,
    instructions: modeMissingDiagnostic?.message,
    executionIdentity,
    diagnostics: allDiagnostics.length ? allDiagnostics : undefined,
    sections: [
      {
        kind: 'trace',
        caption: text.flow,
        headers: rows.some((row) => row.detail) ? [text.stage, text.round, text.value, text.details] : [text.stage, text.round, text.value],
        rows,
      },
      ...(traceIncompleteDiagnostic
        ? [{ kind: 'raw' as const, caption: text.incomplete, headers: [text.stage, text.value], rows: [{ id: 'gap', label: text.gap, state: 'incomplete' as const, cells: [{ value: '—' }] }] }]
        : []),
    ],
  }
}

export const ExecutionTraceRenderer: React.FC<ExecutionTraceRendererProps> = ({ execution, locale, executionIdentity }) => {
  const presentation = useMemo(() => executionTracePresentation(execution, locale, executionIdentity), [execution, locale, executionIdentity])
  return <LearningPresentationView presentation={presentation} />
}
