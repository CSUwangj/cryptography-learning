import { LineCounter, isAlias, isMap, isScalar, isSeq, parseDocument, type Node } from 'yaml'
import {
  bits,
  bytes,
  compile,
  maxWorkerLimits,
  operationManifests,
  words,
  type AuthoredGraph,
  type CompiledGraph,
  type CryptoValue,
  type Diagnostic,
  type PortType,
  type SourceOrigin,
  type WorkerLimits,
} from '../crypto_graph'
import { validateLessonMarkdown } from './markdown'

export type Result<T> = { ok: true; value: T } | { ok: false; diagnostics: readonly Diagnostic[] }

export type LessonDocuments = {
  readonly lesson: string
  readonly locales: Readonly<Record<string, string>>
}

export type VisualizerDescriptor = {
  readonly id: string
  readonly inputSlots: Readonly<Record<string, PortType>>
  readonly traceLevels: readonly ('summary' | 'round' | 'detail')[]
  readonly tracePaths: readonly string[]
  readonly options?: Readonly<Record<string, 'string' | 'number' | 'boolean'>>
  readonly major?: number
  readonly slots?: Readonly<Record<string, { readonly family: string }>>
  readonly trace?: { readonly family: 'comparison'; readonly level: 'detail' }
  readonly limits?: { readonly bits: number }
  readonly dimensions?: { readonly minWidth: number; readonly minHeight: number }
  readonly accessibility?: { readonly summary: string }
}

export type VisualizerCatalog = {
  readonly get: (id: string) => VisualizerDescriptor | undefined
}

export type LessonValueReference =
  | { readonly input: string }
  | { readonly constant: string }
  | { readonly step: string; readonly output: string }

export type LessonCheck =
  | {
    readonly kind: 'equal'
    readonly actual: LessonValueReference
    readonly expected: LessonValueReference
    readonly feedback: { readonly match: string; readonly mismatch: string }
  }
  | {
    readonly kind: 'choice'
    readonly options: readonly { readonly id: string; readonly label: string; readonly feedback: string }[]
    readonly correct: string
  }

export type LessonComparisonBinding = {
  readonly baseline: LessonValueReference
  readonly changed: LessonValueReference
}

export type LessonComparison = {
  readonly kind: 'avalanche' | 'generic'
  readonly graph: string
  readonly bindings: Readonly<Record<string, LessonComparisonBinding>>
  readonly traceLevel: 'detail'
}

export type CompiledStep = {
  readonly id: string
  readonly prose?: string
  readonly inputs?: readonly { readonly input: string; readonly prompt: string }[]
  readonly execute?: { readonly graph: string; readonly bindings: Readonly<Record<string, LessonValueReference>> }
  readonly visualizer?: {
    readonly id: string
    readonly bindings?: Readonly<Record<string, unknown>>
    readonly compare?: LessonComparison
    readonly options: unknown
  }
  readonly acceptedErrorCodes?: readonly string[]
  readonly check?: LessonCheck
}

export type CompiledLesson = {
  readonly id: string
  readonly defaultLocale: string
  readonly inputs: Readonly<Record<string, { readonly type: PortType; readonly encoding: string; readonly default: CryptoValue }>>
  readonly constants: Readonly<Record<string, CryptoValue>>
  readonly graphs: Readonly<Record<string, CompiledGraph>>
  readonly steps: readonly CompiledStep[]
  readonly locales: Readonly<Record<string, { readonly title: string; readonly summary: string; readonly texts: Readonly<Record<string, string>> }>>
  readonly limits?: WorkerLimits
}

type ParsedYaml = {
  readonly value: unknown
  readonly spans: ReadonlyMap<string, SourceOrigin>
}

const identifier = /^[a-z][a-z0-9_-]*$/
const fields = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined

const diagnostic = (
  code: string,
  message: string,
  path: string,
  span?: SourceOrigin,
  details: Diagnostic['details'] = {},
): Diagnostic => ({ code, message, path, ...(span ? { span } : {}), details })

const spanAt = (file: string, node: Node | null, lineCounter: LineCounter): SourceOrigin | undefined => {
  if (!node?.range) return undefined
  const position = lineCounter.linePos(node.range[0])
  return position.line ? { file, line: position.line, column: position.col } : undefined
}

const collectSpans = (
  file: string,
  node: Node | null,
  path: string,
  counter: LineCounter,
  spans: Map<string, SourceOrigin>,
): void => {
  const span = spanAt(file, node, counter)
  if (span) spans.set(path, span)
  if (isMap(node)) {
    for (const pair of node.items) {
      const key = isScalar(pair.key) && typeof pair.key.value === 'string' ? pair.key.value : undefined
      if (key !== undefined) collectSpans(file, pair.value as Node | null, path ? `${path}.${key}` : key, counter, spans)
    }
  } else if (isSeq(node)) {
    for (const [index, item] of node.items.entries()) collectSpans(file, item as Node | null, path ? `${path}.${index}` : String(index), counter, spans)
  }
}

const restrictions = (file: string, node: Node | null, counter: LineCounter, diagnostics: Diagnostic[]): void => {
  if (!node) return
  const tagged = node as Node & { anchor?: string; tag?: string }
  if (isAlias(node) || tagged.anchor || (tagged.tag !== undefined && !tagged.tag.startsWith('tag:yaml.org,2002:'))) {
    diagnostics.push(diagnostic('lesson.yaml-restriction', 'Anchors, aliases, and custom tags are not supported.', '', spanAt(file, node, counter)))
  }
  if (isMap(node)) {
    for (const pair of node.items) {
      if (isScalar(pair.key) && pair.key.value === '<<') {
        diagnostics.push(diagnostic('lesson.yaml-restriction', 'YAML merge keys are not supported.', '', spanAt(file, pair.key as Node | null, counter)))
      }
      restrictions(file, pair.key as Node | null, counter, diagnostics)
      restrictions(file, pair.value as Node | null, counter, diagnostics)
    }
  } else if (isSeq(node)) {
    for (const item of node.items) restrictions(file, item as Node | null, counter, diagnostics)
  }
}

