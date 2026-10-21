export type SourceOrigin = {
  file: string
  line: number
  column: number
}

export type Diagnostic = {
  code: string
  message: string
  path: string
  span?: SourceOrigin
  details: Record<string, string | number | boolean | null>
}

export type Size = number | string

export type PortType =
  | { family: 'bits'; size: Size }
  | { family: 'bytes'; size: Size }
  | { family: 'words'; size: Size; wordSize: 8 }
  | { family: 'alphabet-symbol'; mapping: string }
  | { family: 'alphabet-text'; mapping: string }
  | { family: 'text' }
  | { family: 'integer'; signed: true; safe: true }
  | { family: 'alphabet-policy' }
  | { family: 'alphabet-direction' }

export type BitsValue = {
  type: { family: 'bits'; size: number }
  bytes: Uint8Array
}

export type BytesValue = {
  type: { family: 'bytes'; size: number }
  bytes: Uint8Array
}

export type WordsValue = {
  type: { family: 'words'; size: number; wordSize: 8 }
  words: Uint8Array
}

export type AlphabetMapping = {
  id: string
  symbols: readonly string[]
}

export type AlphabetSymbolValue = {
  type: { family: 'alphabet-symbol'; mapping: string }
  symbol: string
}

export type AlphabetTextValue = {
  type: { family: 'alphabet-text'; mapping: string }
  symbols: readonly string[]
}
export type TextValue = { type: { family: 'text' }; symbols: readonly string[] }

export type IntegerValue = {
  type: { family: 'integer'; signed: true; safe: true }
  value: number
}

export type AlphabetPolicyValue = {
  type: { family: 'alphabet-policy' }
  value: 'preserve' | 'strict'
}

export type AlphabetDirectionValue = {
  type: { family: 'alphabet-direction' }
  value: 'encrypt' | 'decrypt'
}

export type CryptoValue = BitsValue | BytesValue | WordsValue | AlphabetSymbolValue | AlphabetTextValue | TextValue | IntegerValue | AlphabetPolicyValue | AlphabetDirectionValue

type ByteValue = BitsValue | BytesValue | WordsValue

const isIntegerValue = (value: CryptoValue): value is IntegerValue => value.type.family === 'integer'
const isAlphabetPolicyValue = (value: CryptoValue): value is AlphabetPolicyValue => value.type.family === 'alphabet-policy'
const isAlphabetDirectionValue = (value: CryptoValue): value is AlphabetDirectionValue => value.type.family === 'alphabet-direction'
const isAlphabetTextValue = (value: CryptoValue): value is AlphabetTextValue => value.type.family === 'alphabet-text'
const isTextValue = (value: CryptoValue): value is TextValue => value.type.family === 'text'
const isByteValue = (value: CryptoValue): value is ByteValue =>
  value.type.family === 'bits' || value.type.family === 'bytes' || value.type.family === 'words'

export type Port = {
  name: string
  type: PortType
}

export type OperationManifest = {
  identity: string
  inputs: readonly Port[]
  outputs: readonly Port[]
  outputTypeParameter?: string
}

type LineageSource = { readonly port: string; readonly bit: number }
type LineageDeclaration = Readonly<Record<string, readonly (readonly LineageSource[])[]>>

export type AuthoredInput = {
  node: string
  port: string
  bits?: readonly [number, number]
}

export type AuthoredNode = {
  id: string
  operation?: string
  repeat?: { subgraph: string; count?: unknown }
  inputs?: Record<string, AuthoredInput>
  parameters?: Record<string, unknown>
  traceParameters?: Record<string, unknown>
  role?: 'state' | 'round-key'
  round?: number
  iteration?: number
  unit?: number
  origin?: SourceOrigin
}

export type AuthoredSubgraph = {
  inputs: readonly Port[]
  outputs: readonly Port[]
  nodes: readonly AuthoredNode[]
}

export type AuthoredGraph = {
  nodes: readonly AuthoredNode[]
  outputs: readonly AuthoredInput[]
  alphabetMappings?: readonly AlphabetMapping[]
  subgraphs?: Readonly<Record<string, AuthoredSubgraph>>
  traceLevel?: TraceLevel
  schema?: 2
}

export type TraceCheckpoint = {
  readonly path: string
  readonly stage: 'output'
  readonly summary: string
}

export type TraceLevel = 'summary' | 'round' | 'detail'
export type TraceStage = 'input' | 'round-key' | 'key-mix' | 'substitute' | 'permute' | 'output' | 'rot-word' | 'sub-word' | 'rcon' | 'word-xor' | 'transposition'
  | 'add-round-key' | 'sub-bytes' | 'inv-sub-bytes' | 'shift-rows' | 'inv-shift-rows' | 'mix-columns' | 'inv-mix-columns'
export type TraceOperation = {
  readonly sBox?: readonly number[]
  readonly permutation?: readonly number[]
  readonly grid?: { readonly rows: readonly (readonly (string | null)[])[]; readonly inputPositions: readonly (readonly (number | null)[])[]; readonly writeOrder: readonly number[]; readonly readOrder: readonly number[] }
}

export type TraceEvent = {
  readonly path: string
  readonly level: TraceLevel
  readonly round?: number
  readonly stage?: TraceStage
  readonly operation?: TraceOperation
  readonly primitive?: string
  readonly parameters?: Readonly<Record<string, unknown>>
  readonly role?: 'state' | 'round-key'
  readonly iteration?: number
  readonly unit?: number
  /** Key-schedule word index for internal word-sized events; such events are metadata, not student-facing rows. */
  readonly word?: number
  readonly value?: CryptoValue
}

export type SerializedTraceEvent = Omit<TraceEvent, 'value'> & {
  readonly value?: { readonly type: CryptoValue['type']; readonly hex: string }
}

export type ExecutionSnapshot = {
  readonly outputs: Readonly<Record<string, CryptoValue>>
  readonly trace: readonly (TraceCheckpoint | TraceEvent)[]
  readonly warnings?: readonly Diagnostic[]
}

export type WorkerLimitValues = {
  expandedNodes: number
  inputBytes: number
  traceEvents: number
  traceBytes: number
  timeoutMs: number
}

export const maxWorkerLimits = Object.freeze({
  expandedNodes: 256,
  inputBytes: 4_096,
  traceEvents: 512,
  traceBytes: 65_536,
  timeoutMs: 1_000,
} satisfies WorkerLimitValues)

export type WorkerLimits = Partial<WorkerLimitValues>

type TraceCollectionLimits = Pick<WorkerLimitValues, 'traceEvents' | 'traceBytes'>
type LimitedExecutor = (inputs?: Record<string, CryptoValue>, traceLimits?: TraceCollectionLimits) => Result<ExecutionSnapshot>

export type WorkerExecutionPayload = {
  readonly graph: AuthoredGraph
  readonly compiledGraphId?: string
  readonly inputs?: Readonly<Record<string, CryptoValue>>
  readonly limits?: WorkerLimits
}

export type WorkerRequest =
  | { readonly requestId: string; readonly kind: 'execute'; readonly payload: WorkerExecutionPayload }
  | { readonly requestId: string; readonly kind: 'compare'; readonly payload: { readonly left: WorkerExecutionPayload; readonly right: WorkerExecutionPayload; readonly limits?: WorkerLimits } }

export type TraceStatus = {
  readonly truncated: boolean
  readonly retained: number
  readonly dropped: number
}

export type WorkerExecutionSnapshot = ExecutionSnapshot & {
  readonly traceStatus: TraceStatus
}

type CompleteAvalancheCheckpoint = {
  readonly path: string
  readonly round?: number
  readonly stage?: TraceStage
  readonly operation?: TraceOperation
  readonly complete: true
  readonly left: BitsValue
  readonly right: BitsValue
  readonly mask: BitsValue
  readonly changedBits: number
  readonly ratio: number
}

type AvalancheGap = {
  readonly path: string
  readonly round?: number
  readonly stage?: TraceStage
  readonly complete: false
}

export type AvalancheCheckpoint = CompleteAvalancheCheckpoint | AvalancheGap

export type AvalancheComparison = {
  readonly traceLevel: TraceLevel
  readonly checkpoints: readonly AvalancheCheckpoint[]
  readonly executions: {
    readonly baseline: WorkerExecutionSnapshot
    readonly changed: WorkerExecutionSnapshot
  }
  readonly truncated: boolean
}

export type WorkerResponse =
  | { readonly requestId: string; readonly kind: 'snapshot'; readonly snapshot: WorkerExecutionSnapshot }
  | { readonly requestId: string; readonly kind: 'comparison'; readonly comparison: AvalancheComparison }
  | { readonly requestId: string; readonly kind: 'diagnostic'; readonly diagnostics: readonly Diagnostic[] }
  | { readonly requestId: string; readonly kind: 'cancelled' }

type Result<T> = { ok: true; value: T } | { ok: false; diagnostics: readonly Diagnostic[] }

import type { Operation as OperationDefinition } from './operation'
import type { SourceParameters } from './core/source'
import type { SubstituteNibblesParameters } from './core/substituteNibbles'
import type { PermuteGatherParameters } from './spn/permuteGather'
import type { SubstituteBytesParameters } from './core/substituteBytes'
import type { PermuteBytesParameters } from './core/permuteBytes'
import type { RotateWordParameters } from './core/rotateWord'
import type { XorConstantParameters } from './core/xorConstant'
import type { AesXorWordsParameters } from './aes/aesXorWords'
import type { SubstituteParameters } from './spn/substitute'
import type { PermuteParameters } from './spn/permute'
import type { TranspositionParameters } from './classical/transposition'
import type { AesKeyWordParameters } from './aes/aesKeyWord'
import type { AesRconWordParameters } from './aes/aesRconWord'
import type { InvalidLineageParameters } from './test/invalidLineage'
import { source } from './core/source'
import { xor } from './core/xor'
import { concat } from './core/concat'
import { substituteNibbles } from './core/substituteNibbles'
import { permuteGather } from './spn/permuteGather'
import { substituteBytes } from './core/substituteBytes'
import { permuteBytes } from './core/permuteBytes'
import { rotateWord } from './core/rotateWord'
import { xorConstant } from './core/xorConstant'
import { aesXorWords } from './aes/aesXorWords'
import { substitute } from './spn/substitute'
import { permute } from './spn/permute'
import { output } from './core/output'
import { caesar } from './classical/caesar'
import { substitution } from './classical/substitution'
import { vigenere } from './classical/vigenere'
import { affine } from './classical/affine'
import { transposition } from './classical/transposition'
import { aesKeyWord } from './aes/aesKeyWord'
import { aesRotWord } from './aes/aesRotWord'
import { aesSubWord } from './aes/aesSubWord'
import { aesRconWord } from './aes/aesRconWord'
import { aesWordXor } from './aes/aesWordXor'
import { aesSubBytes } from './aes/aesSubBytes'
import { aesInvSubBytes } from './aes/aesInvSubBytes'
import { aesShiftRows } from './aes/aesShiftRows'
import { aesInvShiftRows } from './aes/aesInvShiftRows'
import { aesMixColumns } from './aes/aesMixColumns'
import { aesInvMixColumns } from './aes/aesInvMixColumns'
import { aesRoundKey } from './aes/aesRoundKey'
import { throwing } from './test/throwing'
import { invalidLineage } from './test/invalidLineage'
import type { EmptyParameters } from './core/xor'
import { diagnostic, isBitsValue, isCryptoValue, isPortType, typeMatches, typeText, validSizedValue, cloneValue, actualType } from './operation_support'
import { bytesForBits, bitPosition, bitAt, setBit } from './operation_support'
import { CipherDiagnostic, validKey, modulo, multiplyModulo, cipherText } from './operation_support'

