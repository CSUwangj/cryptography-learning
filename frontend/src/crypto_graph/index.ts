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
  | { family: 'integer'; signed: true; safe: true }
  | { family: 'alphabet-policy' }

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

export type IntegerValue = {
  type: { family: 'integer'; signed: true; safe: true }
  value: number
}

export type AlphabetPolicyValue = {
  type: { family: 'alphabet-policy' }
  value: 'preserve' | 'strict'
}

export type CryptoValue = BitsValue | BytesValue | WordsValue | AlphabetSymbolValue | AlphabetTextValue | IntegerValue | AlphabetPolicyValue

type ByteValue = BitsValue | BytesValue | WordsValue

const isIntegerValue = (value: CryptoValue): value is IntegerValue => value.type.family === 'integer'
const isAlphabetPolicyValue = (value: CryptoValue): value is AlphabetPolicyValue => value.type.family === 'alphabet-policy'
const isAlphabetTextValue = (value: CryptoValue): value is AlphabetTextValue => value.type.family === 'alphabet-text'
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

export type AuthoredInput = {
  node: string
  port: string
}

export type AuthoredNode = {
  id: string
  operation?: string
  repeat?: { subgraph: string; count?: unknown }
  inputs?: Record<string, AuthoredInput>
  parameters?: Record<string, unknown>
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
}

export type TraceCheckpoint = {
  readonly path: string
  readonly stage: 'output'
  readonly summary: string
}

export type TraceLevel = 'summary' | 'round' | 'detail'
export type TraceStage = 'input' | 'round-key' | 'key-mix' | 'substitute' | 'permute' | 'output' | 'rot-word' | 'sub-word' | 'rcon' | 'word-xor'
export type TraceOperation = {
  readonly sBox?: readonly number[]
  readonly permutation?: readonly number[]
}

export type TraceEvent = {
  readonly path: string
  readonly level: TraceLevel
  readonly round?: number
  readonly stage?: TraceStage
  readonly operation?: TraceOperation
  readonly value?: CryptoValue
}

export type SerializedTraceEvent = Omit<TraceEvent, 'value'> & {
  readonly value?: { readonly type: CryptoValue['type']; readonly hex: string }
}

export type ExecutionSnapshot = {
  readonly outputs: Readonly<Record<string, CryptoValue>>
  readonly trace: readonly (TraceCheckpoint | TraceEvent)[]
}

export type WorkerLimitValues = {
  expandedNodes: number
  inputBytes: number
  traceEvents: number
  traceBytes: number
  timeoutMs: number
}

