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

export type CryptoValue = BitsValue | BytesValue | WordsValue | AlphabetSymbolValue

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
  operation: string
  inputs?: Record<string, AuthoredInput>
  parameters?: Record<string, unknown>
  origin?: SourceOrigin
}

export type AuthoredGraph = {
  nodes: readonly AuthoredNode[]
  outputs: readonly AuthoredInput[]
  alphabetMappings?: readonly AlphabetMapping[]
}

export type TraceCheckpoint = {
  readonly path: string
  readonly stage: 'output'
  readonly summary: string
}

export type ExecutionSnapshot = {
  readonly outputs: Readonly<Record<string, CryptoValue>>
  readonly trace: readonly TraceCheckpoint[]
}

type Result<T> = { ok: true; value: T } | { ok: false; diagnostics: readonly Diagnostic[] }

type Operation = {
  manifest: OperationManifest
  validateParameters?: (parameters: Record<string, unknown>, node: AuthoredNode) => Diagnostic[]
  execute: (inputs: Record<string, CryptoValue>, parameters: Record<string, unknown>) => Record<string, CryptoValue>
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

const cloneValue = (value: CryptoValue): CryptoValue => {
  if ('symbol' in value) return { type: { family: 'alphabet-symbol', mapping: value.type.mapping }, symbol: value.symbol }
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
  if (expected.family === 'words' && actual.family === 'words' && expected.wordSize !== actual.wordSize) return false
  if (expected.family === 'alphabet-symbol' || actual.family === 'alphabet-symbol') return false
  const actualSize = actual.size as number
  if (typeof expected.size === 'number') return expected.size === actualSize
  const bound = bindings.get(expected.size)
  if (bound === undefined) {
    bindings.set(expected.size, actualSize)
    return true
  }
  return bound === actualSize
}

const typeText = (type: PortType): string => {
  if (type.family === 'alphabet-symbol') return `alphabet-symbol<${type.mapping}>`
  if (type.family === 'words') return `words<${type.size},u8>`
  return `${type.family}<${type.size}>`
}

const isPortType = (value: unknown): value is PortType => {
  if (typeof value !== 'object' || value === null) return false
  const type = value as Record<string, unknown>
  if (type.family === 'alphabet-symbol') return typeof type.mapping === 'string'
  if ((type.family === 'bits' || type.family === 'bytes') && (typeof type.size === 'number' || typeof type.size === 'string')) return true
  return type.family === 'words' && (typeof type.size === 'number' || typeof type.size === 'string') && type.wordSize === 8
}

const isCryptoValue = (value: unknown): value is CryptoValue =>
  typeof value === 'object' && value !== null && 'type' in value && isPortType((value as { type: unknown }).type)

const bytesForBits = (size: number) => Math.ceil(size / 8)

const validSizedValue = (value: CryptoValue): boolean => {
  if ('symbol' in value) return true
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

export const hex = (value: BitsValue | BytesValue): string =>
  `0x${[...value.bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(-(value.type.family === 'bits' ? Math.ceil(value.type.size / 4) : value.type.size * 2))}`

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

const output: Operation = {
  manifest: { identity: 'core.output@1', inputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }], outputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }] },
  execute(inputs) {
    return { value: cloneValue(inputs.value) }
  },
}

const throwing: Operation = {
  manifest: { identity: 'test.throw@1', inputs: [], outputs: [{ name: 'value', type: { family: 'bits', size: 8 } }] },
  execute() {
    throw new Error('synthetic failure')
  },
}

const operations = new Map<string, Operation>([source, xor, output, throwing].map((operation) => [operation.manifest.identity, operation]))

export const operationManifests: readonly OperationManifest[] = [...operations.values()]
  .filter((operation) => !operation.manifest.identity.startsWith('test.'))
  .map((operation) => operation.manifest)

export const compile = (graph: AuthoredGraph): Result<CompiledGraph> => {
  const compiledGraph = structuredClone(graph)
  const diagnostics: Diagnostic[] = []
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
    const operation = operations.get(node.operation)
    if (!operation) diagnostics.push(diagnostic('unknown-operation', 'Operation is not registered.', `${node.id}.operation`, node, { operation: node.operation }))
    else resolved.set(node.id, operation)
  }

  for (const node of compiledGraph.nodes) {
    const operation = resolved.get(node.id)
    if (!operation) continue
    const params = node.parameters ?? {}
    diagnostics.push(...(operation.validateParameters?.(params, node) ?? []))
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
      const upstreamType = outputTypeParameter && isPortType(upstream?.parameters?.[outputTypeParameter])
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
      execute(executionInputs = {}) {
        const values = new Map<string, Record<string, CryptoValue>>()
        const trace: TraceCheckpoint[] = []
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
              result = operation.execute(inputs, parameters)
            } catch {
              return { ok: false, diagnostics: [diagnostic('operation-failed', 'Operation execution failed.', id, node)] }
            }
            for (const [port, value] of Object.entries(result)) {
              if (!validSizedValue(value)) return { ok: false, diagnostics: [diagnostic('invalid-value', 'Operation returned an invalid value.', `${id}.${port}`, node)] }
            }
            values.set(id, result)
            for (const port of Object.keys(result)) trace.push({ path: `${id}.${port}`, stage: 'output', summary: `${id}.${port}` })
        }
        const outputs: Record<string, CryptoValue> = {}
        for (const ref of compiledGraph.outputs) outputs[`${ref.node}.${ref.port}`] = cloneValue(values.get(ref.node)![ref.port])
        return { ok: true, value: { outputs, trace } }
      },
    },
  }
}