const parseYaml = (file: string, source: string): Result<ParsedYaml> => {
  const counter = new LineCounter()
  const document = parseDocument(source, {
    version: '1.2',
    schema: 'core',
    merge: false,
    strict: true,
    uniqueKeys: true,
    stringKeys: true,
    lineCounter: counter,
    prettyErrors: false,
  })
  const diagnostics: Diagnostic[] = document.errors.map((error) => {
    const offset = error.pos?.[0]
    const position = typeof offset === 'number' ? counter.linePos(offset) : undefined
    return diagnostic('lesson.yaml-syntax', 'Invalid YAML document.', '', position?.line ? { file, line: position.line, column: position.col } : undefined)
  })
  restrictions(file, document.contents, counter, diagnostics)
  if (diagnostics.length) return { ok: false, diagnostics }
  const spans = new Map<string, SourceOrigin>()
  collectSpans(file, document.contents, '', counter, spans)
  return { ok: true, value: { value: document.toJS({ maxAliasCount: 0 }), spans } }
}

/** Read the fallback locale with the same strict YAML parser as compilation. */
export const lessonDefaultLocale = (source: string): string | undefined => {
  const parsed = parseYaml('lesson.yaml', source)
  if (!parsed.ok) return undefined
  const root = fields(parsed.value.value)
  return typeof root?.default_locale === 'string' ? root.default_locale : undefined
}

const checkFields = (
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  spans: ReadonlyMap<string, SourceOrigin>,
  diagnostics: Diagnostic[],
): void => {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) diagnostics.push(diagnostic('lesson.unknown-field', 'Field is not supported.', path ? `${path}.${key}` : key, spans.get(path ? `${path}.${key}` : key), { field: key }))
  }
}

const requireMap = (
  value: unknown,
  path: string,
  spans: ReadonlyMap<string, SourceOrigin>,
  diagnostics: Diagnostic[],
): Record<string, unknown> | undefined => {
  const map = fields(value)
  if (!map) diagnostics.push(diagnostic('lesson.invalid-input', 'Expected a mapping.', path, spans.get(path)))
  return map
}

const typeAt = (
  value: unknown,
  path: string,
  spans: ReadonlyMap<string, SourceOrigin>,
  diagnostics: Diagnostic[],
): PortType | undefined => {
  const type = requireMap(value, path, spans, diagnostics)
  if (!type) return undefined
  const family = type.family
  if (family === 'alphabet-symbol') {
    checkFields(type, ['family', 'mapping'], path, spans, diagnostics)
    if (typeof type.mapping === 'string' && identifier.test(type.mapping)) return { family, mapping: type.mapping }
  } else if (family === 'bits' || family === 'bytes') {
    checkFields(type, ['family', 'size'], path, spans, diagnostics)
    if (Number.isSafeInteger(type.size) && (type.size as number) > 0) return { family, size: type.size as number }
  } else if (family === 'words') {
    checkFields(type, ['family', 'size', 'wordSize'], path, spans, diagnostics)
    if (Number.isSafeInteger(type.size) && (type.size as number) > 0 && type.wordSize === 8) return { family, size: type.size as number, wordSize: 8 }
  }
  diagnostics.push(diagnostic('lesson.invalid-input', 'Invalid CryptoGraph type.', path, spans.get(path)))
  return undefined
}

const decodeValue = (
  value: unknown,
  type: PortType,
  encoding: unknown,
  path: string,
  spans: ReadonlyMap<string, SourceOrigin>,
  diagnostics: Diagnostic[],
): CryptoValue | undefined => {
  if (type.family === 'alphabet-symbol') {
    if (encoding === 'literal' && typeof value === 'string' && [...value].length === 1) return { type, symbol: value }
  } else if (encoding === 'hex' && typeof value === 'string' && /^0x[0-9A-Fa-f]+$/.test(value)) {
    const hex = value.slice(2)
    const digits = type.family === 'bits' ? Math.ceil((type.size as number) / 4) : (type.size as number) * 2
    if (hex.length === digits) {
      const packed = Uint8Array.from((hex.length % 2 ? `0${hex}` : hex).match(/../g)!.map((byte) => Number.parseInt(byte, 16)))
      if (type.family === 'bits') {
        const size = type.size as number
        if (size % 8 === 0 || packed[0] < 2 ** (size % 8)) return bits(size, packed)
      } else if (type.family === 'bytes') return bytes(type.size as number, packed)
      else return words(type.size as number, packed)
    }
  }
  diagnostics.push(diagnostic('lesson.invalid-input', 'Value does not match its declared type and encoding.', path, spans.get(path)))
  return undefined
}

export const decodeLessonValue = (type: PortType, encoding: string, value: unknown): Result<CryptoValue> => {
  const diagnostics: Diagnostic[] = []
  const decoded = decodeValue(value, type, encoding, 'input', new Map(), diagnostics)
  return decoded ? { ok: true, value: decoded } : { ok: false, diagnostics }
}

const equalTypes = (left: PortType, right: PortType): boolean => JSON.stringify(left) === JSON.stringify(right)

export const equalCryptoValues = (left: CryptoValue, right: CryptoValue): boolean =>
  equalTypes(left.type, right.type)
  && ('symbol' in left && 'symbol' in right
    ? left.symbol === right.symbol
    : !('symbol' in left) && !('symbol' in right) && [...('words' in left ? left.words : left.bytes)].every((value, index) =>
      value === ('words' in right ? right.words : right.bytes)[index]))

const validateReference = (
  value: unknown,
  path: string,
  spans: ReadonlyMap<string, SourceOrigin>,
  diagnostics: Diagnostic[],
): void => {
  const reference = requireMap(value, path, spans, diagnostics)
  if (!reference) return
  checkFields(reference, ['node', 'port'], path, spans, diagnostics)
  if (typeof reference.node !== 'string' || typeof reference.port !== 'string') {
    diagnostics.push(diagnostic('lesson.invalid-input', 'Graph reference requires node and port IDs.', path, spans.get(path)))
  }
}