export const maxWorkerLimits = Object.freeze({
  expandedNodes: 128,
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

type Operation = {
  manifest: OperationManifest
  validateParameters?: (parameters: Record<string, unknown>, node: AuthoredNode) => Diagnostic[]
  execute: (inputs: Record<string, CryptoValue>, parameters: Record<string, unknown>, mappings: ReadonlyMap<string, AlphabetMapping>) => Record<string, CryptoValue>
}

export type CompiledGraph = {
  readonly graph: AuthoredGraph
  execute: (inputs?: Record<string, CryptoValue>) => Result<ExecutionSnapshot>
}

const diagnostic = (
  code: string,
  message: string,
  path: string,
  node?: AuthoredNode,
  details: Record<string, string | number | boolean | null> = {},
): Diagnostic => ({
  code,
  message,
  path,
  ...(node?.origin ? { span: node.origin } : {}),
  details,
})

const traceStatuses = new WeakMap<ExecutionSnapshot, TraceStatus>()
const structureSignatures = new WeakMap<WorkerExecutionSnapshot, string>()
const relativeTracePaths = new WeakMap<WorkerExecutionSnapshot, ReadonlyMap<string, string>>()
const ambiguousRepeatIdentities = new WeakMap<WorkerExecutionSnapshot, boolean>()

const cloneValue = (value: CryptoValue): CryptoValue => {
  if ('symbol' in value) return { type: { family: 'alphabet-symbol', mapping: value.type.mapping }, symbol: value.symbol }
  if (isAlphabetTextValue(value)) return { type: { family: 'alphabet-text', mapping: value.type.mapping }, symbols: [...value.symbols] }
  if (isIntegerValue(value)) return { type: { family: 'integer', signed: true, safe: true }, value: value.value }
  if (isAlphabetPolicyValue(value)) return { type: { family: 'alphabet-policy' }, value: value.value }
  if ('words' in value) return { type: { family: 'words', size: value.type.size, wordSize: 8 }, words: value.words.slice() }
  return value.type.family === 'bits'
    ? { type: { family: 'bits', size: value.type.size }, bytes: value.bytes.slice() }
    : { type: { family: 'bytes', size: value.type.size }, bytes: value.bytes.slice() }
}

const actualType = (value: CryptoValue): PortType => value.type

const typeMatches = (expected: PortType, actual: PortType, bindings: Map<string, number>): boolean => {
  if (expected.family !== actual.family) return false
  if (expected.family === 'alphabet-symbol' && actual.family === 'alphabet-symbol') {
    return expected.mapping === actual.mapping
  }
  if (expected.family === 'alphabet-text' && actual.family === 'alphabet-text') {
    return expected.mapping === '*' || expected.mapping === actual.mapping
  }
  if (expected.family === 'integer' || expected.family === 'alphabet-policy') return true
  if (expected.family === 'words' && actual.family === 'words' && expected.wordSize !== actual.wordSize) return false
  if (expected.family === 'alphabet-symbol' || expected.family === 'alphabet-text' || actual.family === 'alphabet-symbol' || actual.family === 'alphabet-text') return false
  const binaryExpected = expected as Exclude<PortType, { family: 'alphabet-symbol' | 'alphabet-text' | 'integer' | 'alphabet-policy' }>
  const binaryActual = actual as Exclude<PortType, { family: 'alphabet-symbol' | 'alphabet-text' | 'integer' | 'alphabet-policy' }>
  const actualSize = binaryActual.size as number
  if (typeof binaryExpected.size === 'number') return binaryExpected.size === actualSize
  const bound = bindings.get(binaryExpected.size)
  if (bound === undefined) {
    bindings.set(binaryExpected.size, actualSize)
    return true
  }
  return bound === actualSize
}

const typeText = (type: PortType): string => {
  if (type.family === 'alphabet-symbol') return `alphabet-symbol<${type.mapping}>`
  if (type.family === 'alphabet-text') return `alphabet-text<${type.mapping}>`
  if (type.family === 'integer') return 'integer'
  if (type.family === 'alphabet-policy') return 'alphabet-policy'
  if (type.family === 'words') return `words<${type.size},u8>`
  return `${type.family}<${type.size}>`
}

const isPortType = (value: unknown): value is PortType => {
  if (typeof value !== 'object' || value === null) return false
  const type = value as Record<string, unknown>
  if (type.family === 'alphabet-symbol') return typeof type.mapping === 'string'
  if (type.family === 'alphabet-text') return typeof type.mapping === 'string'
  if (type.family === 'integer') return type.signed === true && type.safe === true
  if (type.family === 'alphabet-policy') return true
  if ((type.family === 'bits' || type.family === 'bytes') && (typeof type.size === 'number' || typeof type.size === 'string')) return true
  return type.family === 'words' && (typeof type.size === 'number' || typeof type.size === 'string') && type.wordSize === 8
}

const isUint8Array = (value: unknown): value is Uint8Array =>
  Object.prototype.toString.call(value) === '[object Uint8Array]'

const isCryptoValue = (value: unknown): value is CryptoValue => {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const candidate = value as { type: unknown; bytes?: unknown; words?: unknown; symbol?: unknown; symbols?: unknown; value?: unknown }
  if (!isPortType(candidate.type)) return false
  if (candidate.type.family === 'alphabet-symbol') return typeof candidate.symbol === 'string'
  if (candidate.type.family === 'alphabet-text') {
    return Array.isArray(candidate.symbols) && candidate.symbols.every((symbol) => typeof symbol === 'string' && [...symbol].length === 1)
  }
  if (candidate.type.family === 'integer') return typeof candidate.value === 'number'
  if (candidate.type.family === 'alphabet-policy') return candidate.value === 'preserve' || candidate.value === 'strict'
  return candidate.type.family === 'words' ? isUint8Array(candidate.words) : isUint8Array(candidate.bytes)
}

const isBitsValue = (value: CryptoValue): value is BitsValue => value.type.family === 'bits'

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

const bytesForBits = (size: number) => Math.ceil(size / 8)

const validSizedValue = (value: CryptoValue): boolean => {
  if ('symbol' in value) return true
  if (isAlphabetTextValue(value) || isIntegerValue(value) || isAlphabetPolicyValue(value)) return true
  if (!isByteValue(value)) return false
  const size = value.type.size
  const contents = 'words' in value ? value.words : value.bytes
  if (!Number.isInteger(size) || size <= 0 || contents.length !== (value.type.family === 'bits' ? bytesForBits(size) : size)) return false
  return value.type.family !== 'bits' || size % 8 === 0 || contents[0] < 2 ** (size % 8)
}

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

export const integer = (value: number): IntegerValue => ({
  type: { family: 'integer', signed: true, safe: true },
  value,
})

export const alphabetPolicy = (value: AlphabetPolicyValue['value']): AlphabetPolicyValue => ({
  type: { family: 'alphabet-policy' },
  value,
})

export const hex = (value: BitsValue | BytesValue): string =>
  `0x${[...value.bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(-(value.type.family === 'bits' ? Math.ceil(value.type.size / 4) : value.type.size * 2))}`

export const serializeTrace = (trace: readonly TraceEvent[]): readonly SerializedTraceEvent[] =>
  trace.map(({ value, ...event }) => ({
    ...event,
    ...(value && 'bytes' in value ? { value: { type: value.type, hex: hex(value) } } : {}),
  }))

const source: Operation = {
  manifest: {
    identity: 'core.source@1',
    inputs: [],
    outputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
    outputTypeParameter: 'type',
  },
  validateParameters(parameters, node) {
    if (!isPortType(parameters.type)) {
      return [diagnostic('invalid-parameter', 'Source requires a declared port type.', `${node.id}.parameters.type`, node)]
    }
    if (parameters.value !== undefined && (!isCryptoValue(parameters.value) || !validSizedValue(parameters.value) || !typeMatches(parameters.type, actualType(parameters.value), new Map()))) {
      return [diagnostic('invalid-parameter', 'Source value does not match its declared type.', `${node.id}.parameters.value`, node)]
    }
    return []
  },
  execute(_, parameters) {
    return { value: cloneValue(parameters.value as CryptoValue) }
  },
}

const xor: Operation = {
  manifest: {
    identity: 'core.xor@1',
    inputs: [{ name: 'left', type: { family: 'bits', size: 'N' } }, { name: 'right', type: { family: 'bits', size: 'N' } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
  },
  execute(inputs) {
    const left = inputs.left as BitsValue
    const right = inputs.right as BitsValue
    return { value: bits(left.type.size, left.bytes.map((value, index) => value ^ right.bytes[index])) }
  },
}

const validPermutation = (values: unknown, size: number): values is readonly number[] =>
  Array.isArray(values)
  && values.length === size
  && values.every((value) => Number.isInteger(value) && value >= 0 && value < size)
  && new Set(values).size === size

const substitute: Operation = {
  manifest: {
    identity: 'spn.substitute@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 16 } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 16 } }],
  },
  validateParameters(parameters, node) {
    return validPermutation(parameters.sBox, 16)
      ? []
      : [diagnostic('spn.invalid-s-box', 'S-box must be a permutation of 0 through 15.', `${node.id}.parameters.sBox`, node)]
  },
  execute(inputs, parameters) {
    const sBox = parameters.sBox as readonly number[]
    const input = inputs.value as BitsValue
    return {
      value: bits(16, input.bytes.map((byte) => (sBox[byte >> 4] << 4) | sBox[byte & 0x0f])),
    }
  },
}

const permute: Operation = {
  manifest: {
    identity: 'spn.permute@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 16 } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 16 } }],
  },
  validateParameters(parameters, node) {
    return validPermutation(parameters.permutation, 4)
      ? []
      : [diagnostic('spn.invalid-permutation', 'Permutation must be a permutation of 0 through 3.', `${node.id}.parameters.permutation`, node)]
  },
  execute(inputs, parameters) {
    const input = inputs.value as BitsValue
    const nibbles = [input.bytes[0] >> 4, input.bytes[0] & 0x0f, input.bytes[1] >> 4, input.bytes[1] & 0x0f]
    const output = new Uint8Array(4)
    for (const [index, destination] of (parameters.permutation as readonly number[]).entries()) output[destination] = nibbles[index]
    return { value: bits(16, Uint8Array.of((output[0] << 4) | output[1], (output[2] << 4) | output[3])) }
  },
}

const output: Operation = {
  manifest: { identity: 'core.output@1', inputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }], outputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }] },
  execute(inputs) {
    return { value: cloneValue(inputs.value) }
  },
}

