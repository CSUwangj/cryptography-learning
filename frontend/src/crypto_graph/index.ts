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

export type TraceEvent = {
  readonly path: string
  readonly level: TraceLevel
  readonly round?: number
  readonly stage?: 'key-mix' | 'substitute' | 'permute' | 'output'
  readonly value?: CryptoValue
}

export type SerializedTraceEvent = Omit<TraceEvent, 'value'> & {
  readonly value?: { readonly type: CryptoValue['type']; readonly hex: string }
}

export type ExecutionSnapshot = {
  readonly outputs: Readonly<Record<string, CryptoValue>>
  readonly trace: readonly (TraceCheckpoint | TraceEvent)[]
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

const throwing: Operation = {
  manifest: { identity: 'test.throw@1', inputs: [], outputs: [{ name: 'value', type: { family: 'bits', size: 8 } }] },
  execute() {
    throw new Error('synthetic failure')
  },
}

const operations = new Map<string, Operation>([source, xor, substitute, permute, output, throwing].map((operation) => [operation.manifest.identity, operation]))

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
      const xorInput = upstreamOperation?.manifest.identity === 'core.xor@1' ? upstream?.inputs?.left : undefined
      const xorSource = xorInput && nodes.get(xorInput.node)
      const xorSourceOperation = xorSource && resolved.get(xorSource.id)
      const xorSourceType = xorSource?.parameters?.type
      const xorInputPort = xorSourceOperation?.manifest.outputs.find((candidate) => candidate.name === xorInput?.port)
      const inferredXorType = xorSourceOperation?.manifest.identity === 'core.source@1' && isPortType(xorSourceType)
        ? xorSourceType
        : xorInputPort?.type
      const upstreamType = inferredXorType
        ? inferredXorType
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
      execute(executionInputs = {}) {
        const values = new Map<string, Record<string, CryptoValue>>()
        const trace: (TraceCheckpoint | TraceEvent)[] = []
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
            const roundStage = /^round\.(\d+)\/(key-mix|substitute|permute)$/.exec(id)
            if (roundStage) {
              const round = Number(roundStage[1])
              const stage = roundStage[2] as 'key-mix' | 'substitute' | 'permute'
              const value = cloneValue(result.value)
              trace.push({ path: `round.${round}/${stage}`, level: 'detail', round, stage, value })
              if (stage === 'permute') trace.push({ path: `round.${round}/output`, level: 'round', round, stage: 'output', value: cloneValue(result.value) })
            } else if (compiledGraph.traceLevel === undefined) {
              for (const port of Object.keys(result)) trace.push({ path: `${id}.${port}`, stage: 'output', summary: `${id}.${port}` })
            }
        }
        const outputs: Record<string, CryptoValue> = {}
        for (const ref of compiledGraph.outputs) outputs[`${ref.node}.${ref.port}`] = cloneValue(values.get(ref.node)![ref.port])
        if (compiledGraph.traceLevel !== undefined) {
          const output = Object.values(outputs)[0]
          trace.push({ path: 'output', level: 'summary', stage: 'output', value: cloneValue(output) })
          const level = compiledGraph.traceLevel
          const selected = trace.filter((event) => {
            if (!('level' in event)) return false
            return level === 'detail' || (level === 'round' && event.level !== 'detail') || (level === 'summary' && event.level === 'summary')
          })
          return { ok: true, value: { outputs, trace: selected } }
        }
        return { ok: true, value: { outputs, trace } }
      },
    },
  }
}