type OperationParameters = {
  'core.source@1': SourceParameters
  'core.xor@1': EmptyParameters
  'core.concat@1': EmptyParameters
  'core.substitute-nibbles@1': SubstituteNibblesParameters
  'spn.permute-gather@1': PermuteGatherParameters
  'core.substitute-bytes@1': SubstituteBytesParameters
  'core.permute-bytes@1': PermuteBytesParameters
  'core.rotate-word@1': RotateWordParameters
  'core.xor-constant@1': XorConstantParameters
  'aes.xor-words@1': AesXorWordsParameters
  'spn.substitute@1': SubstituteParameters
  'spn.permute@1': PermuteParameters
  'core.output@1': EmptyParameters
  'classical.caesar@1': EmptyParameters
  'classical.substitution@1': EmptyParameters
  'classical.vigenere@1': EmptyParameters
  'classical.affine@1': EmptyParameters
  'classical.transposition@1': TranspositionParameters
  'aes.key-word@1': AesKeyWordParameters
  'aes.rot-word@1': EmptyParameters
  'aes.sub-word@1': EmptyParameters
  'aes.rcon-word@1': AesRconWordParameters
  'aes.word-xor@1': EmptyParameters
  'aes.sub-bytes@1': EmptyParameters
  'aes.inv-sub-bytes@1': EmptyParameters
  'aes.shift-rows@1': EmptyParameters
  'aes.inv-shift-rows@1': EmptyParameters
  'aes.mix-columns@1': EmptyParameters
  'aes.inv-mix-columns@1': EmptyParameters
  'aes.round-key@1': EmptyParameters
  'test.throw@1': EmptyParameters
  'test.invalid-lineage@1': InvalidLineageParameters
}

type Operation<K extends keyof OperationParameters> = OperationDefinition<K, OperationParameters[K]>
type MappedOperation = { [K in keyof OperationParameters]: Operation<K> }[keyof OperationParameters]

type RegisteredOperation = {
  manifest: OperationManifest
  validateAndBind: (parameters: Record<string, unknown>, node: AuthoredNode) => { diagnostics: Diagnostic[]; bind: () => BoundOperation }
}

type BoundOperation = {
  parameters: Readonly<Record<string, unknown>>
  traceParameters: Readonly<Record<string, unknown>>
  sourceType?: PortType
  sourceValue?: CryptoValue
  legacyTraceOperation?: TraceOperation
  inferOutputTypes?: (inputTypes: Readonly<Record<string, PortType>>, node?: AuthoredNode) => Result<Readonly<Record<string, PortType>>>
  lineage?: (inputTypes: Readonly<Record<string, PortType>>) => LineageDeclaration
  execute: (inputs: Record<string, CryptoValue>, mappings: ReadonlyMap<string, AlphabetMapping>, sourceValue?: CryptoValue) => Record<string, CryptoValue>
}

const registerOperation = (operation: OperationDefinition<keyof OperationParameters, never>): RegisteredOperation => ({
  manifest: operation.manifest,
  validateAndBind(parameters, node) {
    const captured = structuredClone(parameters)
    const diagnostics = operation.validateParameters?.(captured, node) ?? []
    return {
      diagnostics,
      bind: () => {
        // The registry checks identity/parameter pairs; validation precedes binding this captured value.
        const typed = captured as never
        return {
          parameters: captured,
          traceParameters: structuredClone(node.traceParameters ?? captured),
          ...(['spn.substitute@1', 'core.substitute-nibbles@1', 'core.substitute-bytes@1'].includes(operation.manifest.identity) && Array.isArray((typed as OperationParameters['spn.substitute@1'] | OperationParameters['core.substitute-nibbles@1'] | OperationParameters['core.substitute-bytes@1']).sBox) ? {
            legacyTraceOperation: { sBox: [...(typed as OperationParameters['spn.substitute@1'] | OperationParameters['core.substitute-nibbles@1'] | OperationParameters['core.substitute-bytes@1']).sBox] },
          } : {}),
          ...(['spn.permute@1', 'spn.permute-gather@1', 'core.permute-bytes@1'].includes(operation.manifest.identity) && Array.isArray((typed as OperationParameters['spn.permute@1'] | OperationParameters['spn.permute-gather@1'] | OperationParameters['core.permute-bytes@1']).permutation) ? {
            legacyTraceOperation: { permutation: [...(typed as OperationParameters['spn.permute@1'] | OperationParameters['spn.permute-gather@1'] | OperationParameters['core.permute-bytes@1']).permutation] },
          } : {}),
          ...(operation.manifest.identity === 'core.source@1' ? {
            sourceType: (typed as OperationParameters['core.source@1']).type,
            sourceValue: (typed as OperationParameters['core.source@1']).value,
          } : {}),
          ...(operation.inferOutputTypes ? { inferOutputTypes: (inputTypes: Readonly<Record<string, PortType>>, boundNode?: AuthoredNode) => operation.inferOutputTypes!(inputTypes, typed, boundNode) } : {}),
          ...(operation.lineage ? { lineage: (inputTypes: Readonly<Record<string, PortType>>) => operation.lineage!(typed, inputTypes) } : {}),
          // The registry closure fixes operation identity; compile validation and source-input checks precede invocation.
          execute: (inputs, mappings, sourceValue) => operation.execute(inputs,
            operation.manifest.identity === 'core.source@1' && sourceValue !== undefined
              ? { ...typed as OperationParameters['core.source@1'], value: sourceValue } as never
              : typed,
            mappings),
        }
      },
    }
  },
})

export type CompiledGraph = {
  readonly graph: AuthoredGraph
  readonly schema?: 2
  readonly outputTypes?: Readonly<Record<string, PortType>>
  readonly lineage?: readonly LineageEdge[]
  readonly outputAliases?: Readonly<Record<string, string>>
  execute: (inputs?: Record<string, CryptoValue>) => Result<ExecutionSnapshot>
}

export type LineageEdge = {
  readonly source: string
  readonly sourceBit: number
  readonly target: string
  readonly targetBit: number
}

const traceStatuses = new WeakMap<ExecutionSnapshot, TraceStatus>()
const structureSignatures = new WeakMap<WorkerExecutionSnapshot, string>()
const relativeTracePaths = new WeakMap<WorkerExecutionSnapshot, ReadonlyMap<string, string>>()
const ambiguousRepeatIdentities = new WeakMap<WorkerExecutionSnapshot, boolean>()

const structuralParameter = (value: unknown): unknown => {
  if (isCryptoValue(value)) return { type: value.type }
  if (Array.isArray(value)) return value.map(structuralParameter)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, structuralParameter(item)]))
  }
  return value
}

const structuralNodeSignatures = (graph: AuthoredGraph): ReadonlyMap<string, string> => {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  const signatures = new Map<string, string>()
  const visiting = new Set<string>()
  // A node's signature embeds each input's upstream signature so that structurally identical
  // subgraphs (e.g. two `repeat` instances) produce equal text. Embedding that upstream text
  // directly would multiply with every node a value fans out to: a key-schedule word feeding
  // several later words (unlike a single-successor round chain) makes that text roughly double
  // per additional word, reaching unworkable sizes for a real 44-60 word AES-128/192/256
  // schedule. Interning each distinct signature to a short, content-derived id keeps referenced
  // text bounded while preserving the same equality semantics: two upstream nodes with equal
  // signatures always intern to the same id.
  const interned = new Map<string, number>()
  const intern = (signature: string): number => {
    const existing = interned.get(signature)
    if (existing !== undefined) return existing
    const id = interned.size
    interned.set(signature, id)
    return id
  }
  const nodeSignature = (id: string): string => {
    const existing = signatures.get(id)
    if (existing) return existing
    const node = nodes.get(id)
    if (!node || visiting.has(id)) return `unresolved:${id}`
    visiting.add(id)
    const signature = JSON.stringify({
      operation: node.operation,
      parameters: structuralParameter(node.parameters),
      inputs: Object.entries(node.inputs ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, input]) => ({ name, port: input.port, source: intern(nodeSignature(input.node)) })),
    })
    visiting.delete(id)
    signatures.set(id, signature)
    return signature
  }
  for (const node of graph.nodes) nodeSignature(node.id)
  return signatures
}

const structuralSignature = (graph: AuthoredGraph): string => {
  const signatures = structuralNodeSignatures(graph)
  const nodeSignature = (id: string): string => signatures.get(id) ?? `unresolved:${id}`
  const output = (value: AuthoredInput) => ({ port: value.port, source: nodeSignature(value.node) })
  return JSON.stringify({
    nodes: graph.nodes.map((node) => nodeSignature(node.id)).sort(),
    outputs: graph.outputs.map(output).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  })
}

type RepeatIdentities = {
  readonly identities: ReadonlyMap<string, string>
  readonly ambiguous: boolean
}