const validateGraphNode = (
  raw: unknown,
  path: string,
  spans: ReadonlyMap<string, SourceOrigin>,
  diagnostics: Diagnostic[],
): Record<string, unknown> | undefined => {
  const node = requireMap(raw, path, spans, diagnostics)
  if (!node) return undefined
  checkFields(node, ['id', 'operation', 'repeat', 'inputs', 'parameters'], path, spans, diagnostics)
  if (typeof node.id !== 'string' || !identifier.test(node.id)) diagnostics.push(diagnostic('lesson.invalid-input', 'Node ID is invalid.', `${path}.id`, spans.get(`${path}.id`)))
  if (node.inputs !== undefined) {
    const inputs = requireMap(node.inputs, `${path}.inputs`, spans, diagnostics)
    for (const [name, reference] of Object.entries(inputs ?? {})) validateReference(reference, `${path}.inputs.${name}`, spans, diagnostics)
  }
  if (node.repeat !== undefined) {
    const repeat = requireMap(node.repeat, `${path}.repeat`, spans, diagnostics)
    if (repeat) {
      checkFields(repeat, ['subgraph', 'count'], `${path}.repeat`, spans, diagnostics)
      if (typeof repeat.subgraph !== 'string') diagnostics.push(diagnostic('lesson.invalid-input', 'Repeated graph needs a subgraph ID.', `${path}.repeat.subgraph`, spans.get(`${path}.repeat.subgraph`)))
    }
  }
  if (node.parameters !== undefined) {
    const parameters = requireMap(node.parameters, `${path}.parameters`, spans, diagnostics)
    const allowed = node.operation === 'core.source@1' ? ['type', 'value', 'roundKeys']
      : node.operation === 'spn.substitute@1' ? ['sBox']
      : node.operation === 'spn.permute@1' ? ['permutation']
      : node.operation === 'core.xor@1' || node.operation === 'core.output@1' ? []
      : undefined
    if (parameters && allowed) checkFields(parameters, allowed, `${path}.parameters`, spans, diagnostics)
  }
  return node
}

type GraphInfo = {
  readonly graph: CompiledGraph
  readonly sourceTypes: Readonly<Record<string, PortType>>
  readonly outputTypes: Readonly<Record<string, PortType>>
  readonly traceLevel?: 'summary' | 'round' | 'detail'
}