class CipherDiagnostic extends Error {
  constructor(
    readonly code: string,
    readonly message: string,
    readonly details: Diagnostic['details'],
  ) {
    super(message)
  }
}

const validKey = (value: IntegerValue): void => {
  if (!Number.isInteger(value.value)) {
    throw new CipherDiagnostic(
      'cipher.invalid-key',
      'Cipher keys must be integers.',
      { reason: Number.isFinite(value.value) ? 'fraction' : 'non-integer' },
    )
  }
  if (!Number.isSafeInteger(value.value)) {
    throw new CipherDiagnostic('cipher.invalid-key', 'Cipher keys must be safe integers.', { reason: 'unsafe' })
  }
}

const modulo = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus
const multiplyModulo = (left: number, right: number, modulus: number): number =>
  Number((BigInt(left) * BigInt(right)) % BigInt(modulus))

const cipherText = (
  text: AlphabetTextValue,
  key: (position: number) => number,
  policy: AlphabetPolicyValue,
  mappings: ReadonlyMap<string, AlphabetMapping>,
): AlphabetTextValue => {
  const mapping = mappings.get(text.type.mapping)
  if (!mapping) throw new CipherDiagnostic('cipher.invalid-mapping', 'Cipher text references an unknown alphabet mapping.', { mapping: text.type.mapping })
  const positions = new Map(mapping.symbols.map((symbol, position) => [symbol, position]))
  const symbols = text.symbols.map((symbol, index) => {
    const position = positions.get(symbol)
    if (position === undefined) {
      if (policy.value === 'strict') {
        throw new CipherDiagnostic('cipher.unmapped-symbol', 'Strict alphabet policy rejects symbols outside the mapping.', {
          symbol,
          index,
          strict: true,
        })
      }
      return symbol
    }
    return mapping.symbols[key(position)]
  })
  return { type: { family: 'alphabet-text', mapping: text.type.mapping }, symbols }
}

