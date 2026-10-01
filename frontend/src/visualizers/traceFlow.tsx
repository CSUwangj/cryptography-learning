import React from 'react'
import { hex, type BitsValue, type TraceOperation, type TraceStage } from 'crypto_graph'
import type { LearningRow } from '../ui/learning'
import { PermutationVisual, SubstitutionVisual, XorVisual } from './OperationVisuals'

const pathTokens = {
  'zh-CN': {
    plaintext: '明文',
    ciphertext: '密文',
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

const range = (length: number, start = 0): readonly number[] => Array.from({ length }, (_, index) => start + index)

// FIPS-197 column-major byte index = row + 4*column. `aes.shift-rows@1` reads input column
// (c + r) into output c; `aes.inv-shift-rows@1` reads (c - r). `stateSources` answers "which
// prior bits feed this output bit" (sink-side). Callers that walk source→sink edges must iterate
// output bits and attach `from: source` (see BlockCipher / flowRows AES branch) — never feed a
// prior bit into `stateSources` as if it were a forward target map.
const shiftedByte = (byte: number, direction: 1 | -1): number => byte % 4 + 4 * ((Math.floor(byte / 4) + direction * (byte % 4) + 4) % 4)

/** Bits of the previous state that structurally feed `bit`; whole bytes for S-boxes, whole columns for MixColumns. */
export const stateSources = (stage: TraceStage | undefined, bit: number): readonly number[] => {
  if (stage === 'sub-bytes' || stage === 'inv-sub-bytes') return range(8, bit - bit % 8)
  if (stage === 'shift-rows') return [shiftedByte(bit >> 3, 1) * 8 + bit % 8]
  if (stage === 'inv-shift-rows') return [shiftedByte(bit >> 3, -1) * 8 + bit % 8]
  // Column-major layout: column c is bytes 4c..4c+3 (32 consecutive bits), matching aes.mix-columns@1.
  if (stage === 'mix-columns' || stage === 'inv-mix-columns') return range(32, Math.floor((bit >> 3) / 4) * 32)
  if (stage === 'add-round-key') return [bit]
  return []
}

/** Forward SPN bit targets from a prior-stage bit; AES stages use sink-side `stateSources` instead. */
export const traceBitTargets = (
  stage: TraceStage | undefined,
  permutation: readonly number[] | undefined,
  bit: number,
): readonly number[] => stage === 'substitute'
  ? [Math.floor(bit / 4) * 4, Math.floor(bit / 4) * 4 + 1, Math.floor(bit / 4) * 4 + 2, Math.floor(bit / 4) * 4 + 3]
  : stage === 'permute'
    ? permutation ? [permutation[Math.floor(bit / 4)] * 4 + bit % 4] : []
    : [bit]

export const bitAt = (value: BitsValue, bit: number): number => (value.bytes[Math.floor(bit / 8)] >> (7 - bit % 8)) & 1

const aesStateStage = (stage: TraceStage | undefined): boolean =>
  stage === 'add-round-key' || stage === 'sub-bytes' || stage === 'inv-sub-bytes'
  || stage === 'shift-rows' || stage === 'inv-shift-rows'
  || stage === 'mix-columns' || stage === 'inv-mix-columns'

/** One traced state; `values` holds one value per compared execution. */
export type FlowNode = {
  readonly path: string
  readonly round?: number
  readonly stage?: TraceStage
  readonly operation?: TraceOperation
  readonly values: readonly BitsValue[]
  readonly mask?: BitsValue
}

export type FlowText = {
  readonly bit: string
  readonly keys: string
  readonly xor: string
  readonly sBox: string
  readonly different: string
}

const connected = (before: FlowNode, after: FlowNode): boolean =>
  (aesStateStage(after.stage) && (before.stage === 'input' || aesStateStage(before.stage)))
  || (after.stage === 'key-mix' && (before.stage === 'input' || before.stage === 'output'))
  || (after.stage === 'substitute' && before.stage === 'key-mix')
  || (after.stage === 'permute' && before.stage === 'substitute')
  || (after.stage === 'output' && (before.stage === 'permute' || before.stage === 'output'))

const bitId = (node: FlowNode, bit: number): string => `${node.path}#${bit}`
const bitRange = (node: FlowNode): readonly number[] => Array.from({ length: node.values[0].type.size }, (_, bit) => bit)

/** Rows in trace order without `cells`; round keys become whole-key rows linked to their key-mix / AddRoundKey bits. */
export const flowRows = (
  nodes: readonly FlowNode[],
  text: FlowText,
  stageName: (node: FlowNode) => string,
): readonly Omit<LearningRow, 'cells'>[] => {
  const keys = new Map<number | undefined, FlowNode>()
  let before: FlowNode | undefined
  return nodes.map((node) => {
    if (node.stage === 'round-key') {
      keys.set(node.round, node)
      const mix = nodes.find((item) =>
        (item.stage === 'key-mix' || item.stage === 'add-round-key') && item.round === node.round)
      return {
        id: node.path,
        label: `${text.keys} ${node.round ?? ''}`.trim(),
        selectableKey: { id: node.path, value: hex(node.values[0]), ariaLabel: `${text.keys}: ${hex(node.values[0])}` },
        relationships: mix ? bitRange(mix).map((bit) => ({ from: node.path, to: bitId(mix, bit) })) : undefined,
      }
    }
    const previous = before && connected(before, node) ? before : undefined
    const key = keys.get(node.round)
    before = node
    return {
      id: node.path,
      label: stageName(node),
      selectableBits: bitRange(node).map((bit) => {
        const different = node.mask ? bitAt(node.mask, bit) === 1 : false
        const value = node.values.map((item) => bitAt(item, bit)).join('|')
        return {
          id: bitId(node, bit),
          bit,
          value: different ? <u>{value}</u> : value,
          state: different ? 'changed' : undefined,
          ariaLabel: `${stageName(node)}, ${text.bit} ${bit}: ${value}${different ? `, ${text.different}` : ''}`,
        }
      }),
      relationships: previous && (aesStateStage(node.stage)
        ? bitRange(node).flatMap((bit) =>
          stateSources(node.stage, bit).map((source) => ({ from: bitId(previous, source), to: bitId(node, bit) })))
        : bitRange(previous).flatMap((bit) =>
          traceBitTargets(node.stage, node.operation?.permutation, bit).map((target) => ({ from: bitId(previous, bit), to: bitId(node, target) })))),
      detail: previous && node.stage === 'key-mix' && key
        ? <XorVisual label={text.xor} terms={node.values.map((value, lane) => ({ left: hex(previous.values[lane]), right: hex(key.values[lane]), output: hex(value) }))} />
        : previous && node.stage === 'substitute' && node.operation?.sBox
          ? <SubstitutionVisual label={text.sBox} lanes={node.values.map((value, lane) => ({ input: hex(previous.values[lane]), output: hex(value) }))} sBox={node.operation.sBox} />
          : node.stage === 'permute' && node.operation?.permutation
            ? <PermutationVisual permutation={node.operation.permutation} />
            : undefined,
    }
  })
}