const compileGraph = (
  id: string,
  raw: unknown,
  path: string,
  spans: ReadonlyMap<string, SourceOrigin>,
  diagnostics: Diagnostic[],
): GraphInfo | undefined => {
  const graph = requireMap(raw, path, spans, diagnostics)
  if (!graph) return undefined
  checkFields(graph, ['nodes', 'outputs', 'alphabetMappings', 'subgraphs', 'traceLevel'], path, spans, diagnostics)
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.outputs)) {
    diagnostics.push(diagnostic('lesson.invalid-input', 'Graph requires nodes and outputs sequences.', path, spans.get(path)))
    return undefined
  }
  const sourceTypes: Record<string, PortType> = {}
  for (const [index, rawNode] of graph.nodes.entries()) {
    const nodePath = `${path}.nodes.${index}`
    const node = validateGraphNode(rawNode, nodePath, spans, diagnostics)
    if (!node) continue
    if (typeof node.id !== 'string' || !identifier.test(node.id)) continue
    if (node.operation === 'core.source@1') {
      const parameters = requireMap(node.parameters, `${nodePath}.parameters`, spans, diagnostics)
      const type = parameters && typeAt(parameters.type, `${nodePath}.parameters.type`, spans, diagnostics)
      if (type) sourceTypes[node.id] = type
    }
    ;(node as { origin?: SourceOrigin }).origin = spans.get(nodePath)
  }
  for (const [index, rawOutput] of graph.outputs.entries()) validateReference(rawOutput, `${path}.outputs.${index}`, spans, diagnostics)
  if (graph.alphabetMappings !== undefined) {
    let invalidMapping = false
    if (!Array.isArray(graph.alphabetMappings)) {
      invalidMapping = true
      diagnostics.push(diagnostic('lesson.invalid-input', 'Alphabet mappings must be a sequence.', `${path}.alphabetMappings`, spans.get(`${path}.alphabetMappings`)))
    }
    else for (const [index, rawMapping] of graph.alphabetMappings.entries()) {
      const mappingPath = `${path}.alphabetMappings.${index}`
      const mapping = requireMap(rawMapping, mappingPath, spans, diagnostics)
      if (mapping) {
        checkFields(mapping, ['id', 'symbols'], mappingPath, spans, diagnostics)
        if (typeof mapping.id !== 'string' || !Array.isArray(mapping.symbols) || mapping.symbols.some((symbol) => typeof symbol !== 'string')) {
          invalidMapping = true
          diagnostics.push(diagnostic('lesson.invalid-input', 'Alphabet mapping is invalid.', mappingPath, spans.get(mappingPath)))
        }
      }
    }
    if (invalidMapping) return undefined
  }
  if (graph.subgraphs !== undefined) {
    const subgraphs = requireMap(graph.subgraphs, `${path}.subgraphs`, spans, diagnostics)
    for (const [name, rawSubgraph] of Object.entries(subgraphs ?? {})) {
      const subgraphPath = `${path}.subgraphs.${name}`
      const subgraph = requireMap(rawSubgraph, subgraphPath, spans, diagnostics)
      if (!subgraph) continue
      checkFields(subgraph, ['inputs', 'outputs', 'nodes'], subgraphPath, spans, diagnostics)
      for (const portName of ['inputs', 'outputs'] as const) {
        if (!Array.isArray(subgraph[portName])) diagnostics.push(diagnostic('lesson.invalid-input', 'Subgraph ports must be sequences.', `${subgraphPath}.${portName}`, spans.get(`${subgraphPath}.${portName}`)))
        else for (const [index, rawPort] of subgraph[portName].entries()) {
          const portPath = `${subgraphPath}.${portName}.${index}`
          const port = requireMap(rawPort, portPath, spans, diagnostics)
          if (port) {
            checkFields(port, ['name', 'type'], portPath, spans, diagnostics)
            if (typeof port.name !== 'string') diagnostics.push(diagnostic('lesson.invalid-input', 'Subgraph port needs a name.', `${portPath}.name`, spans.get(`${portPath}.name`)))
            typeAt(port.type, `${portPath}.type`, spans, diagnostics)
          }
        }
      }
      if (!Array.isArray(subgraph.nodes)) diagnostics.push(diagnostic('lesson.invalid-input', 'Subgraph nodes must be a sequence.', `${subgraphPath}.nodes`, spans.get(`${subgraphPath}.nodes`)))
      else for (const [index, rawNode] of subgraph.nodes.entries()) validateGraphNode(rawNode, `${subgraphPath}.nodes.${index}`, spans, diagnostics)
    }
  }
  const result = compile(graph as unknown as AuthoredGraph)
  if (!result.ok) {
    const nodeIndexes = new Map(graph.nodes.map((node, index) => [fields(node)?.id, index]))
    diagnostics.push(...result.diagnostics.map((item) => {
      const [node, ...rest] = item.path.split('.')
      const nodeIndex = nodeIndexes.get(node)
      return {
        ...item,
        path: nodeIndex === undefined ? `${path}.${item.path}` : `${path}.nodes.${nodeIndex}.${rest.join('.')}`,
      }
    }))
    return undefined
  }
  const nodes = new Map(graph.nodes.flatMap((node) => {
    const entry = fields(node)
    return entry && typeof entry.id === 'string' ? [[entry.id, entry] as const] : []
  }))
  const portType = (nodeId: string, port: string, visited = new Set<string>()): PortType | undefined => {
    const key = `${nodeId}.${port}`
    if (visited.has(key)) return undefined
    const node = nodes.get(nodeId)
    if (!node) return undefined
    const next = new Set(visited).add(key)
    if (node.operation === 'core.source@1') return sourceTypes[nodeId]
    if (node.repeat) {
      const repeat = fields(node.repeat)
      const subgraph = typeof repeat?.subgraph === 'string' ? fields(fields(graph.subgraphs)?.[repeat.subgraph]) : undefined
      const output = (subgraph?.outputs as unknown[] | undefined)?.map(fields).find((candidate) => candidate?.name === port)
      return output ? typeAt(output.type, `${path}.subgraphs.${repeat?.subgraph}.outputs`, spans, diagnostics) : undefined
    }
    const inputs = fields(node.inputs)
    const forwarded = (name: string): PortType | undefined => {
      const reference = fields(inputs?.[name])
      return reference && typeof reference.node === 'string' && typeof reference.port === 'string'
        ? portType(reference.node, reference.port, next)
        : undefined
    }
    if (node.operation === 'core.xor@1' || node.operation === 'core.output@1') return forwarded(node.operation === 'core.xor@1' ? 'left' : 'value')
    const declared = operationManifests.find((manifest) => manifest.identity === node.operation)?.outputs.find((output) => output.name === port)?.type
    if (!declared || declared.family === 'alphabet-symbol' || typeof declared.size !== 'string') return declared
    return forwarded(Object.keys(inputs ?? {})[0])
  }
  const outputTypes = Object.fromEntries((graph.outputs as unknown[]).flatMap((output) => {
    const reference = fields(output)
    const type = reference && typeof reference.node === 'string' && typeof reference.port === 'string'
      ? portType(reference.node, reference.port)
      : undefined
    return reference && typeof reference.node === 'string' && typeof reference.port === 'string' && type
      ? [[`${reference.node}.${reference.port}`, type]]
      : []
  }))
  return {
    graph: result.value,
    sourceTypes,
    outputTypes,
    traceLevel: graph.traceLevel as GraphInfo['traceLevel'],
  }
}

const bindingAt = (
  value: unknown,
  path: string,
  spans: ReadonlyMap<string, SourceOrigin>,
  diagnostics: Diagnostic[],
): LessonValueReference | undefined => {
  const binding = requireMap(value, path, spans, diagnostics)
  if (!binding) return undefined
  const keys = Object.keys(binding)
  if (keys.length === 1 && typeof binding.input === 'string') return { input: binding.input }
  if (keys.length === 1 && typeof binding.constant === 'string') return { constant: binding.constant }
  if (keys.length === 2 && typeof binding.step === 'string' && typeof binding.output === 'string') return { step: binding.step, output: binding.output }
  diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Invalid value binding.', path, spans.get(path)))
  return undefined
}

const comparisonBindingAt = (
  value: unknown,
  path: string,
  spans: ReadonlyMap<string, SourceOrigin>,
  diagnostics: Diagnostic[],
): LessonComparisonBinding | undefined => {
  const map = fields(value)
  if (!map) {
    diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Invalid comparison binding.', path, spans.get(path)))
    return undefined
  }
  if (!('baseline' in map) && !('changed' in map)) {
    const shared = bindingAt(value, path, spans, diagnostics)
    return shared ? { baseline: shared, changed: shared } : undefined
  }
  checkFields(map, ['baseline', 'changed'], path, spans, diagnostics)
  const baseline = bindingAt(map.baseline, `${path}.baseline`, spans, diagnostics)
  const changed = bindingAt(map.changed, `${path}.changed`, spans, diagnostics)
  return baseline && changed ? { baseline, changed } : undefined
}

const forbiddenAcceptedCode = (code: string): boolean =>
  /(?:syntax|type|reference|cancel|resource|limit|timeout|invalid|missing|unknown|unsupported)/.test(code)

const acceptedOperationErrorCodes = new Set(['operation-failed'])