const repeatIdentities = (graph: AuthoredGraph): RepeatIdentities => {
  const upstream = structuralNodeSignatures(graph)
  const consumers = new Map<string, Array<{ readonly node: AuthoredNode; readonly port: string }>>()
  for (const node of graph.nodes) {
    for (const [port, input] of Object.entries(node.inputs ?? {})) {
      consumers.set(input.node, [...(consumers.get(input.node) ?? []), { node, port }])
    }
  }
  const outputContext = (id: string, visited = new Set<string>()): readonly unknown[] => {
    if (visited.has(id)) return []
    const next = new Set(visited).add(id)
    const outputs = graph.outputs.flatMap((output, position) =>
      output.node === id ? [{ output: position, port: output.port }] : [],
    )
    const downstream = (consumers.get(id) ?? []).flatMap(({ node, port }) =>
      outputContext(node.id, next).map((output) => ({ input: port, output })),
    )
    return [...outputs, ...downstream].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  }
  const subgraphSignature = (subgraph: AuthoredSubgraph | undefined): unknown => subgraph && ({
    inputs: [...subgraph.inputs].map(structuralParameter).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    outputs: [...subgraph.outputs].map(structuralParameter).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    nodes: subgraph.nodes.map((node) => ({
      operation: node.operation,
      parameters: structuralParameter(node.parameters),
      inputs: Object.entries(node.inputs ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  })
  const groups = new Map<string, AuthoredNode[]>()
  for (const node of graph.nodes) {
    if (!node.repeat) continue
    const descriptor = JSON.stringify({
      count: node.repeat.count,
      subgraph: subgraphSignature(graph.subgraphs?.[node.repeat.subgraph]),
      inputs: Object.entries(node.inputs ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, input]) => ({ name, port: input.port, source: upstream.get(input.node) ?? `unresolved:${input.node}` })),
    })
    groups.set(descriptor, [...(groups.get(descriptor) ?? []), node])
  }
  const identities = new Map<string, string>()
  let ambiguous = false
  for (const [index, descriptor] of [...groups.keys()].sort().entries()) {
    const contexts = new Map<string, AuthoredNode[]>()
    for (const node of groups.get(descriptor)!) {
      const context = JSON.stringify(outputContext(node.id))
      contexts.set(context, [...(contexts.get(context) ?? []), node])
    }
    for (const [position, context] of [...contexts.keys()].sort().entries()) {
      const nodes = contexts.get(context)!
      if (nodes.length > 1) {
        ambiguous = true
      } else {
        identities.set(nodes[0].id, `repeat.${index}.${position}`)
      }
    }
  }
  return { identities, ambiguous }
}

const relativeTracePath = (path: string, repeats: RepeatIdentities): string => {
  const match = /^(.*)\.(\d+)\/(.+)$/.exec(path)
  if (!match) return path
  const identity = repeats.identities.get(match[1])
  return identity ? `${identity}.${match[2]}/${match[3]}` : path
}

const projectBits = (value: BitsValue, start: number, length: number): BitsValue => {
  const projected = new Uint8Array(bytesForBits(length))
  for (let index = 0; index < length; index += 1) if (bitAt(value, start + index)) setBit(projected, length, index)
  return bits(length, projected)
}

const validProjection = (projection: unknown, size: number): boolean =>
  Array.isArray(projection)
  && projection.length === 2
  && projection.every((part) => Number.isSafeInteger(part) && part >= 0)
  && projection[1] > 0
  && projection[0] + projection[1] <= size

export const bits = (size: number, bytes: Uint8Array): BitsValue => ({
  type: { family: 'bits', size },
  bytes: bytes.slice(),
})

export const bytes = (size: number, value: Uint8Array): BytesValue => ({
  type: { family: 'bytes', size },
  bytes: value.slice(),
})

export const words = (size: number, value: Uint8Array): WordsValue => ({
  type: { family: 'words', size, wordSize: 8 },
  words: value.slice(),
})

export const alphabetMapping = (id: string, symbols: readonly string[]): Result<AlphabetMapping> => {
  const diagnostics: Diagnostic[] = []
  const seen = new Set<string>()
  if (symbols.length < 2) diagnostics.push(diagnostic('invalid-alphabet-mapping', 'Alphabet mappings require at least two symbols.', 'alphabet.symbols'))
  for (const [index, symbol] of symbols.entries()) {
    if ([...symbol].length !== 1) diagnostics.push(diagnostic('invalid-alphabet-symbol', 'Alphabet symbols must be one Unicode code point.', `alphabet.symbols.${index}`))
    if (seen.has(symbol)) diagnostics.push(diagnostic('duplicate-alphabet-symbol', 'Alphabet symbols must be unique.', `alphabet.symbols.${index}`))
    seen.add(symbol)
  }
  return diagnostics.length ? { ok: false, diagnostics } : { ok: true, value: { id, symbols: [...symbols] } }
}

export const alphabetSymbol = (mapping: AlphabetMapping, symbol: string): Result<AlphabetSymbolValue> => {
  if (!mapping.symbols.includes(symbol)) {
    return { ok: false, diagnostics: [diagnostic('unknown-alphabet-symbol', 'Symbol is not in alphabet mapping.', 'alphabet.symbol', undefined, { symbol })] }
  }
  return { ok: true, value: { type: { family: 'alphabet-symbol', mapping: mapping.id }, symbol } }
}

export const alphabetText = (mapping: AlphabetMapping, value: string): AlphabetTextValue => ({
  type: { family: 'alphabet-text', mapping: mapping.id },
  symbols: [...value],
})

export const text = (value: string): TextValue => ({ type: { family: 'text' }, symbols: [...value] })

export const integer = (value: number): IntegerValue => ({
  type: { family: 'integer', signed: true, safe: true },
  value,
})

export const alphabetPolicy = (value: AlphabetPolicyValue['value']): AlphabetPolicyValue => ({
  type: { family: 'alphabet-policy' },
  value,
})

export const alphabetDirection = (value: AlphabetDirectionValue['value']): AlphabetDirectionValue => ({
  type: { family: 'alphabet-direction' },
  value,
})

export const hex = (value: BitsValue | BytesValue): string =>
  `0x${[...value.bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(-(value.type.family === 'bits' ? Math.ceil(value.type.size / 4) : value.type.size * 2))}`

export const serializeTrace = (trace: readonly TraceEvent[]): readonly SerializedTraceEvent[] =>
  trace.map(({ value, ...event }) => ({
    ...event,
    ...(value && 'bytes' in value ? { value: { type: value.type, hex: hex(value) } } : {}),
  }))

const operations = new Map<string, RegisteredOperation>(([
  source, xor, concat, substitute, permute,
  substituteNibbles, permuteGather, substituteBytes, permuteBytes,
  rotateWord, xorConstant, aesXorWords, output,
  caesar, affine, substitution, vigenere, transposition,
  aesKeyWord, aesRotWord, aesSubWord, aesRconWord,
  aesWordXor, aesRoundKey, aesSubBytes, aesInvSubBytes,
  aesShiftRows, aesInvShiftRows, aesMixColumns, aesInvMixColumns,
  throwing, invalidLineage,
] satisfies readonly MappedOperation[]).map((operation) => {
  const registered = registerOperation(operation)
  return [registered.manifest.identity, registered] as const
}))

export const operationManifests: readonly OperationManifest[] = [...operations.values()]
  .filter((operation) => !operation.manifest.identity.startsWith('test.'))
  .map((operation) => operation.manifest)

const spnSBox = [0xe, 0x4, 0xd, 0x1, 0x2, 0xf, 0xb, 0x8, 0x3, 0xa, 0x6, 0xc, 0x5, 0x9, 0x0, 0x7]

export const teachingSpnGraph: AuthoredGraph = {
  nodes: [
    { id: 'state', operation: 'core.source@1', parameters: { type: { family: 'bits', size: 16 }, value: bits(16, Uint8Array.of(0x12, 0x34)) } },
    { id: 'round', repeat: { subgraph: 'round', count: 2 }, inputs: { permute: { node: 'state', port: 'value' } } },
  ],
  outputs: [{ node: 'round', port: 'permute' }],
  traceLevel: 'detail',
  subgraphs: {
    round: {
      inputs: [{ name: 'permute', type: { family: 'bits', size: 16 } }],
      outputs: [{ name: 'permute', type: { family: 'bits', size: 16 } }],
      nodes: [
        { id: 'key', operation: 'core.source@1', parameters: { type: { family: 'bits', size: 16 }, roundKeys: [bits(16, Uint8Array.of(0x0f, 0x0f)), bits(16, Uint8Array.of(0xf0, 0xf0))] } },
        { id: 'key-mix', operation: 'core.xor@1', inputs: { left: { node: '@previous', port: 'permute' }, right: { node: 'key', port: 'value' } } },
        { id: 'substitute', operation: 'spn.substitute@1', inputs: { value: { node: 'key-mix', port: 'value' } }, parameters: { sBox: spnSBox } },
        { id: 'permute', operation: 'spn.permute@1', inputs: { value: { node: 'substitute', port: 'value' } }, parameters: { permutation: [0, 2, 1, 3] } },
      ],
    },
  },
}

// FIPS-197 key schedule parameters: Nk (key words), Nr (rounds). Nb (state words) is fixed at 4.
const aesKeyExpansionParameters = { 128: { nk: 4, nr: 10 }, 192: { nk: 6, nr: 12 }, 256: { nk: 8, nr: 14 } } as const

/**
 * Composes an AES-128/192/256 key-expansion CryptoGraph from registered primitives
 * (`aes.key-word`, `aes.rot-word`, `aes.sub-word`, `aes.rcon-word`, `core.xor`) following
 * FIPS-197 word ordering, round numbering, and Rcon behavior. Not a monolithic primitive:
 * every intermediate word transform is its own node, reusable by future Lessons and
 * consumable by an encryption graph through the `round-key.<r>` output ports.
 */
export const aesKeyExpansionGraph = (keySize: 128 | 192 | 256): AuthoredGraph => {
  const { nk, nr } = aesKeyExpansionParameters[keySize]
  const nb = 4
  const totalWords = nb * (nr + 1)
  const nodes: AuthoredNode[] = [
    { id: 'key', operation: 'core.source@1', parameters: { type: { family: 'bits', size: keySize } } },
  ]
  // Node IDs use hyphens (not `.`/`/`) so a Lesson author can write this exact node list in
  // YAML: the identifier grammar shared by every Lesson graph does not allow those characters.
  for (let index = 0; index < totalWords; index += 1) {
    if (index < nk) {
      nodes.push({ id: `word-${index}`, operation: 'aes.key-word@1', inputs: { key: { node: 'key', port: 'value' } }, parameters: { index } })
    } else if (index % nk === 0) {
      nodes.push({ id: `word-${index}-rot`, operation: 'aes.rot-word@1', inputs: { value: { node: `word-${index - 1}`, port: 'value' } } })
      nodes.push({ id: `word-${index}-sub`, operation: 'aes.sub-word@1', inputs: { value: { node: `word-${index}-rot`, port: 'value' } } })
      nodes.push({ id: `word-${index}-rcon`, operation: 'aes.rcon-word@1', parameters: { round: index / nk } })
      nodes.push({ id: `word-${index}-temp`, operation: 'aes.word-xor@1', inputs: { left: { node: `word-${index}-sub`, port: 'value' }, right: { node: `word-${index}-rcon`, port: 'value' } } })
      nodes.push({ id: `word-${index}`, operation: 'aes.word-xor@1', inputs: { left: { node: `word-${index - nk}`, port: 'value' }, right: { node: `word-${index}-temp`, port: 'value' } } })
    } else if (nk > 6 && index % nk === 4) {
      nodes.push({ id: `word-${index}-sub`, operation: 'aes.sub-word@1', inputs: { value: { node: `word-${index - 1}`, port: 'value' } } })
      nodes.push({ id: `word-${index}`, operation: 'aes.word-xor@1', inputs: { left: { node: `word-${index - nk}`, port: 'value' }, right: { node: `word-${index}-sub`, port: 'value' } } })
    } else {
      nodes.push({ id: `word-${index}`, operation: 'aes.word-xor@1', inputs: { left: { node: `word-${index - nk}`, port: 'value' }, right: { node: `word-${index - 1}`, port: 'value' } } })
    }
  }
  const outputs: AuthoredInput[] = []
  for (let round = 0; round <= nr; round += 1) {
    const base = round * nb
    nodes.push({
      id: `round-key-${round}`,
      operation: 'aes.round-key@1',
      inputs: {
        w0: { node: `word-${base}`, port: 'value' },
        w1: { node: `word-${base + 1}`, port: 'value' },
        w2: { node: `word-${base + 2}`, port: 'value' },
        w3: { node: `word-${base + 3}`, port: 'value' },
      },
    })
    outputs.push({ node: `round-key-${round}`, port: 'value' })
  }
  return { nodes, outputs, traceLevel: 'detail' }
}

/**
 * Composes the AES-128/192/256 forward-cipher CryptoGraph from registered SubBytes/ShiftRows/
 * MixColumns primitives; AddRoundKey reuses `core.xor@1` rather than a duplicate fixed-width
 * XOR. Round keys are typed `bits<128>` source inputs (`round-key-<r>.value`), so a Lesson
 * binds them from a separate `aesKeyExpansionGraph` execution's own outputs through ordinary
 * Lesson step bindings instead of this graph re-deriving them itself. Default `keySize` 128
 * preserves the no-argument AES-128 builder contract from #84.
 */
export const aesCipherGraph = (keySize: 128 | 192 | 256 = 128): AuthoredGraph => {
  const rounds = aesKeyExpansionParameters[keySize].nr
  // Each round key is declared right before the AddRoundKey that consumes it, so the trace
  // (which follows node order) shows it where encryption uses it.
  const roundKey = (round: number): AuthoredNode => ({ id: `round-key-${round}`, operation: 'core.source@1', parameters: { type: { family: 'bits', size: 128 } } })
  const nodes: AuthoredNode[] = [{ id: 'plaintext', operation: 'core.source@1', parameters: { type: { family: 'bits', size: 128 } } }, roundKey(0)]
  nodes.push({ id: 'cipher-0-add-round-key', operation: 'core.xor@1', inputs: { left: { node: 'plaintext', port: 'value' }, right: { node: 'round-key-0', port: 'value' } } })
  let previous = 'cipher-0-add-round-key'
  for (let round = 1; round <= rounds; round += 1) {
    nodes.push({ id: `cipher-${round}-sub-bytes`, operation: 'aes.sub-bytes@1', inputs: { value: { node: previous, port: 'value' } } })
    nodes.push({ id: `cipher-${round}-shift-rows`, operation: 'aes.shift-rows@1', inputs: { value: { node: `cipher-${round}-sub-bytes`, port: 'value' } } })
    let mixed = `cipher-${round}-shift-rows`
    if (round < rounds) {
      nodes.push({ id: `cipher-${round}-mix-columns`, operation: 'aes.mix-columns@1', inputs: { value: { node: mixed, port: 'value' } } })
      mixed = `cipher-${round}-mix-columns`
    }
    nodes.push(roundKey(round))
    nodes.push({ id: `cipher-${round}-add-round-key`, operation: 'core.xor@1', inputs: { left: { node: mixed, port: 'value' }, right: { node: `round-key-${round}`, port: 'value' } } })
    previous = `cipher-${round}-add-round-key`
  }
  return { nodes, outputs: [{ node: previous, port: 'value' }], traceLevel: 'detail' }
}

/**
 * Composes the matching AES-128/192/256 inverse cipher (FIPS-197 Figure 15), from the same
 * registered primitives and the same `round-key-<r>.value` source inputs as `aesCipherGraph`.
 * Default `keySize` 128 preserves the no-argument AES-128 builder contract from #84.
 */
export const aesInverseCipherGraph = (keySize: 128 | 192 | 256 = 128): AuthoredGraph => {
  const rounds = aesKeyExpansionParameters[keySize].nr
  const roundKey = (round: number): AuthoredNode => ({ id: `round-key-${round}`, operation: 'core.source@1', parameters: { type: { family: 'bits', size: 128 } } })
  const nodes: AuthoredNode[] = [{ id: 'ciphertext', operation: 'core.source@1', parameters: { type: { family: 'bits', size: 128 } } }, roundKey(rounds)]
  nodes.push({ id: `cipher-${rounds}-add-round-key`, operation: 'core.xor@1', inputs: { left: { node: 'ciphertext', port: 'value' }, right: { node: `round-key-${rounds}`, port: 'value' } } })
  let previous = `cipher-${rounds}-add-round-key`
  for (let round = rounds - 1; round >= 0; round -= 1) {
    nodes.push({ id: `cipher-${round}-inv-shift-rows`, operation: 'aes.inv-shift-rows@1', inputs: { value: { node: previous, port: 'value' } } })
    nodes.push({ id: `cipher-${round}-inv-sub-bytes`, operation: 'aes.inv-sub-bytes@1', inputs: { value: { node: `cipher-${round}-inv-shift-rows`, port: 'value' } } })
    nodes.push(roundKey(round))
    nodes.push({ id: `cipher-${round}-add-round-key`, operation: 'core.xor@1', inputs: { left: { node: `cipher-${round}-inv-sub-bytes`, port: 'value' }, right: { node: `round-key-${round}`, port: 'value' } } })
    previous = `cipher-${round}-add-round-key`
    if (round > 0) {
      nodes.push({ id: `cipher-${round}-inv-mix-columns`, operation: 'aes.inv-mix-columns@1', inputs: { value: { node: previous, port: 'value' } } })
      previous = `cipher-${round}-inv-mix-columns`
    }
  }
  return { nodes, outputs: [{ node: previous, port: 'value' }], traceLevel: 'detail' }
}

type ProjectionCheck = {
  readonly target: string
  readonly input: string
  readonly projection: unknown
  readonly upstream: AuthoredInput
}

type ExpandedGraph = {
  readonly graph: AuthoredGraph
  readonly projectionChecks: readonly ProjectionCheck[]
}

const expandGraph = (graph: AuthoredGraph, diagnostics: Diagnostic[]): ExpandedGraph => {
  const nodes: AuthoredNode[] = []
  const aliases = new Map<string, Map<string, AuthoredInput>>()
  const projectionChecks: ProjectionCheck[] = []
  const composeProjection = (outer: AuthoredInput, inner: AuthoredInput): AuthoredInput => {
    if (inner.bits === undefined) return outer
    if (outer.bits === undefined) return { ...outer, bits: inner.bits }
    if (!Array.isArray(outer.bits)
      || outer.bits.length !== 2
      || !outer.bits.every((part) => Number.isSafeInteger(part) && part >= 0)
      || outer.bits[1] === 0) return outer
    if (!validProjection(inner.bits, outer.bits[1])) {
      const code = Array.isArray(inner.bits) && inner.bits.length === 2
        && inner.bits.every((part) => Number.isSafeInteger(part) && part >= 0)
        ? inner.bits[1] === 0 ? 'graph.projection-empty-range' : 'graph.projection-out-of-bounds'
        : 'graph.projection-invalid-format'
      diagnostics.push(diagnostic(code, 'Projection is invalid.', 'repeat.inputs', undefined))
      return outer
    }
    return { ...outer, bits: [outer.bits[0] + inner.bits[0], inner.bits[1]] }
  }
  for (const node of graph.nodes) {
    if (!node.repeat) {
      nodes.push(node)
      continue
    }
    const repeat = node.repeat
    if (!('count' in repeat)) {
      diagnostics.push(diagnostic('graph.unbounded-repetition', 'Repeated subgraph needs a literal count.', `${node.id}.repeat.count`, node))
      continue
    }
    if (typeof repeat.count !== 'number') {
      diagnostics.push(diagnostic('graph.dynamic-loop', 'Repeated subgraph count must be a numeric literal.', `${node.id}.repeat.count`, node))
      continue
    }
    if (!Number.isSafeInteger(repeat.count) || repeat.count <= 0) {
      diagnostics.push(diagnostic('spn.invalid-round-count', 'Repeated subgraph count must be a positive safe integer.', `${node.id}.repeat.count`, node))
      continue
    }
    const subgraph = graph.subgraphs?.[repeat.subgraph]
    if (!subgraph) {
      diagnostics.push(diagnostic('graph.structural-mismatch', 'Repeated node references an unknown subgraph.', `${node.id}.repeat.subgraph`, node))
      continue
    }
    const inputNames = new Set(subgraph.inputs.map((port) => port.name))
    if (Object.keys(node.inputs ?? {}).some((name) => !inputNames.has(name)) || [...inputNames].some((name) => !node.inputs?.[name])) {
      diagnostics.push(diagnostic('graph.structural-mismatch', 'Repeated node inputs do not match subgraph inputs.', `${node.id}.inputs`, node))
      continue
    }
    let previous = new Map(Object.entries(node.inputs ?? {}))
    for (let index = 0; index < repeat.count; index += 1) {
      const prefix = `${node.id}.${index + 1}`
      for (const inner of subgraph.nodes) {
        const parameters = { ...(inner.parameters ?? {}) }
        const traceParameters = inner.traceParameters && { ...inner.traceParameters }
        if (Array.isArray(parameters.roundKeys)) {
          parameters.value = parameters.roundKeys[index]
          delete parameters.roundKeys
        }
        const inputs = Object.fromEntries(Object.entries(inner.inputs ?? {}).flatMap(([name, input]) => {
          if (input.node === '@input') {
            const bound = node.inputs?.[input.port]
            if (!bound) diagnostics.push(diagnostic('graph.structural-mismatch', 'Subgraph input is not declared by repeated node.', `${node.id}.inputs.${input.port}`, node))
            if (bound?.bits !== undefined) projectionChecks.push({ target: `${prefix}/${inner.id}`, input: name, projection: bound.bits, upstream: { ...bound, bits: undefined } })
            return bound ? [[name, composeProjection(bound, input)]] : []
          }
          if (input.node === '@previous') {
            const bound = previous.get(input.port)
            if (!bound) diagnostics.push(diagnostic('graph.structural-mismatch', 'Previous round output is not declared by subgraph.', `${node.id}.repeat.${input.port}`, node))
            if (bound?.bits !== undefined) projectionChecks.push({ target: `${prefix}/${inner.id}`, input: name, projection: bound.bits, upstream: { ...bound, bits: undefined } })
            return bound ? [[name, composeProjection(bound, input)]] : []
          }
          return [[name, { node: `${prefix}/${input.node}`, port: input.port, ...(input.bits !== undefined ? { bits: input.bits } : {}) }]]
        }))
        nodes.push({ ...inner, id: `${prefix}/${inner.id}`, inputs, parameters, ...(traceParameters ? { traceParameters } : {}), ...(inner.round === undefined ? { round: index + 1 } : {}) })
      }
      if (!subgraph.outputs.length) {
        diagnostics.push(diagnostic('graph.structural-mismatch', 'Repeated subgraph needs an output.', `${node.id}.repeat.subgraph`, node))
        continue
      }
      previous = new Map(subgraph.outputs.map((output) => [output.name, { node: `${prefix}/${output.name}`, port: 'value' }]))
    }
    aliases.set(node.id, previous)
  }
  const resolve = (input: AuthoredInput): AuthoredInput => {
    const resolved = aliases.get(input.node)?.get(input.port)
    return resolved ? { ...resolved, ...(input.bits !== undefined ? { bits: input.bits } : {}) } : input
  }
  const expanded = {
    ...graph,
    nodes: nodes.map((node) => ({
      ...node,
      inputs: Object.fromEntries(Object.entries(node.inputs ?? {}).map(([name, input]) => [name, resolve(input)])),
    })),
    outputs: graph.outputs.map(resolve),
  }
  return {
    graph: expanded,
    projectionChecks: projectionChecks.map((check) => ({ ...check, upstream: resolve(check.upstream) })),
  }
}

export const compile = (graph: AuthoredGraph): Result<CompiledGraph> => {
  const diagnostics: Diagnostic[] = []
  let resolvedOutputTypes: Readonly<Record<string, PortType>> = {}
  let resolvedLineage: readonly LineageEdge[] = []
  const isV2 = graph.schema === 2
  if (isV2 && graph.traceLevel !== undefined) diagnostics.push(diagnostic('lesson.v1-feature-in-v2', 'Trace levels are a v1-only feature.', 'traceLevel'))
  if (graph.traceLevel !== undefined && !['summary', 'round', 'detail'].includes(graph.traceLevel)) {
    diagnostics.push(diagnostic('trace.unsupported-level', 'Trace level is not supported.', 'traceLevel'))
  }
  const expanded = expandGraph(graph, diagnostics)
  const compiledGraph = structuredClone(expanded.graph)
  const nodes = new Map<string, AuthoredNode>()
  const resolved = new Map<string, RegisteredOperation>()
  const bound = new Map<string, BoundOperation>()
  const mappings = new Map<string, AlphabetMapping>()

  for (const mapping of compiledGraph.alphabetMappings ?? []) {
    if (mappings.has(mapping.id)) diagnostics.push(diagnostic('duplicate-alphabet-mapping', 'Alphabet mapping IDs must be unique.', `alphabetMappings.${mapping.id}`))
    mappings.set(mapping.id, mapping)
    const validated = alphabetMapping(mapping.id, mapping.symbols)
    if (!validated.ok) diagnostics.push(...validated.diagnostics)
  }
  for (const node of compiledGraph.nodes) {
    if (nodes.has(node.id)) diagnostics.push(diagnostic('duplicate-node-id', 'Graph node IDs must be unique.', node.id, node))
    nodes.set(node.id, node)
    const operation = node.operation ? operations.get(node.operation) : undefined
    if (!operation) diagnostics.push(diagnostic('unknown-operation', 'Operation is not registered.', `${node.id}.operation`, node, { operation: node.operation ?? null }))
    else {
      resolved.set(node.id, operation)
      if (isV2 && operation.manifest.outputs.length !== 1) {
        diagnostics.push(diagnostic('graph.single-output-required', 'V2 operations must declare exactly one output port.', `${node.id}.operation`, node))
      }
    }
  }

  for (const node of compiledGraph.nodes) {
    const operation = resolved.get(node.id)
    if (!operation) continue
    const params = node.parameters ?? {}
    const binding = operation.validateAndBind(params, node)
    diagnostics.push(...binding.diagnostics)
    if (!binding.diagnostics.length) bound.set(node.id, binding.bind())
    if (node.operation === 'core.source@1' && isPortType(params.type)
      && (params.type.family === 'alphabet-symbol' || params.type.family === 'alphabet-text')
      && !mappings.has(params.type.mapping)) {
      diagnostics.push(diagnostic('invalid-parameter', 'Alphabet type references an undeclared mapping.', `${node.id}.parameters.type`, node))
    }
    if (node.operation === 'core.source@1' && isCryptoValue(params.value) && 'symbol' in params.value) {
      const mapping = mappings.get(params.value.type.mapping)
      if (!mapping || !mapping.symbols.includes(params.value.symbol)) {
        diagnostics.push(diagnostic('invalid-parameter', 'Alphabet symbol is not in declared mapping.', `${node.id}.parameters.value`, node))
      }
    }
    const bindings = new Map<string, number>()
    for (const port of operation.manifest.inputs) {
      const input = node.inputs?.[port.name]
      if (!input) {
        diagnostics.push(diagnostic('missing-input', 'Required input is missing.', `${node.id}.inputs.${port.name}`, node))
        continue
      }
      const upstream = nodes.get(input.node)
      const upstreamOperation = upstream && resolved.get(upstream.id)
      const upstreamPort = upstreamOperation?.manifest.outputs.find((candidate) => candidate.name === input.port)
      if (!upstreamPort) {
        diagnostics.push(diagnostic('unknown-input-port', 'Input references an unknown output port.', `${node.id}.inputs.${port.name}`, node))
        continue
      }
      if (isV2) continue
      const outputTypeParameter = upstreamOperation?.manifest.outputTypeParameter
      const forwardedInput = upstreamOperation?.manifest.identity === 'core.xor@1'
        ? upstream?.inputs?.left
        : upstreamOperation?.manifest.identity === 'core.output@1'
          ? upstream?.inputs?.value
          : upstreamOperation?.manifest.identity === 'classical.caesar@1' || upstreamOperation?.manifest.identity === 'classical.affine@1'
            || upstreamOperation?.manifest.identity === 'classical.substitution@1' || upstreamOperation?.manifest.identity === 'classical.vigenere@1'
            ? upstream?.inputs?.text
          : undefined
      const forwardedSource = forwardedInput && nodes.get(forwardedInput.node)
      const forwardedOperation = forwardedSource && resolved.get(forwardedSource.id)
      const forwardedSourceType = forwardedSource?.parameters?.type
      const forwardedPort = forwardedOperation?.manifest.outputs.find((candidate) => candidate.name === forwardedInput?.port)
      const inferredForwardedType = forwardedOperation?.manifest.identity === 'core.source@1' && isPortType(forwardedSourceType)
        ? forwardedSourceType
        : forwardedPort?.type
      const upstreamType = inferredForwardedType
        ? inferredForwardedType
        : outputTypeParameter && isPortType(upstream?.parameters?.[outputTypeParameter])
        ? upstream.parameters[outputTypeParameter]
        : upstreamPort.type
      if (!typeMatches(port.type, upstreamType, bindings)) {
        diagnostics.push(diagnostic('incompatible-port-type', `Expected ${typeText(port.type)} input.`, `${node.id}.inputs.${port.name}`, node, { expected: typeText(port.type), actual: typeText(upstreamType) }))
      }
    }
  }

  const state = new Map<string, 'visiting' | 'done'>()
  const order: string[] = []
  const visit = (id: string): void => {
    if (state.get(id) === 'visiting') {
      const node = nodes.get(id)
      if (node) diagnostics.push(diagnostic('graph-cycle', 'Graph contains a cycle.', id, node))
      return
    }
    if (state.get(id) === 'done') return
    state.set(id, 'visiting')
    const node = nodes.get(id)
    for (const input of Object.values(node?.inputs ?? {})) if (nodes.has(input.node)) visit(input.node)
    state.set(id, 'done')
    order.push(id)
  }
  for (const node of compiledGraph.nodes) visit(node.id)
  for (const result of compiledGraph.outputs) {
    if (!resolved.get(result.node)?.manifest.outputs.some((port) => port.name === result.port)) {
      diagnostics.push(diagnostic('unknown-output-port', 'Graph output references an unknown port.', `outputs.${result.node}.${result.port}`))
    }
  }
  if (isV2 && !diagnostics.length) {
    const outputTypes = new Map<string, PortType>()
    for (const id of order) {
      const node = nodes.get(id)!
      const operation = resolved.get(id)!
      const inputTypes = new Map<string, PortType>()
      const bindings = new Map<string, number>()
      for (const port of operation.manifest.inputs) {
        const input = node.inputs![port.name]
        const upstreamType = outputTypes.get(`${input.node}.${input.port}`)
        const projection: unknown = input.bits
        const upstreamBits = upstreamType?.family === 'bits' ? upstreamType.size as number : undefined
        if (projection !== undefined && upstreamBits === undefined) {
          diagnostics.push(diagnostic('graph.projection-invalid-format', 'Projection requires a bits output.', `${node.id}.inputs.${port.name}`, node))
          continue
        }
        if (projection !== undefined && !validProjection(projection, upstreamBits!)) {
          if (!Array.isArray(projection) || projection.length !== 2
            || !projection.every((part) => Number.isSafeInteger(part) && part >= 0)) {
            diagnostics.push(diagnostic('graph.projection-invalid-format', 'Projection is invalid.', `${node.id}.inputs.${port.name}`, node))
          } else if (projection[1] === 0) {
            diagnostics.push(diagnostic('graph.projection-empty-range', 'Projection is invalid.', `${node.id}.inputs.${port.name}`, node))
          } else {
            diagnostics.push(diagnostic('graph.projection-out-of-bounds', 'Projection is invalid.', `${node.id}.inputs.${port.name}`, node))
          }
          continue
        }
        const type = projection === undefined ? upstreamType : { family: 'bits' as const, size: (projection as readonly [number, number])[1] }
        if (!type || !typeMatches(port.type, type, bindings)) {
          diagnostics.push(diagnostic('incompatible-port-type', `Expected ${typeText(port.type)} input.`, `${node.id}.inputs.${port.name}`, node, { expected: typeText(port.type), actual: type ? typeText(type) : 'unknown' }))
          continue
        }
        inputTypes.set(port.name, type)
      }
      let inferred: Readonly<Record<string, PortType>> | undefined
      const operationBinding = bound.get(id)!
      if (operationBinding.inferOutputTypes) {
        const result = operationBinding.inferOutputTypes(Object.fromEntries(inputTypes), node)
        if (result && !result.ok) diagnostics.push(...result.diagnostics.map((item) => ({ ...item, path: `${node.id}.${item.path}` })))
        else if (result) inferred = result.value
      } else if (operation.manifest.outputTypeParameter) {
        const type = node.parameters?.[operation.manifest.outputTypeParameter]
        if (isPortType(type) && (!('size' in type) || typeof type.size === 'number')) {
          inferred = Object.fromEntries(operation.manifest.outputs.map((output) => [output.name, type]))
        } else {
          diagnostics.push(diagnostic('graph.unresolved-type', 'V2 graph output type cannot be resolved.', `${node.id}.${operation.manifest.outputTypeParameter}`, node))
        }
      }
      for (const output of operation.manifest.outputs) {
        const declared = inferred?.[output.name] ?? (() => {
          if (!('size' in output.type)) return output.type
          if (typeof output.type.size === 'number') return output.type
          const size = bindings.get(output.type.size)
          return size === undefined ? undefined : { ...output.type, size }
        })()
        if (!declared || ('size' in declared && typeof declared.size !== 'number')) {
          diagnostics.push(diagnostic('graph.unresolved-type', 'V2 graph output type cannot be resolved.', `${node.id}.${output.name}`, node))
          continue
        }
        outputTypes.set(`${id}.${output.name}`, declared)
      }
    }
    if (!diagnostics.length) {
      for (const check of expanded.projectionChecks) {
        const upstreamType = outputTypes.get(`${check.upstream.node}.${check.upstream.port}`)
        const upstreamBits = upstreamType?.family === 'bits' ? upstreamType.size as number : undefined
        if (upstreamBits === undefined || !validProjection(check.projection, upstreamBits)) {
          const projection = check.projection
          const code = !Array.isArray(projection)
            || projection.length !== 2
            || !projection.every((part) => Number.isSafeInteger(part) && part >= 0)
            ? 'graph.projection-invalid-format'
            : projection[1] === 0
              ? 'graph.projection-empty-range'
              : 'graph.projection-out-of-bounds'
          diagnostics.push(diagnostic(code, 'Projection is invalid.', `${check.target}.inputs.${check.input}`))
        }
      }
    }
    if (!diagnostics.length) {
      const lineage: LineageEdge[] = []
      const lineageKeys = new Set<string>()
      for (const id of order) {
        const node = nodes.get(id)!
        const operation = resolved.get(id)!
        const operationBinding = bound.get(id)!
        if (!operationBinding.lineage) continue
        const inputTypes = Object.fromEntries(operation.manifest.inputs.flatMap((port) => {
          const input = node.inputs?.[port.name]
          const type = input && outputTypes.get(`${input.node}.${input.port}`)
          return input && type ? [[port.name, input.bits && type.family === 'bits' ? { family: 'bits' as const, size: input.bits[1] } : type]] : []
        }))
        const declaration = operationBinding.lineage(inputTypes)
        for (const output of operation.manifest.outputs) {
          const outputType = outputTypes.get(`${id}.${output.name}`)
          const sources = declaration[output.name]
          if (outputType?.family !== 'bits') continue
          if (!sources || sources.length !== outputType.size) {
            diagnostics.push(diagnostic('graph.invalid-lineage', 'Lineage declaration does not match the output width.', `${node.id}.${output.name}`, node))
            continue
          }
          for (const [targetBit, entries] of sources.entries()) {
            for (const entry of entries) {
              const input = node.inputs?.[entry.port]
              const inputType = inputTypes[entry.port]
              if (!input || inputType?.family !== 'bits' || !Number.isSafeInteger(entry.bit) || entry.bit < 0 || entry.bit >= (inputType.size as number)) {
                diagnostics.push(diagnostic('graph.invalid-lineage', 'Lineage declaration references an invalid input bit.', `${node.id}.${output.name}.${targetBit}`, node))
                continue
              }
              const sourceBit = (input.bits?.[0] ?? 0) + entry.bit
              const edge = { source: `${input.node}.${input.port}`, sourceBit, target: `${id}.${output.name}`, targetBit }
              const key = `${edge.source}:${edge.sourceBit}:${edge.target}:${edge.targetBit}`
              if (!lineageKeys.has(key)) { lineageKeys.add(key); lineage.push(edge) }
            }
          }
        }
      }
      resolvedOutputTypes = Object.fromEntries(outputTypes)
      resolvedLineage = lineage
    }
  }
  if (diagnostics.length) return { ok: false, diagnostics }

  return {
    ok: true,
    value: {
      graph: compiledGraph,
      ...(isV2 ? { schema: 2 as const } : {}),
      ...(isV2 ? { outputTypes: resolvedOutputTypes, lineage: resolvedLineage } : {}),
      execute(executionInputs = {}, traceLimits?: TraceCollectionLimits) {
        const values = new Map<string, Record<string, CryptoValue>>()
        const trace: (TraceCheckpoint | TraceEvent)[] = []
        const warnings: Diagnostic[] = []
        let traceBytes = 0
        let droppedTraceEvents = 0
        let retainingTrace = true
        const appendTrace = (event: TraceCheckpoint | TraceEvent): void => {
          const bytes = traceEventBytes(event)
          if (traceLimits && (!retainingTrace || trace.length >= traceLimits.traceEvents || traceBytes + bytes > traceLimits.traceBytes)) {
            retainingTrace = false
            droppedTraceEvents += 1
            return
          }
          trace.push(event)
          traceBytes += bytes
        }
        for (const id of order) {
            const node = nodes.get(id)!
            const operation = resolved.get(id)!
            const parameters = { ...(node.parameters ?? {}) }
            const inputs: Record<string, CryptoValue> = {}
            for (const [name, ref] of Object.entries(node.inputs ?? {})) {
              const value = values.get(ref.node)![ref.port]
              inputs[name] = ref.bits === undefined ? value : projectBits(value as BitsValue, ref.bits[0], ref.bits[1])
            }
            if (node.operation === 'core.source@1') {
              const sourceBinding = bound.get(id)!
              const value = executionInputs[`${id}.value`] ?? sourceBinding.sourceValue
              if (!value) return { ok: false, diagnostics: [diagnostic('missing-execution-input', 'Source needs an execution input.', `${id}.value`, node)] }
              const declaredType = sourceBinding.sourceType
              if (!isCryptoValue(value) || !isPortType(declaredType) || !typeMatches(declaredType, actualType(value), new Map())) {
                // Width mismatch on an otherwise valid bits value: expose expected/actual bit
                // sizes. Wrong family/type or malformed values keep the bare diagnostic.
                let details: Diagnostic['details'] = {}
                if (isCryptoValue(value) && isPortType(declaredType)
                  && declaredType.family === 'bits' && value.type.family === 'bits'
                  && typeof declaredType.size === 'number'
                  && declaredType.size !== value.type.size) {
                  details = { expectedBits: declaredType.size, actualBits: value.type.size }
                }
                return { ok: false, diagnostics: [diagnostic(
                  'invalid-execution-input',
                  'Execution input does not match source type.',
                  `${id}.value`,
                  node,
                  details,
                )] }
              }
              if ('symbol' in value && !mappings.get(value.type.mapping)?.symbols.includes(value.symbol)) {
                return { ok: false, diagnostics: [diagnostic('invalid-execution-input', 'Alphabet symbol is not in declared mapping.', `${id}.value`, node)] }
              }
            }
            let result: Record<string, CryptoValue>
            try {
              result = bound.get(id)!.execute(inputs, mappings, node.operation === 'core.source@1'
                ? executionInputs[`${id}.value`] ?? bound.get(id)!.sourceValue
                : undefined)
            } catch (error) {
              return { ok: false, diagnostics: [error instanceof CipherDiagnostic
                ? diagnostic(error.code, error.message, error.code === 'cipher.invalid-transposition-rows' ? `${id}.inputs.rows` : id, node, error.details)
                : diagnostic('operation-failed', 'Operation execution failed.', id, node)] }
            }
            if (node.operation === 'classical.transposition@1' && (inputs.text as TextValue).symbols.length < (inputs.rows as IntegerValue).value) {
              warnings.push(diagnostic('cipher.transposition-short-input', 'The text length is smaller than the transposition parameter; the result is unchanged.', `${id}.inputs.text`, node, { direction: (inputs.direction as AlphabetDirectionValue).value }))
            }
            for (const [port, value] of Object.entries(result)) {
              if (!validSizedValue(value)) return { ok: false, diagnostics: [diagnostic('invalid-value', 'Operation returned an invalid value.', `${id}.${port}`, node)] }
            }
            values.set(id, result)
            const roundStage = /^(.*)\.(\d+)\/(key-mix|substitute|permute)$/.exec(id)
            const roundKey = /^(.*)\.(\d+)\/key$/.exec(id)
            const cipherStage = /^cipher-(\d+)-(add-round-key|sub-bytes|shift-rows|mix-columns|inv-shift-rows|inv-sub-bytes|inv-mix-columns)$/.exec(id)
            if (compiledGraph.schema === 2) {
              appendTrace({
                path: `${id}.value`,
                level: 'detail',
                primitive: node.operation,
                parameters: structuredClone(bound.get(id)!.traceParameters),
                ...(node.role ? { role: node.role } : {}),
                ...(node.round === undefined ? {} : { round: node.round }),
                ...(node.iteration === undefined ? {} : { iteration: node.iteration }),
                ...(node.unit === undefined ? {} : { unit: node.unit }),
                value: cloneValue(result.value),
              })
            } else if (compiledGraph.traceLevel === 'detail' && node.operation === 'core.source@1' && (id === 'plaintext' || id === 'state')) {
              appendTrace({ path: 'plaintext', level: 'detail', stage: 'input', value: cloneValue(result.value) })
            } else if (compiledGraph.traceLevel === 'detail' && node.operation === 'core.source@1' && id === 'ciphertext') {
              appendTrace({ path: 'ciphertext', level: 'detail', stage: 'input', value: cloneValue(result.value) })
            } else if (compiledGraph.traceLevel === 'detail' && cipherStage) {
              appendTrace({ path: id, level: 'detail', round: Number(cipherStage[1]), stage: cipherStage[2] as TraceStage, value: cloneValue(result.value) })
            } else if (compiledGraph.traceLevel === 'detail' && roundKey) {
              appendTrace({ path: `${roundKey[1]}.${roundKey[2]}/key`, level: 'detail', round: Number(roundKey[2]), stage: 'round-key', value: cloneValue(result.value) })
            } else if (roundStage) {
              const instance = roundStage[1]
              const round = Number(roundStage[2])
              const stage = roundStage[3] as 'key-mix' | 'substitute' | 'permute'
              const value = cloneValue(result.value)
              const traceOperation = stage === 'substitute' || stage === 'permute' ? bound.get(id)!.legacyTraceOperation : undefined
              if (compiledGraph.traceLevel === 'detail') appendTrace({
                path: `${instance}.${round}/${stage}`,
                level: 'detail',
                round,
                stage,
                ...(traceOperation ? { operation: traceOperation } : {}),
                value,
              })
              if (stage === 'permute' && (compiledGraph.traceLevel === 'detail' || compiledGraph.traceLevel === 'round')) {
                appendTrace({ path: `${instance}.${round}/output`, level: 'round', round, stage: 'output', value })
              }
            } else if (compiledGraph.traceLevel === 'detail' && node.operation === 'classical.transposition@1') {
              const source = inputs.text as TextValue
              const rows = (inputs.rows as IntegerValue).value
              const direction = (inputs.direction as AlphabetDirectionValue).value
              const grid = direction === 'encrypt'
                ? Array.from({ length: rows }, (_, row) => source.symbols.filter((_, index) => index % rows === row))
                : (() => { const width = Math.floor(source.symbols.length / rows); const remainder = source.symbols.length % rows; let offset = 0; return Array.from({ length: rows }, (_, row) => { const length = width + (row < remainder ? 1 : 0); const part = source.symbols.slice(offset, offset + length); offset += length; return part }) })()
              const readOrder = direction === 'encrypt'
                ? grid.flatMap((row, rowIndex) => row.map((_, index) => index * rows + rowIndex))
                : (() => {
                  let offset = 0
                  const ciphertextPositions = grid.map((row) => { const positions = row.map((_) => offset++); return positions })
                  return Array.from({ length: grid[0]?.length ?? 0 }, (_, column) => grid.flatMap((row, rowIndex) => row[column] === undefined ? [] : [ciphertextPositions[rowIndex][column]])).flat()
                })()
              let inputOffset = 0
              const inputPositions = grid.map((row, rowIndex) => Array.from({ length: Math.ceil(source.symbols.length / rows) }, (_, column) =>
                row[column] === undefined ? null : direction === 'encrypt' ? column * rows + rowIndex : inputOffset++))
              appendTrace({ path: id, level: 'detail', stage: 'transposition', operation: { grid: { inputPositions, rows: grid.map((row) => Array.from({ length: Math.ceil(source.symbols.length / rows) }, (_, index) => row[index] ?? null)), writeOrder: source.symbols.map((_, index) => index), readOrder } }, value: cloneValue(result.text) })
            } else if (compiledGraph.traceLevel === 'detail' && node.operation === 'aes.key-word@1' && /^word-\d+$/.test(id)) {
              const wordIndex = Number(/^word-(\d+)$/.exec(id)![1])
              appendTrace({ path: id, level: 'detail', round: Math.floor(wordIndex / 4), stage: 'input', word: wordIndex, value: cloneValue(result.value) })
            } else if (compiledGraph.traceLevel === 'detail' && /^word-\d+-(rot|sub|rcon|temp)$/.test(id)) {
              const [, wordIndex, stageToken] = /^word-(\d+)-(rot|sub|rcon|temp)$/.exec(id)!
              const aesStage = { rot: 'rot-word', sub: 'sub-word', rcon: 'rcon', temp: 'word-xor' }[stageToken as 'rot' | 'sub' | 'rcon' | 'temp'] as TraceStage
              appendTrace({ path: id, level: 'detail', round: Math.floor(Number(wordIndex) / 4), stage: aesStage, word: Number(wordIndex), value: cloneValue(result.value) })
            } else if (compiledGraph.traceLevel === 'detail' && /^word-\d+$/.test(id)) {
              const wordIndex = Number(/^word-(\d+)$/.exec(id)![1])
              appendTrace({ path: id, level: 'detail', round: Math.floor(wordIndex / 4), stage: 'word-xor', word: wordIndex, value: cloneValue(result.value) })
            } else if (compiledGraph.traceLevel === 'detail' && /^round-key-\d+$/.test(id)) {
              const round = Number(/^round-key-(\d+)$/.exec(id)![1])
              appendTrace({ path: id, level: 'detail', round, stage: 'round-key', value: cloneValue(result.value) })
            } else if (compiledGraph.traceLevel === undefined) {
              for (const port of Object.keys(result)) appendTrace({ path: `${id}.${port}`, stage: 'output', summary: `${id}.${port}` })
            }
        }
        const outputs: Record<string, CryptoValue> = {}
        for (const ref of compiledGraph.outputs) outputs[`${ref.node}.${ref.port}`] = cloneValue(values.get(ref.node)![ref.port])
        if (compiledGraph.traceLevel !== undefined) {
          const output = Object.values(outputs)[0]
          appendTrace({ path: 'output', level: 'summary', stage: 'output', value: cloneValue(output) })
        }
        const snapshot = { outputs, trace, ...(warnings.length ? { warnings } : {}) }
        if (traceLimits) traceStatuses.set(snapshot, { truncated: droppedTraceEvents > 0, retained: trace.length, dropped: droppedTraceEvents })
        return { ok: true, value: snapshot }
      },
    },
  }
}

type ResolvedWorkerLimits = WorkerLimitValues

const resolveWorkerLimits = (requested: WorkerLimits | undefined): Result<ResolvedWorkerLimits> => {
  if (requested === undefined) return { ok: true, value: { ...maxWorkerLimits } }
  if (typeof requested !== 'object' || requested === null) {
    return { ok: false, diagnostics: [diagnostic('execution.invalid-limit', 'Limits must be an object.', 'limits')] }
  }
  const limits = { ...maxWorkerLimits }
  for (const [name, value] of Object.entries(requested)) {
    if (!(name in maxWorkerLimits)) {
      return { ok: false, diagnostics: [diagnostic('execution.invalid-limit', 'Limit is not supported.', `limits.${name}`)] }
    }
    const maximum = maxWorkerLimits[name as keyof typeof maxWorkerLimits]
    if (!Number.isSafeInteger(value) || value <= 0) {
      return { ok: false, diagnostics: [diagnostic('execution.invalid-limit', 'Limits must be positive safe integers.', `limits.${name}`)] }
    }
    if (value > maximum) {
      return { ok: false, diagnostics: [diagnostic('execution.limit-exceeds-global', 'Requested limit exceeds the global maximum.', `limits.${name}`, undefined, { maximum, requested: value })] }
    }
    Object.assign(limits, { [name]: value })
  }
  return { ok: true, value: limits }
}

const lowerWorkerLimits = (left: ResolvedWorkerLimits, right: ResolvedWorkerLimits): ResolvedWorkerLimits => ({
  expandedNodes: Math.min(left.expandedNodes, right.expandedNodes),
  inputBytes: Math.min(left.inputBytes, right.inputBytes),
  traceEvents: Math.min(left.traceEvents, right.traceEvents),
  traceBytes: Math.min(left.traceBytes, right.traceBytes),
  timeoutMs: Math.min(left.timeoutMs, right.timeoutMs),
})

type WorkerBudget = {
  readonly limits: ResolvedWorkerLimits
  nodes: number
  inputBytes: number
  traceEvents: number
  traceBytes: number
}

const cryptoValueBytes = (value: CryptoValue): number => {
  if ('symbol' in value) return new TextEncoder().encode(value.symbol).byteLength
  if (isAlphabetTextValue(value)) return new TextEncoder().encode(value.symbols.join('')).byteLength
  if (isTextValue(value)) return new TextEncoder().encode(value.symbols.join('')).byteLength
  if (isIntegerValue(value)) return 8
  if (isAlphabetPolicyValue(value)) return 1
  if (isAlphabetDirectionValue(value)) return 1
  return ('words' in value ? value.words : value.bytes).byteLength
}

const executionInputBytes = (payload: WorkerExecutionPayload): Result<number> => {
  let total = 0
  const countValues = (source: unknown): void => {
    const pending = [source]
    const visited = new Set<object>()
    while (pending.length) {
      const value = pending.pop()
      if (isCryptoValue(value)) {
        total += cryptoValueBytes(value)
      } else if (typeof value === 'object' && value !== null && !ArrayBuffer.isView(value) && !visited.has(value)) {
        visited.add(value)
        pending.push(...Object.values(value))
      }
    }
  }
  for (const value of Object.values(payload.inputs ?? {})) {
    if (!isCryptoValue(value)) {
      return { ok: false, diagnostics: [diagnostic('execution.invalid-input', 'Execution inputs must be CryptoGraph values.', 'inputs')] }
    }
    countValues(value)
  }
  const graphNodes = [
    ...payload.graph.nodes,
    ...Object.values(payload.graph.subgraphs ?? {}).flatMap((subgraph) => subgraph.nodes),
  ]
  for (const node of graphNodes) {
    countValues(node.parameters)
  }
  return { ok: true, value: total }
}

const traceEventBytes = (event: TraceCheckpoint | TraceEvent): number => {
  const path = new TextEncoder().encode(event.path).byteLength
  return 'value' in event && event.value ? path + cryptoValueBytes(event.value) : path
}

const expandedNodeCount = (graph: AuthoredGraph, limit: number): number => {
  let count = 0
  for (const node of graph.nodes) {
    if (!node.repeat) {
      count += 1
    } else if (typeof node.repeat.count === 'number' && Number.isSafeInteger(node.repeat.count) && node.repeat.count > 0) {
      const subgraph = graph.subgraphs?.[node.repeat.subgraph]
      if (node.repeat.count > limit || !subgraph || subgraph.nodes.length > Math.floor((limit - count) / node.repeat.count)) {
        return limit + 1
      }
      count += subgraph.nodes.length * node.repeat.count
    }
    if (count > limit) return limit + 1
  }
  return count
}

const executeWorkerPayload = (
  payload: WorkerExecutionPayload,
  limits: ResolvedWorkerLimits,
  budget?: WorkerBudget,
  compiledGraphs?: Map<string, CompiledGraph>,
): Result<WorkerExecutionSnapshot> => {
  const inputBytes = executionInputBytes(payload)
  if (!inputBytes.ok) return inputBytes
  if (inputBytes.value > limits.inputBytes) {
    return { ok: false, diagnostics: [diagnostic('execution.input-limit', 'Execution input exceeds the input limit.', 'inputs', undefined, { limit: limits.inputBytes, actual: inputBytes.value })] }
  }
  if (budget && budget.inputBytes + inputBytes.value > budget.limits.inputBytes) {
    return { ok: false, diagnostics: [diagnostic('execution.input-limit', 'Execution input exceeds the input limit.', 'inputs', undefined, { limit: budget.limits.inputBytes, actual: budget.inputBytes + inputBytes.value })] }
  }
  const nodes = expandedNodeCount(payload.graph, limits.expandedNodes)
  if (nodes > limits.expandedNodes) {
    return { ok: false, diagnostics: [diagnostic('execution.node-limit', 'Expanded graph exceeds the node limit.', 'graph.nodes', undefined, { limit: limits.expandedNodes, actual: nodes })] }
  }
  if (budget && budget.nodes + nodes > budget.limits.expandedNodes) {
    return { ok: false, diagnostics: [diagnostic('execution.node-limit', 'Expanded graph exceeds the node limit.', 'graph.nodes', undefined, { limit: budget.limits.expandedNodes, actual: budget.nodes + nodes })] }
  }
  if (budget) {
    budget.inputBytes += inputBytes.value
    budget.nodes += nodes
  }
  let compiled = payload.compiledGraphId ? compiledGraphs?.get(payload.compiledGraphId) : undefined
  if (!compiled) {
    const result = compile(payload.graph)
    if (!result.ok) return result
    compiled = result.value
    if (payload.compiledGraphId) compiledGraphs?.set(payload.compiledGraphId, compiled)
  }
  const traceLimits: TraceCollectionLimits = budget
    ? {
        traceEvents: Math.min(limits.traceEvents, budget.limits.traceEvents - budget.traceEvents),
        traceBytes: Math.min(limits.traceBytes, budget.limits.traceBytes - budget.traceBytes),
      }
    : limits
  const execution = (compiled.execute as LimitedExecutor)(payload.inputs ? { ...payload.inputs } : {}, traceLimits)
  if (!execution.ok) return execution
  const snapshot = structuredClone({
      ...execution.value,
      traceStatus: traceStatuses.get(execution.value) ?? { truncated: false, retained: execution.value.trace.length, dropped: 0 },
  })
  if (budget) {
    budget.traceEvents += snapshot.trace.length
    budget.traceBytes += snapshot.trace.reduce((total, event) => total + traceEventBytes(event), 0)
  }
  structureSignatures.set(snapshot, structuralSignature(compiled.graph))
  const repeats = repeatIdentities(payload.graph)
  relativeTracePaths.set(snapshot, new Map(snapshot.trace.map((event) => [event.path, relativeTracePath(event.path, repeats)])))
  ambiguousRepeatIdentities.set(snapshot, repeats.ambiguous)
  return { ok: true, value: snapshot }
}

const bitCount = (byte: number): number => {
  let count = 0
  for (let bits = byte; bits; bits >>>= 1) count += bits & 1
  return count
}

const compareSnapshots = (
  left: WorkerExecutionSnapshot,
  right: WorkerExecutionSnapshot,
  level: TraceLevel,
): Result<AvalancheComparison> => {
  if (structureSignatures.get(left) !== structureSignatures.get(right)) {
    return { ok: false, diagnostics: [diagnostic('comparison.incompatible-structure', 'Graphs do not have equivalent structure.', 'graph')] }
  }
  if (ambiguousRepeatIdentities.get(left) || ambiguousRepeatIdentities.get(right)) {
    return { ok: false, diagnostics: [diagnostic('comparison.incompatible-structure', 'Repeat identities cannot be aligned structurally.', 'trace')] }
  }
  const truncated = left.traceStatus.truncated || right.traceStatus.truncated
  const checkpoints = (snapshot: WorkerExecutionSnapshot): Result<Map<string, { readonly value: BitsValue; readonly event: TraceEvent }>> => {
    const values = new Map<string, { readonly value: BitsValue; readonly event: TraceEvent }>()
    const paths = relativeTracePaths.get(snapshot)
    for (const event of snapshot.trace) {
      if (!('value' in event) || !event.value) continue
      const value = event.value
      if (!isBitsValue(value)) {
        return { ok: false, diagnostics: [diagnostic('comparison.incompatible-value', 'Comparison supports bits checkpoints only.', event.path)] }
      }
      const path = paths?.get(event.path) ?? event.path
      if (values.has(path)) {
        return { ok: false, diagnostics: [diagnostic('comparison.incompatible-structure', 'Trace paths must be unique.', path)] }
      }
      values.set(path, { value, event })
    }
    return { ok: true, value: values }
  }
  const leftCheckpoints = checkpoints(left)
  if (!leftCheckpoints.ok) return leftCheckpoints
  const rightCheckpoints = checkpoints(right)
  if (!rightCheckpoints.ok) return rightCheckpoints
  if (!truncated && leftCheckpoints.value.size !== rightCheckpoints.value.size) {
    return { ok: false, diagnostics: [diagnostic('comparison.incompatible-structure', 'Trace checkpoint paths do not match.', 'trace')] }
  }
  const differences: AvalancheCheckpoint[] = []
  for (const [path, left] of leftCheckpoints.value) {
    const right = rightCheckpoints.value.get(path)
    if (!right) {
      if (truncated) {
        differences.push({
          path,
          ...(left.event.round === undefined ? {} : { round: left.event.round }),
          ...(left.event.stage === undefined ? {} : { stage: left.event.stage }),
          complete: false,
        })
        continue
      }
      return { ok: false, diagnostics: [diagnostic('comparison.incompatible-structure', 'Trace checkpoint paths do not match.', `trace.${path}`)] }
    }
    const leftValue = left.value
    const rightValue = right.value
    if (leftValue.type.size !== rightValue.type.size) {
      return { ok: false, diagnostics: [diagnostic('comparison.incompatible-value', 'Checkpoint widths do not match.', `trace.${path}`)] }
    }
    const mask = bits(leftValue.type.size, leftValue.bytes.map((byte, index) => byte ^ rightValue.bytes[index]))
    const changedBits = [...mask.bytes].reduce((count, byte) => count + bitCount(byte), 0)
    differences.push({
      path,
      ...(left.event.round === undefined ? {} : { round: left.event.round }),
      ...(left.event.stage === undefined ? {} : { stage: left.event.stage }),
      ...(left.event.operation === undefined ? {} : { operation: left.event.operation }),
      complete: true,
      left: cloneValue(leftValue) as BitsValue,
      right: cloneValue(rightValue) as BitsValue,
      mask,
      changedBits,
      ratio: changedBits / leftValue.type.size,
    })
  }
  if (truncated) for (const [path, right] of rightCheckpoints.value) {
    if (leftCheckpoints.value.has(path)) continue
    differences.push({
      path,
      ...(right.event.round === undefined ? {} : { round: right.event.round }),
      ...(right.event.stage === undefined ? {} : { stage: right.event.stage }),
      complete: false,
    })
  }
  return {
    ok: true,
    value: {
      traceLevel: level,
      checkpoints: differences,
      executions: { baseline: left, changed: right },
      truncated,
    },
  }
}

export const executeWorkerRequest = (request: WorkerRequest, compiledGraphs?: Map<string, CompiledGraph>): WorkerResponse => {
  const requestId = typeof request?.requestId === 'string' ? request.requestId : ''
  try {
    const limits = resolveWorkerLimits(request.payload?.limits)
    if (!limits.ok) return { requestId, kind: 'diagnostic', diagnostics: limits.diagnostics }
    if (request.kind === 'execute') {
      const execution = executeWorkerPayload(request.payload, limits.value, undefined, compiledGraphs)
      return execution.ok
        ? { requestId, kind: 'snapshot', snapshot: execution.value }
        : { requestId, kind: 'diagnostic', diagnostics: execution.diagnostics }
    }
    if (request.kind === 'compare') {
      const { left, right } = request.payload
      if (left.graph.schema === 2 || right.graph.schema === 2) {
        return { requestId, kind: 'diagnostic', diagnostics: [diagnostic('comparison.v2-unsupported', 'Comparison is not supported for version: 2 graphs.', 'graph.schema')] }
      }
      const leftLimits = resolveWorkerLimits(left.limits)
      if (!leftLimits.ok) return { requestId, kind: 'diagnostic', diagnostics: leftLimits.diagnostics }
      const rightLimits = resolveWorkerLimits(right.limits)
      if (!rightLimits.ok) return { requestId, kind: 'diagnostic', diagnostics: rightLimits.diagnostics }
      if (left.graph.traceLevel === undefined || left.graph.traceLevel !== right.graph.traceLevel) {
        return { requestId, kind: 'diagnostic', diagnostics: [diagnostic('comparison.incompatible-trace-level', 'Comparison requires identical selected trace levels.', 'traceLevel')] }
      }
      const budget: WorkerBudget = { limits: limits.value, nodes: 0, inputBytes: 0, traceEvents: 0, traceBytes: 0 }
      const leftExecution = executeWorkerPayload(left, lowerWorkerLimits(limits.value, leftLimits.value), budget)
      if (!leftExecution.ok) return { requestId, kind: 'diagnostic', diagnostics: leftExecution.diagnostics }
      const rightExecution = executeWorkerPayload(right, lowerWorkerLimits(limits.value, rightLimits.value), budget)
      if (!rightExecution.ok) return { requestId, kind: 'diagnostic', diagnostics: rightExecution.diagnostics }
      const comparison = compareSnapshots(leftExecution.value, rightExecution.value, left.graph.traceLevel)
      return comparison.ok
        ? { requestId, kind: 'comparison', comparison: structuredClone(comparison.value) }
        : { requestId, kind: 'diagnostic', diagnostics: comparison.diagnostics }
    }
    return { requestId, kind: 'diagnostic', diagnostics: [diagnostic('execution.invalid-request', 'Worker request kind is not supported.', 'kind')] }
  } catch {
    return { requestId, kind: 'diagnostic', diagnostics: [diagnostic('execution.invalid-request', 'Worker request is malformed.', 'request')] }
  }
}

export { CryptoGraphWorkerClient, type PendingWorkerRequest } from './worker_adapter'