const caesar: Operation = {
  manifest: {
    identity: 'classical.caesar@1',
    inputs: [
      { name: 'text', type: { family: 'alphabet-text', mapping: '*' } },
      { name: 'shift', type: { family: 'integer', signed: true, safe: true } },
      { name: 'policy', type: { family: 'alphabet-policy' } },
    ],
    outputs: [{ name: 'text', type: { family: 'alphabet-text', mapping: '*' } }],
  },
  execute(inputs, _, mappings) {
    const text = inputs.text as AlphabetTextValue
    const shift = inputs.shift as IntegerValue
    const policy = inputs.policy as AlphabetPolicyValue
    validKey(shift)
    const modulus = mappings.get(text.type.mapping)?.symbols.length
    if (!modulus) throw new CipherDiagnostic('cipher.invalid-mapping', 'Cipher text references an unknown alphabet mapping.', { mapping: text.type.mapping })
    const normalizedShift = modulo(shift.value, modulus)
    return { text: cipherText(text, (position) => modulo(position + normalizedShift, modulus), policy, mappings) }
  },
}

const affine: Operation = {
  manifest: {
    identity: 'classical.affine@1',
    inputs: [
      { name: 'text', type: { family: 'alphabet-text', mapping: '*' } },
      { name: 'a', type: { family: 'integer', signed: true, safe: true } },
      { name: 'b', type: { family: 'integer', signed: true, safe: true } },
      { name: 'policy', type: { family: 'alphabet-policy' } },
    ],
    outputs: [{ name: 'text', type: { family: 'alphabet-text', mapping: '*' } }],
  },
  execute(inputs, _, mappings) {
    const text = inputs.text as AlphabetTextValue
    const a = inputs.a as IntegerValue
    const b = inputs.b as IntegerValue
    const policy = inputs.policy as AlphabetPolicyValue
    validKey(a)
    validKey(b)
    const modulus = mappings.get(text.type.mapping)?.symbols.length
    if (!modulus) throw new CipherDiagnostic('cipher.invalid-mapping', 'Cipher text references an unknown alphabet mapping.', { mapping: text.type.mapping })
    const normalizedA = modulo(a.value, modulus)
    const gcd = (left: number, right: number): number => right === 0 ? left : gcd(right, left % right)
    if (gcd(normalizedA, modulus) !== 1) {
      throw new CipherDiagnostic('cipher.invalid-affine-key', 'Affine key a must be coprime to the alphabet size.', {
        a: normalizedA,
        modulus,
      })
    }
    const normalizedB = modulo(b.value, modulus)
    return { text: cipherText(text, (position) => modulo(multiplyModulo(normalizedA, position, modulus) + normalizedB, modulus), policy, mappings) }
  },
}