export const compileLesson = (documents: LessonDocuments, catalog?: VisualizerCatalog): Result<CompiledLesson> => {
  const parsedLesson = parseYaml('lesson.yaml', documents.lesson)
  const parsedLocales = Object.entries(documents.locales)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([locale, source]) => [locale, parseYaml(`locales/${locale}.yaml`, source)] as const)
  const yamlDiagnostics = [
    ...(parsedLesson.ok ? [] : parsedLesson.diagnostics),
    ...parsedLocales.flatMap(([, parsed]) => parsed.ok ? [] : parsed.diagnostics),
  ]
  if (yamlDiagnostics.length) return { ok: false, diagnostics: yamlDiagnostics }
  if (!parsedLesson.ok) return { ok: false, diagnostics: parsedLesson.diagnostics }
  const lesson = parsedLesson.value
  const diagnostics: Diagnostic[] = []
  const root = requireMap(lesson.value, '', lesson.spans, diagnostics)
  if (!root) return { ok: false, diagnostics }
  checkFields(root, ['version', 'id', 'default_locale', 'inputs', 'constants', 'graphs', 'steps', 'limits'], '', lesson.spans, diagnostics)
  if (root.version !== 1) diagnostics.push(diagnostic('lesson.unsupported-version', 'Unsupported Lesson version.', 'version', lesson.spans.get('version'), { version: typeof root.version === 'number' ? root.version : null }))
  if (typeof root.id !== 'string' || !identifier.test(root.id)) diagnostics.push(diagnostic('lesson.invalid-input', 'Lesson ID is invalid.', 'id', lesson.spans.get('id')))
  if (typeof root.default_locale !== 'string') diagnostics.push(diagnostic('lesson.invalid-input', 'Default locale is invalid.', 'default_locale', lesson.spans.get('default_locale')))
  const inputMap = requireMap(root.inputs, 'inputs', lesson.spans, diagnostics) ?? {}
  const constantMap = requireMap(root.constants, 'constants', lesson.spans, diagnostics) ?? {}
  const graphMap = requireMap(root.graphs, 'graphs', lesson.spans, diagnostics) ?? {}
  if (!Array.isArray(root.steps) || root.steps.length === 0) diagnostics.push(diagnostic('lesson.invalid-input', 'Lesson needs at least one Step.', 'steps', lesson.spans.get('steps')))
  const inputs: Record<string, { type: PortType; encoding: string; default: CryptoValue }> = {}
  const constants: Record<string, CryptoValue> = {}
  for (const [id, raw] of Object.entries(inputMap)) {
    const path = `inputs.${id}`
    const input = requireMap(raw, path, lesson.spans, diagnostics)
    if (!identifier.test(id) || !input) {
      if (!identifier.test(id)) diagnostics.push(diagnostic('lesson.invalid-input', 'Input ID is invalid.', path, lesson.spans.get(path)))
      continue
    }
    checkFields(input, ['type', 'encoding', 'default'], path, lesson.spans, diagnostics)
    const type = typeAt(input.type, `${path}.type`, lesson.spans, diagnostics)
    const decoded = type && decodeValue(input.default, type, input.encoding, `${path}.default`, lesson.spans, diagnostics)
    if (type && decoded && typeof input.encoding === 'string') inputs[id] = { type, encoding: input.encoding, default: decoded }
  }
  for (const [id, raw] of Object.entries(constantMap)) {
    const path = `constants.${id}`
    const constant = requireMap(raw, path, lesson.spans, diagnostics)
    if (!identifier.test(id) || !constant) {
      if (!identifier.test(id)) diagnostics.push(diagnostic('lesson.invalid-input', 'Constant ID is invalid.', path, lesson.spans.get(path)))
      continue
    }
    checkFields(constant, ['type', 'encoding', 'value'], path, lesson.spans, diagnostics)
    const type = typeAt(constant.type, `${path}.type`, lesson.spans, diagnostics)
    const decoded = type && decodeValue(constant.value, type, constant.encoding, `${path}.value`, lesson.spans, diagnostics)
    if (decoded) constants[id] = decoded
  }
  const graphInfo: Record<string, GraphInfo> = {}
  for (const [id, raw] of Object.entries(graphMap)) {
    if (!identifier.test(id)) diagnostics.push(diagnostic('lesson.invalid-input', 'Graph ID is invalid.', `graphs.${id}`, lesson.spans.get(`graphs.${id}`)))
    else {
      const compiled = compileGraph(id, raw, `graphs.${id}`, lesson.spans, diagnostics)
      if (compiled) graphInfo[id] = compiled
    }
  }
  let limits: WorkerLimits | undefined
  if (root.limits !== undefined) {
    const requested = requireMap(root.limits, 'limits', lesson.spans, diagnostics)
    if (requested) {
      checkFields(requested, Object.keys(maxWorkerLimits), 'limits', lesson.spans, diagnostics)
      for (const [key, value] of Object.entries(requested)) {
        const maximum = maxWorkerLimits[key as keyof typeof maxWorkerLimits]
        if (!Number.isSafeInteger(value) || (value as number) <= 0 || maximum === undefined || (value as number) > maximum) {
          diagnostics.push(diagnostic('lesson.invalid-input', 'Lesson limits must be positive integers within platform caps.', `limits.${key}`, lesson.spans.get(`limits.${key}`)))
        }
      }
      limits = requested as WorkerLimits
    }
  }
  const textIds = new Set<string>()
  const steps: CompiledStep[] = []
  const stepIds = new Set<string>()
  const executionSteps = new Map<string, GraphInfo>()
  for (const [index, raw] of (Array.isArray(root.steps) ? root.steps : []).entries()) {
    const path = `steps.${index}`
    const step = requireMap(raw, path, lesson.spans, diagnostics)
    if (!step) continue
    checkFields(step, ['id', 'prose', 'inputs', 'execute', 'visualizer', 'accepted_error_codes', 'check'], path, lesson.spans, diagnostics)
    if (typeof step.id !== 'string' || !identifier.test(step.id) || stepIds.has(step.id)) {
      diagnostics.push(diagnostic('lesson.invalid-input', 'Step ID is invalid or duplicated.', `${path}.id`, lesson.spans.get(`${path}.id`)))
      continue
    }
    stepIds.add(step.id)
    const compiled: { id: string; prose?: string; inputs?: { input: string; prompt: string }[]; execute?: { graph: string; bindings: Record<string, LessonValueReference> }; visualizer?: CompiledStep['visualizer']; acceptedErrorCodes?: string[]; check?: LessonCheck } = { id: step.id }
    if (typeof step.prose === 'string') {
      compiled.prose = step.prose
      textIds.add(step.prose)
    } else if (step.prose !== undefined) diagnostics.push(diagnostic('lesson.invalid-input', 'Prose must be a text ID.', `${path}.prose`, lesson.spans.get(`${path}.prose`)))
    if (step.inputs !== undefined) {
      if (!Array.isArray(step.inputs)) diagnostics.push(diagnostic('lesson.invalid-input', 'Inputs must be a sequence.', `${path}.inputs`, lesson.spans.get(`${path}.inputs`)))
      else {
        compiled.inputs = []
        for (const [inputIndex, rawPrompt] of step.inputs.entries()) {
          const promptPath = `${path}.inputs.${inputIndex}`
          const prompt = requireMap(rawPrompt, promptPath, lesson.spans, diagnostics)
          if (!prompt) continue
          checkFields(prompt, ['input', 'prompt'], promptPath, lesson.spans, diagnostics)
          if (typeof prompt.input !== 'string' || !inputs[prompt.input] || typeof prompt.prompt !== 'string') {
            diagnostics.push(diagnostic('lesson.invalid-input', 'Step input references are invalid.', promptPath, lesson.spans.get(promptPath)))
          } else {
            compiled.inputs.push({ input: prompt.input, prompt: prompt.prompt })
            textIds.add(prompt.prompt)
          }
        }
      }
    }
    if (step.execute !== undefined) {
      if (step.inputs !== undefined) diagnostics.push(diagnostic('lesson.invalid-input', 'A Step cannot request inputs and execute a graph.', path, lesson.spans.get(path)))
      const execute = requireMap(step.execute, `${path}.execute`, lesson.spans, diagnostics)
      if (execute) {
        checkFields(execute, ['graph', 'bindings'], `${path}.execute`, lesson.spans, diagnostics)
        const graph = typeof execute.graph === 'string' ? graphInfo[execute.graph] : undefined
        const bindings = requireMap(execute.bindings, `${path}.execute.bindings`, lesson.spans, diagnostics)
        if (!graph || !bindings) diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Execution references an unknown graph or bindings.', `${path}.execute`, lesson.spans.get(`${path}.execute`)))
        else {
          const compiledBindings: Record<string, LessonValueReference> = {}
          for (const [target, rawBinding] of Object.entries(bindings)) {
            const bindingPath = `${path}.execute.bindings.${target}`
            const binding = bindingAt(rawBinding, bindingPath, lesson.spans, diagnostics)
            const expected = graph.sourceTypes[target.split('.')[0]]
            if (!expected || !binding) {
              diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Binding must target a graph source output.', bindingPath, lesson.spans.get(bindingPath)))
              continue
            }
            const source = 'input' in binding ? inputs[binding.input]?.type
              : 'constant' in binding ? constants[binding.constant]?.type
              : executionSteps.get(binding.step)?.outputTypes[binding.output]
            if (!source) {
              diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Binding references an unavailable value.', bindingPath, lesson.spans.get(bindingPath)))
            } else if (source && !equalTypes(expected, source)) {
              diagnostics.push(diagnostic('lesson.invalid-input', 'Binding value type does not match graph source.', bindingPath, lesson.spans.get(bindingPath)))
            }
            compiledBindings[target] = binding
          }
          for (const target of Object.keys(graph.sourceTypes)) {
            const sourcePort = `${target}.value`
            if (!compiledBindings[sourcePort]) diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Every graph source needs a binding.', `${path}.execute.bindings`, lesson.spans.get(`${path}.execute.bindings`)))
          }
          compiled.execute = { graph: execute.graph as string, bindings: compiledBindings }
          executionSteps.set(step.id, graph)
        }
      }
    }
    if (step.visualizer !== undefined) {
      const visualizer = requireMap(step.visualizer, `${path}.visualizer`, lesson.spans, diagnostics)
      if (visualizer) {
        checkFields(visualizer, ['id', 'bindings', 'compare', 'options'], `${path}.visualizer`, lesson.spans, diagnostics)
        const descriptor = typeof visualizer.id === 'string' ? catalog?.get(visualizer.id) : undefined
        if (!descriptor) diagnostics.push(diagnostic('lesson.invalid-input', 'Visualizer is not registered.', `${path}.visualizer.id`, lesson.spans.get(`${path}.visualizer.id`)))
        else {
          const bindings = visualizer.bindings === undefined ? {} : requireMap(visualizer.bindings, `${path}.visualizer.bindings`, lesson.spans, diagnostics) ?? {}
          const execution = compiled.execute ? graphInfo[compiled.execute.graph] : undefined
          for (const [slot, rawBinding] of Object.entries(bindings)) {
            const bindingPath = `${path}.visualizer.bindings.${slot}`
            const trace = fields(rawBinding)
            if (descriptor.inputSlots[slot]) {
              const binding = bindingAt(rawBinding, bindingPath, lesson.spans, diagnostics)
              const source = binding && ('input' in binding ? inputs[binding.input]?.type
                : 'constant' in binding ? constants[binding.constant]?.type
                : (binding.step === step.id ? execution : executionSteps.get(binding.step))?.outputTypes[binding.output])
              if (!source || !equalTypes(descriptor.inputSlots[slot], source)) diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Visualizer value binding is invalid.', bindingPath, lesson.spans.get(bindingPath)))
            } else {
              const traced = trace && typeof trace.step === 'string' && typeof trace.trace === 'string'
                ? (trace.step === step.id ? execution : executionSteps.get(trace.step))
                : undefined
              const available = trace && typeof trace.trace === 'string' && (
                trace.trace === 'output' || (traced?.traceLevel === undefined && trace.trace in (traced?.outputTypes ?? {}))
              )
              if (!trace || typeof trace.step !== 'string' || typeof trace.trace !== 'string'
                || !descriptor.tracePaths.includes(trace.trace) || !traced?.traceLevel
                || !descriptor.traceLevels.includes(traced.traceLevel) || !available) {
                diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Visualizer trace binding is invalid.', bindingPath, lesson.spans.get(bindingPath)))
              }
            }
          }
          for (const slot of Object.keys(descriptor.inputSlots)) {
            if (!(slot in bindings)) diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Visualizer input slot is missing.', `${path}.visualizer.bindings`, lesson.spans.get(`${path}.visualizer.bindings`)))
          }
          const options = requireMap(visualizer.options ?? {}, `${path}.visualizer.options`, lesson.spans, diagnostics) ?? {}
          checkFields(options, Object.keys(descriptor.options ?? {}), `${path}.visualizer.options`, lesson.spans, diagnostics)
          for (const [name, type] of Object.entries(descriptor.options ?? {})) {
            if (name in options && typeof options[name] !== type) diagnostics.push(diagnostic('lesson.invalid-input', 'Visualizer option type is invalid.', `${path}.visualizer.options.${name}`, lesson.spans.get(`${path}.visualizer.options.${name}`)))
          }
          compiled.visualizer = { id: visualizer.id as string, bindings, options }
          if (descriptor.trace?.family === 'comparison' && visualizer.compare === undefined) {
            diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Visualizer comparison is required.', `${path}.visualizer.compare`, lesson.spans.get(`${path}.visualizer`)))
          } else if (visualizer.compare !== undefined) {
            const comparePath = `${path}.visualizer.compare`
            const compare = requireMap(visualizer.compare, comparePath, lesson.spans, diagnostics)
            if (compare) {
              checkFields(compare, ['kind', 'graph', 'bindings', 'traceLevel'], comparePath, lesson.spans, diagnostics)
              const graph = typeof compare.graph === 'string' ? graphInfo[compare.graph] : undefined
              const compareBindings = requireMap(compare.bindings, `${comparePath}.bindings`, lesson.spans, diagnostics) ?? {}
              const resolvedBindings: Record<string, LessonComparisonBinding> = {}
              const changedInputs: string[] = []
              const referenceType = (reference: LessonValueReference): PortType | undefined =>
                'input' in reference ? inputs[reference.input]?.type
                  : 'constant' in reference ? constants[reference.constant]?.type
                    : executionSteps.get(reference.step)?.outputTypes[reference.output]
              for (const [target, rawBinding] of Object.entries(compareBindings)) {
                const bindingPath = `${comparePath}.bindings.${target}`
                const binding = comparisonBindingAt(rawBinding, bindingPath, lesson.spans, diagnostics)
                const expected = graph?.sourceTypes[target]
                const baselineType = binding && referenceType(binding.baseline)
                const changedType = binding && referenceType(binding.changed)
                if (!binding || !expected || !baselineType || !changedType
                  || !equalTypes(expected, baselineType) || !equalTypes(expected, changedType)) {
                  diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Comparison binding is invalid.', bindingPath, lesson.spans.get(bindingPath)))
                  continue
                }
                resolvedBindings[target] = binding
                if (JSON.stringify(binding.baseline) !== JSON.stringify(binding.changed)) changedInputs.push(target)
              }
              for (const input of Object.keys(graph?.sourceTypes ?? {})) {
                if (!resolvedBindings[input]) diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Every comparison graph source needs a binding.', `${comparePath}.bindings`, lesson.spans.get(`${comparePath}.bindings`)))
              }
              if ((compare.kind !== 'avalanche' && compare.kind !== 'generic')
                || (compare.kind === 'avalanche' && (changedInputs.length !== 1 || changedInputs[0] !== 'plaintext'))) {
                diagnostics.push(diagnostic('lesson.invalid-input', 'Avalanche comparisons must vary only the plaintext binding.', comparePath, lesson.spans.get(comparePath)))
              }
              if (!graph || graph.traceLevel !== 'detail' || compare.traceLevel !== 'detail'
                || descriptor.trace?.family !== 'comparison' || descriptor.trace.level !== 'detail') {
                diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Visualizer comparison trace is invalid.', comparePath, lesson.spans.get(comparePath)))
              } else {
                compiled.visualizer = {
                  id: visualizer.id as string,
                  compare: {
                    kind: compare.kind as LessonComparison['kind'],
                    graph: compare.graph as string,
                    bindings: resolvedBindings,
                    traceLevel: 'detail',
                  },
                  options,
                }
              }
            }
          }
        }
      }
    }
    if (step.accepted_error_codes !== undefined) {
      if (!step.execute || !Array.isArray(step.accepted_error_codes) || step.accepted_error_codes.some((code) =>
        typeof code !== 'string' || forbiddenAcceptedCode(code) || !acceptedOperationErrorCodes.has(code)
      )) {
        diagnostics.push(diagnostic('lesson.invalid-input', 'Accepted error codes are only allowed for operation outcomes.', `${path}.accepted_error_codes`, lesson.spans.get(`${path}.accepted_error_codes`)))
      } else compiled.acceptedErrorCodes = step.accepted_error_codes as string[]
    }
    if (step.check !== undefined) {
      const checkPath = `${path}.check`
      const check = requireMap(step.check, checkPath, lesson.spans, diagnostics)
      if (check?.kind === 'equal') {
        checkFields(check, ['kind', 'actual', 'expected', 'feedback'], checkPath, lesson.spans, diagnostics)
        const actual = bindingAt(check.actual, `${checkPath}.actual`, lesson.spans, diagnostics)
        const expected = bindingAt(check.expected, `${checkPath}.expected`, lesson.spans, diagnostics)
        const feedback = requireMap(check.feedback, `${checkPath}.feedback`, lesson.spans, diagnostics)
        if (feedback) checkFields(feedback, ['match', 'mismatch'], `${checkPath}.feedback`, lesson.spans, diagnostics)
        const referenceType = (reference: LessonValueReference | undefined): PortType | undefined =>
          !reference ? undefined
            : 'input' in reference ? inputs[reference.input]?.type
              : 'constant' in reference ? constants[reference.constant]?.type
                : executionSteps.get(reference.step)?.outputTypes[reference.output]
        const actualType = referenceType(actual)
        const expectedType = referenceType(expected)
        if (!actualType || !expectedType) {
          diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Check references an unavailable value.', checkPath, lesson.spans.get(checkPath)))
        } else if (!equalTypes(actualType, expectedType)) {
          diagnostics.push(diagnostic('lesson.invalid-input', 'Check values must have identical types.', checkPath, lesson.spans.get(checkPath)))
        }
        if (typeof feedback?.match !== 'string' || typeof feedback.mismatch !== 'string') {
          diagnostics.push(diagnostic('lesson.invalid-input', 'Equality feedback requires match and mismatch text IDs.', `${checkPath}.feedback`, lesson.spans.get(`${checkPath}.feedback`)))
        } else {
          textIds.add(feedback.match)
          textIds.add(feedback.mismatch)
        }
        if (actual && expected && typeof feedback?.match === 'string' && typeof feedback.mismatch === 'string' && actualType && expectedType && equalTypes(actualType, expectedType)) {
          compiled.check = { kind: 'equal', actual, expected, feedback: { match: feedback.match, mismatch: feedback.mismatch } }
        }
      } else if (check?.kind === 'choice') {
        checkFields(check, ['kind', 'options', 'correct'], checkPath, lesson.spans, diagnostics)
        const options: { id: string; label: string; feedback: string }[] = []
        const optionIds = new Set<string>()
        if (!Array.isArray(check.options)) {
          diagnostics.push(diagnostic('lesson.invalid-input', 'Choice check options must be a sequence.', `${checkPath}.options`, lesson.spans.get(`${checkPath}.options`)))
        } else for (const [optionIndex, rawOption] of check.options.entries()) {
          const optionPath = `${checkPath}.options.${optionIndex}`
          const option = requireMap(rawOption, optionPath, lesson.spans, diagnostics)
          if (!option) continue
          checkFields(option, ['id', 'label', 'feedback'], optionPath, lesson.spans, diagnostics)
          if (typeof option.id !== 'string' || !identifier.test(option.id) || optionIds.has(option.id)
            || typeof option.label !== 'string' || typeof option.feedback !== 'string') {
            diagnostics.push(diagnostic('lesson.invalid-input', 'Choice options need unique IDs and localized label and feedback text IDs.', optionPath, lesson.spans.get(optionPath)))
          } else {
            optionIds.add(option.id)
            textIds.add(option.label)
            textIds.add(option.feedback)
            options.push({ id: option.id, label: option.label, feedback: option.feedback })
          }
        }
        if (typeof check.correct !== 'string' || !optionIds.has(check.correct)) {
          diagnostics.push(diagnostic('lesson.invalid-input', 'Choice check correct must match one option ID.', `${checkPath}.correct`, lesson.spans.get(`${checkPath}.correct`)))
        } else if (options.length) compiled.check = { kind: 'choice', options, correct: check.correct }
      } else {
        diagnostics.push(diagnostic('lesson.invalid-input', 'Check kind must be equal or choice.', `${checkPath}.kind`, lesson.spans.get(`${checkPath}.kind`)))
      }
    }
    if (!compiled.prose && !compiled.inputs && !compiled.execute && !compiled.visualizer && !compiled.check) diagnostics.push(diagnostic('lesson.invalid-input', 'Step must contain content.', path, lesson.spans.get(path)))
    steps.push(compiled)
  }
  const locales: Record<string, { title: string; summary: string; texts: Record<string, string> }> = {}
  for (const [locale, parsed] of parsedLocales) {
    if (!parsed.ok) continue
    const localeRoot = requireMap(parsed.value.value, '', parsed.value.spans, diagnostics)
    if (!localeRoot) continue
    checkFields(localeRoot, ['title', 'summary', 'texts'], '', parsed.value.spans, diagnostics)
    const texts = requireMap(localeRoot.texts, 'texts', parsed.value.spans, diagnostics) ?? {}
    if (typeof localeRoot.title !== 'string' || typeof localeRoot.summary !== 'string') diagnostics.push(diagnostic('lesson.invalid-input', 'Locale title and summary must be strings.', '', parsed.value.spans.get('')))
    for (const id of textIds) if (typeof texts[id] !== 'string') diagnostics.push(diagnostic(
      'lesson.missing-text',
      'Locale is missing referenced text.',
      `texts.${id}`,
      parsed.value.spans.get(`texts.${id}`) ?? parsed.value.spans.get('texts'),
    ))
    for (const [id, text] of Object.entries(texts)) {
      if (typeof text === 'string') {
        diagnostics.push(...validateLessonMarkdown(
          text,
          `texts.${id}`,
          parsed.value.spans.get(`texts.${id}`),
        ))
      }
    }
    locales[locale] = { title: String(localeRoot.title ?? ''), summary: String(localeRoot.summary ?? ''), texts: Object.fromEntries(Object.entries(texts).filter(([, text]) => typeof text === 'string')) as Record<string, string> }
  }
  if (typeof root.default_locale === 'string' && !locales[root.default_locale]) diagnostics.push(diagnostic('lesson.invalid-input', 'Default locale document is required.', 'default_locale', lesson.spans.get('default_locale')))
  if (diagnostics.length) return { ok: false, diagnostics }
  return {
    ok: true,
    value: {
      id: root.id as string,
      defaultLocale: root.default_locale as string,
      inputs,
      constants,
      graphs: Object.fromEntries(Object.entries(graphInfo).map(([id, info]) => [id, info.graph])),
      steps,
      locales,
      ...(limits ? { limits } : {}),
    },
  }
}
