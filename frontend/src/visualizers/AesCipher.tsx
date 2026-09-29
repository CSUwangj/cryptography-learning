import React, { useMemo } from 'react'
import { hex, type BitsValue, type TraceEvent, type WorkerExecutionSnapshot } from 'crypto_graph'
import { LearningPresentationView, type LearningDiagnostic, type LearningPresentation } from '../ui/learning'

type Locale = 'en-US' | 'zh-CN'

export type AesCipherRendererProps = {
  readonly execution: WorkerExecutionSnapshot
  readonly locale: string
  readonly executionIdentity: string
}

const copy = {
  'en-US': {
    encryptTitle: 'AES-128 encryption',
    decryptTitle: 'AES-128 decryption',
    flow: 'Cipher state',
    stage: 'Stage',
    round: 'Round',
    value: 'Value',
    plaintextInput: 'Plaintext input',
    ciphertextInput: 'Ciphertext input',
    'round-key': 'Round key',
    'add-round-key': 'AddRoundKey',
    'sub-bytes': 'SubBytes',
    'inv-sub-bytes': 'InvSubBytes',
    'shift-rows': 'ShiftRows',
    'inv-shift-rows': 'InvShiftRows',
    'mix-columns': 'MixColumns',
    'inv-mix-columns': 'InvMixColumns',
    output: 'Output',
    incomplete: 'Trace is incomplete. Retained checkpoints remain visible; later checkpoints are missing.',
    gap: 'Trace gap',
  },
  'zh-CN': {
    encryptTitle: 'AES-128 加密',
    decryptTitle: 'AES-128 解密',
    flow: '密码状态',
    stage: '阶段',
    round: '轮',
    value: '值',
    plaintextInput: '明文输入',
    ciphertextInput: '密文输入',
    'round-key': '轮密钥',
    'add-round-key': '轮密钥加',
    'sub-bytes': '字节替换',
    'inv-sub-bytes': '逆字节替换',
    'shift-rows': '行移位',
    'inv-shift-rows': '逆行移位',
    'mix-columns': '列混合',
    'inv-mix-columns': '逆列混合',
    output: '输出',
    incomplete: '轨迹不完整。保留的检查点仍可见；后续检查点缺失。',
    gap: '轨迹缺口',
  },
} as const

const textFor = (locale: string) => copy[locale as Locale] ?? copy['en-US']

type StageCopy = Omit<ReturnType<typeof textFor>, 'flow' | 'stage' | 'round' | 'value' | 'plaintextInput' | 'ciphertextInput' | 'incomplete' | 'gap' | 'encryptTitle' | 'decryptTitle'>

const isBits = (event: TraceEvent): event is TraceEvent & { readonly value: BitsValue } =>
  event.value?.type.family === 'bits' && 'bytes' in event.value

const stageLabel = (event: TraceEvent, text: ReturnType<typeof textFor>): string => {
  if (event.path === 'plaintext') return text.plaintextInput
  if (event.path === 'ciphertext') return text.ciphertextInput
  if (event.path === 'output') return text.output
  const name = (text as StageCopy)[event.stage as keyof StageCopy] ?? String(event.stage)
  return event.round === undefined ? name : `${name} ${event.round}`
}

/**
 * A plain checkpoint-by-checkpoint trace table (no bit-level selection or lineage, unlike
 * `teachingSpnPresentation`/`aesKeyExpansionPresentation`): #84 asks only that FIPS-197 round
 * checkpoints render through the shared Learning presentation components, and MixColumns mixes
 * bits across a whole GF(2^8) column rather than a clean per-bit/per-nibble mapping, so a
 * bit-lineage diagram here would either misrepresent that mixing or need to hide it - showing
 * only the checkpoint values stays accurate without inventing an unrequested feature.
 */
export const aesCipherPresentation = (execution: WorkerExecutionSnapshot, locale: string, executionIdentity: string): LearningPresentation => {
  const text = textFor(locale)
  const events = execution.trace.flatMap((event) => 'value' in event && isBits(event) ? [event] : [])
  const decrypting = events.some((event) => event.path === 'ciphertext')
  const rows = events.map((event) => ({
    id: event.path,
    label: stageLabel(event, text),
    cells: [{ value: event.round ?? '—' }, { value: hex(event.value) }],
  }))
  // Structured (stable code/path/details), like the incomplete-trace diagnostic
  // `aesKeyExpansionPresentation` already returns for #83, not only the human-readable "raw"
  // gap row below - #84 asks for a machine-checkable diagnostic here too.
  const traceIncompleteDiagnostic: LearningDiagnostic | undefined = execution.traceStatus.truncated
    ? {
      code: 'aes.cipher-trace-incomplete',
      message: text.incomplete,
      path: 'trace',
      details: { retained: execution.traceStatus.retained, dropped: execution.traceStatus.dropped },
    }
    : undefined
  return {
    title: decrypting ? text.decryptTitle : text.encryptTitle,
    executionIdentity,
    diagnostics: traceIncompleteDiagnostic ? [traceIncompleteDiagnostic] : undefined,
    sections: [
      { kind: 'trace', caption: text.flow, headers: [text.stage, text.round, text.value], rows },
      ...(traceIncompleteDiagnostic
        ? [{ kind: 'raw' as const, caption: text.incomplete, headers: [text.stage, text.value], rows: [{ id: 'gap', label: text.gap, state: 'incomplete' as const, cells: [{ value: '—' }] }] }]
        : []),
    ],
  }
}

export const AesCipherRenderer: React.FC<AesCipherRendererProps> = ({ execution, locale, executionIdentity }) => {
  const presentation = useMemo(() => aesCipherPresentation(execution, locale, executionIdentity), [execution, locale, executionIdentity])
  return <LearningPresentationView presentation={presentation} />
}