// FIPS-197 Figure 7 S-box, reused by SubWord.
const aesSBox: readonly number[] = [
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
]

// FIPS-197 Rcon, generated by GF(2^8) doubling (xtime) from Rcon[1] = 0x01.
const xtime = (value: number): number => ((value << 1) ^ (value & 0x80 ? 0x1b : 0)) & 0xff
const aesRcon: readonly number[] = (() => {
  const table = [0x01]
  while (table.length < 15) table.push(xtime(table[table.length - 1]))
  return table
})()

const aesKeyWord: Operation = {
  manifest: {
    identity: 'aes.key-word@1',
    inputs: [{ name: 'key', type: { family: 'bits', size: 'N' } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
  },
  validateParameters(parameters, node) {
    return Number.isSafeInteger(parameters.index) && (parameters.index as number) >= 0
      ? []
      : [diagnostic('aes.invalid-key-word-index', 'Key word index must be a non-negative integer.', `${node.id}.parameters.index`, node)]
  },
  execute(inputs, parameters) {
    const key = inputs.key as BitsValue
    const index = parameters.index as number
    const offset = index * 4
    if (offset + 4 > key.bytes.length) {
      throw new CipherDiagnostic('aes.key-word-out-of-range', 'Key word index exceeds the key length.', { index, keyBytes: key.bytes.length })
    }
    return { value: bits(32, key.bytes.slice(offset, offset + 4)) }
  },
}

const aesRotWord: Operation = {
  manifest: {
    identity: 'aes.rot-word@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
  },
  execute(inputs) {
    const value = (inputs.value as BitsValue).bytes
    return { value: bits(32, Uint8Array.of(value[1], value[2], value[3], value[0])) }
  },
}

const aesSubWord: Operation = {
  manifest: {
    identity: 'aes.sub-word@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
  },
  execute(inputs) {
    const value = inputs.value as BitsValue
    return { value: bits(32, value.bytes.map((byte) => aesSBox[byte])) }
  },
}

const aesRconWord: Operation = {
  manifest: {
    identity: 'aes.rcon-word@1',
    inputs: [],
    outputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
  },
  validateParameters(parameters, node) {
    return Number.isSafeInteger(parameters.round) && (parameters.round as number) >= 1 && (parameters.round as number) <= aesRcon.length
      ? []
      : [diagnostic('aes.invalid-rcon-round', 'Rcon round must be a positive integer within the supported range.', `${node.id}.parameters.round`, node, { maximum: aesRcon.length })]
  },
  execute(_inputs, parameters) {
    return { value: bits(32, Uint8Array.of(aesRcon[(parameters.round as number) - 1], 0, 0, 0)) }
  },
}

// Fixed 32-bit XOR for AES word combination. `core.xor@1`'s width is resolved by forwarding
// to an upstream `core.source@1`; AES words are produced by chains of AES-specific operations
// that hack does not walk, so word combination uses its own fixed-width primitive instead.
const aesWordXor: Operation = {
  manifest: {
    identity: 'aes.word-xor@1',
    inputs: [{ name: 'left', type: { family: 'bits', size: 32 } }, { name: 'right', type: { family: 'bits', size: 32 } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
  },
  execute(inputs) {
    const left = inputs.left as BitsValue
    const right = inputs.right as BitsValue
    return { value: bits(32, left.bytes.map((byte, index) => byte ^ right.bytes[index])) }
  },
}

const aesRoundKey: Operation = {
  manifest: {
    identity: 'aes.round-key@1',
    inputs: [
      { name: 'w0', type: { family: 'bits', size: 32 } },
      { name: 'w1', type: { family: 'bits', size: 32 } },
      { name: 'w2', type: { family: 'bits', size: 32 } },
      { name: 'w3', type: { family: 'bits', size: 32 } },
    ],
    outputs: [{ name: 'value', type: { family: 'bits', size: 128 } }],
  },
  execute(inputs) {
    const words = (['w0', 'w1', 'w2', 'w3'] as const).flatMap((name) => [...(inputs[name] as BitsValue).bytes])
    return { value: bits(128, Uint8Array.from(words)) }
  },
}

const throwing: Operation = {
  manifest: { identity: 'test.throw@1', inputs: [], outputs: [{ name: 'value', type: { family: 'bits', size: 8 } }] },
  execute() {
    throw new Error('synthetic failure')
  },
}

const operations = new Map<string, Operation>([
  source, xor, substitute, permute, output, caesar, affine,
  aesKeyWord, aesRotWord, aesSubWord, aesRconWord, aesWordXor, aesRoundKey,
  throwing,
].map((operation) => [operation.manifest.identity, operation]))

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

const expandGraph = (graph: AuthoredGraph, diagnostics: Diagnostic[]): AuthoredGraph => {
  const nodes: AuthoredNode[] = []
  const aliases = new Map<string, Map<string, AuthoredInput>>()
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
        if (Array.isArray(parameters.roundKeys)) {
          parameters.value = parameters.roundKeys[index]
          delete parameters.roundKeys
        }
        const inputs = Object.fromEntries(Object.entries(inner.inputs ?? {}).flatMap(([name, input]) => {
          if (input.node === '@input') {
            const bound = node.inputs?.[input.port]
            if (!bound) diagnostics.push(diagnostic('graph.structural-mismatch', 'Subgraph input is not declared by repeated node.', `${node.id}.inputs.${input.port}`, node))
            return bound ? [[name, bound]] : []
          }
          if (input.node === '@previous') {
            const bound = previous.get(input.port)
            if (!bound) diagnostics.push(diagnostic('graph.structural-mismatch', 'Previous round output is not declared by subgraph.', `${node.id}.repeat.${input.port}`, node))
            return bound ? [[name, bound]] : []
          }
          return [[name, { node: `${prefix}/${input.node}`, port: input.port }]]
        }))
        nodes.push({ ...inner, id: `${prefix}/${inner.id}`, inputs, parameters })
      }
      if (!subgraph.outputs.length) {
        diagnostics.push(diagnostic('graph.structural-mismatch', 'Repeated subgraph needs an output.', `${node.id}.repeat.subgraph`, node))
        continue
      }
      previous = new Map(subgraph.outputs.map((output) => [output.name, { node: `${prefix}/${output.name}`, port: 'value' }]))
    }
    aliases.set(node.id, previous)
  }
  const resolve = (input: AuthoredInput): AuthoredInput => aliases.get(input.node)?.get(input.port) ?? input
  return {
    ...graph,
    nodes: nodes.map((node) => ({
      ...node,
      inputs: Object.fromEntries(Object.entries(node.inputs ?? {}).map(([name, input]) => [name, resolve(input)])),
    })),
    outputs: graph.outputs.map(resolve),
  }
}

export const compile = (graph: AuthoredGraph): Result<CompiledGraph> => {
  const diagnostics: Diagnostic[] = []
  if (graph.traceLevel !== undefined && !['summary', 'round', 'detail'].includes(graph.traceLevel)) {
    diagnostics.push(diagnostic('trace.unsupported-level', 'Trace level is not supported.', 'traceLevel'))
  }
  const compiledGraph = structuredClone(expandGraph(graph, diagnostics))
  const nodes = new Map<string, AuthoredNode>()
  const resolved = new Map<string, Operation>()
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
    else resolved.set(node.id, operation)
  }

  for (const node of compiledGraph.nodes) {
    const operation = resolved.get(node.id)
    if (!operation) continue
    const params = node.parameters ?? {}
    diagnostics.push(...(operation.validateParameters?.(params, node) ?? []))
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
      const outputTypeParameter = upstreamOperation?.manifest.outputTypeParameter
      const forwardedInput = upstreamOperation?.manifest.identity === 'core.xor@1'
        ? upstream?.inputs?.left
        : upstreamOperation?.manifest.identity === 'core.output@1'
          ? upstream?.inputs?.value
          : upstreamOperation?.manifest.identity === 'classical.caesar@1' || upstreamOperation?.manifest.identity === 'classical.affine@1'
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
  if (diagnostics.length) return { ok: false, diagnostics }

  return {
    ok: true,
    value: {
      graph: compiledGraph,
      execute(executionInputs = {}, traceLimits?: TraceCollectionLimits) {
        const values = new Map<string, Record<string, CryptoValue>>()
        const trace: (TraceCheckpoint | TraceEvent)[] = []
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
            if (node.operation === 'core.source@1' && executionInputs[`${id}.value`]) parameters.value = executionInputs[`${id}.value`]
            const inputs: Record<string, CryptoValue> = {}
            for (const [name, ref] of Object.entries(node.inputs ?? {})) inputs[name] = values.get(ref.node)![ref.port]
            if (node.operation === 'core.source@1') {
              const value = parameters.value as CryptoValue | undefined
              if (!value) return { ok: false, diagnostics: [diagnostic('missing-execution-input', 'Source needs an execution input.', `${id}.value`, node)] }
              if (!isCryptoValue(value) || !isPortType(parameters.type) || !typeMatches(parameters.type, actualType(value), new Map())) {
                return { ok: false, diagnostics: [diagnostic('invalid-execution-input', 'Execution input does not match source type.', `${id}.value`, node)] }
              }
              if ('symbol' in value && !mappings.get(value.type.mapping)?.symbols.includes(value.symbol)) {
                return { ok: false, diagnostics: [diagnostic('invalid-execution-input', 'Alphabet symbol is not in declared mapping.', `${id}.value`, node)] }
              }
            }
            let result: Record<string, CryptoValue>
            try {
              result = operation.execute(inputs, parameters, mappings)
            } catch (error) {
              return { ok: false, diagnostics: [error instanceof CipherDiagnostic
                ? diagnostic(error.code, error.message, id, node, error.details)
                : diagnostic('operation-failed', 'Operation execution failed.', id, node)] }
            }
            for (const [port, value] of Object.entries(result)) {
              if (!validSizedValue(value)) return { ok: false, diagnostics: [diagnostic('invalid-value', 'Operation returned an invalid value.', `${id}.${port}`, node)] }
            }
            values.set(id, result)
            const roundStage = /^(.*)\.(\d+)\/(key-mix|substitute|permute)$/.exec(id)
            const roundKey = /^(.*)\.(\d+)\/key$/.exec(id)
            if (compiledGraph.traceLevel === 'detail' && node.operation === 'core.source@1' && (id === 'plaintext' || id === 'state')) {
              appendTrace({ path: 'plaintext', level: 'detail', stage: 'input', value: cloneValue(result.value) })
            } else if (compiledGraph.traceLevel === 'detail' && roundKey) {
              appendTrace({ path: `${roundKey[1]}.${roundKey[2]}/key`, level: 'detail', round: Number(roundKey[2]), stage: 'round-key', value: cloneValue(result.value) })
            } else if (roundStage) {
              const instance = roundStage[1]
              const round = Number(roundStage[2])
              const stage = roundStage[3] as 'key-mix' | 'substitute' | 'permute'
              const value = cloneValue(result.value)
              const traceOperation = stage === 'substitute'
                ? { sBox: [...parameters.sBox as readonly number[]] }
                : stage === 'permute'
                  ? { permutation: [...parameters.permutation as readonly number[]] }
                  : undefined
              if (compiledGraph.traceLevel === 'detail') appendTrace({
                path: `${instance}.${round}/${stage}`,
                level: 'detail',
                round,
                stage,
                ...(traceOperation ? { operation: traceOperation } : {}),
                value,
              })
              if (stage === 'permute' && (compiledGraph.traceLevel === 'detail' || compiledGraph.traceLevel === 'round')) {
                appendTrace({ path: `${instance}.${round}/output`, level: 'round', round, stage: 'output', value: cloneValue(result.value) })
              }
            } else if (compiledGraph.traceLevel === 'detail' && node.operation === 'aes.key-word@1' && /^word-\d+$/.test(id)) {
              const wordIndex = Number(/^word-(\d+)$/.exec(id)![1])
              appendTrace({ path: id, level: 'detail', round: Math.floor(wordIndex / 4), stage: 'input', value: cloneValue(result.value) })
            } else if (compiledGraph.traceLevel === 'detail' && /^word-\d+-(rot|sub|rcon|temp)$/.test(id)) {
              const [, wordIndex, stageToken] = /^word-(\d+)-(rot|sub|rcon|temp)$/.exec(id)!
              const aesStage = { rot: 'rot-word', sub: 'sub-word', rcon: 'rcon', temp: 'word-xor' }[stageToken as 'rot' | 'sub' | 'rcon' | 'temp'] as TraceStage
              appendTrace({ path: id, level: 'detail', round: Math.floor(Number(wordIndex) / 4), stage: aesStage, value: cloneValue(result.value) })
            } else if (compiledGraph.traceLevel === 'detail' && /^word-\d+$/.test(id)) {
              const wordIndex = Number(/^word-(\d+)$/.exec(id)![1])
              appendTrace({ path: id, level: 'detail', round: Math.floor(wordIndex / 4), stage: 'word-xor', value: cloneValue(result.value) })
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
        const snapshot = { outputs, trace }
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
  if (isIntegerValue(value)) return 8
  if (isAlphabetPolicyValue(value)) return 1
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
