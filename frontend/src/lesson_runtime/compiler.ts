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

export type LessonNotice = {
  readonly severity: 'info' | 'warning'
  readonly code: string
  readonly message: string
  readonly path?: string
}

export type VisualizerDescriptor = {
  readonly id: string
  readonly inputSlots: Readonly<Record<string, PortType>>
  readonly traceLevels: readonly ('summary' | 'round' | 'detail')[]
  readonly tracePaths: readonly string[]
  readonly options?: Readonly<Record<string, 'string' | 'number' | 'boolean'>>
  readonly major?: number
  readonly slots?: Readonly<Record<string, { readonly family: string }>>
  readonly trace?: { readonly family: 'comparison' | 'execution'; readonly level: 'detail' }
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

/** Explicit presentation metadata for descriptor-free algorithm traces (ADR 0006 / #85). */
export type LessonPresentation =
  | {
    readonly kind: 'block-cipher'
    readonly algorithm: 'AES'
    readonly variant: 128 | 192 | 256
    readonly direction: 'encrypt' | 'decrypt'
    readonly labels?: Readonly<Record<string, string>>
  }
  | {
    readonly kind: 'key-expansion'
    readonly algorithm: 'AES'
    readonly variant: 128 | 192 | 256
    readonly labels?: Readonly<Record<string, string>>
  }
  | {
    readonly kind: 'spn-cipher'
    readonly mode?: 'key-expansion'
    readonly algorithm?: string
    readonly variant?: number
    readonly direction?: 'encrypt' | 'decrypt'
    readonly labels?: Readonly<Record<string, string>>
    /** Compiled teaching order; not an authorable field or Worker payload. */
    readonly rowOrder?: readonly string[]
  }

export type CompiledStep = {
  readonly id: string
  readonly prose?: string
  readonly bitFlip?: readonly { readonly input: string; readonly changed: string; readonly prompt: string }[]
  readonly inputs?: readonly { readonly input: string; readonly prompt: string; readonly type: PortType }[]
  readonly execute?: { readonly graph: string; readonly bindings: Readonly<Record<string, LessonValueReference>> }
  readonly presentation?: LessonPresentation
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
  readonly notices: readonly LessonNotice[]
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
  } else if (family === 'alphabet-text') {
    checkFields(type, ['family', 'mapping'], path, spans, diagnostics)
    if (typeof type.mapping === 'string' && identifier.test(type.mapping)) return { family, mapping: type.mapping }
  } else if (family === 'text') {
    checkFields(type, ['family'], path, spans, diagnostics)
    return { family }
  } else if (family === 'integer') {
    checkFields(type, ['family', 'signed', 'safe'], path, spans, diagnostics)
    if (type.signed === true && type.safe === true) return { family, signed: true, safe: true }
  } else if (family === 'alphabet-policy') {
    checkFields(type, ['family'], path, spans, diagnostics)
    return { family }
  } else if (family === 'alphabet-direction') {
    checkFields(type, ['family'], path, spans, diagnostics)
    return { family }
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

// Shared by both hex encodings below: packs an exact-length hex digit string into the typed
// value, or returns undefined on a digit-count or top-byte range mismatch.
const packHexDigits = (type: PortType, hexDigits: string): CryptoValue | undefined => {
  if (type.family !== 'bits' && type.family !== 'bytes' && type.family !== 'words') return undefined
  const digits = type.family === 'bits' ? Math.ceil((type.size as number) / 4) : (type.size as number) * 2
  if (hexDigits.length !== digits) return undefined
  const packed = Uint8Array.from((hexDigits.length % 2 ? `0${hexDigits}` : hexDigits).match(/../g)!.map((byte) => Number.parseInt(byte, 16)))
  if (type.family === 'bits') {
    const size = type.size as number
    return size % 8 === 0 || packed[0] < 2 ** (size % 8) ? bits(size, packed) : undefined
  }
  if (type.family === 'bytes') return bytes(type.size as number, packed)
  if (type.family === 'words') return words(type.size as number, packed)
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
  } else if (type.family === 'alphabet-text') {
    if (encoding === 'text' && typeof value === 'string') return { type, symbols: [...value] }
  } else if (type.family === 'text') {
    if (encoding === 'text' && typeof value === 'string') return { type, symbols: [...value] }
  } else if (type.family === 'integer') {
    if (encoding === 'integer') {
      const parsed = typeof value === 'number'
        ? value
        : typeof value === 'string' && /^-?(?:0|[1-9][0-9]*)$/.test(value) ? Number(value) : undefined
      if (parsed !== undefined && Number.isSafeInteger(parsed)) return { type, value: parsed }
      const reason = typeof value === 'number' && !Number.isInteger(value)
        || typeof value === 'string' && /^-?(?:0|[1-9][0-9]*)\.[0-9]+$/.test(value)
        ? 'fraction'
        : parsed !== undefined && !Number.isSafeInteger(parsed) ? 'unsafe' : 'non-integer'
      diagnostics.push(diagnostic('cipher.invalid-key', 'Cipher keys must be safe integers.', path, spans.get(path), { reason }))
      return undefined
    }
  } else if (type.family === 'alphabet-policy') {
    if (encoding === 'policy' && (value === 'preserve' || value === 'strict')) return { type, value }
  } else if (type.family === 'alphabet-direction') {
    if (encoding === 'direction' && (value === 'encrypt' || value === 'decrypt')) return { type, value }
  } else if (encoding === 'hex' && typeof value === 'string' && /^0x[0-9A-Fa-f]+$/.test(value)) {
    const packed = packHexDigits(type, value.slice(2))
    if (packed) return packed
  } else if (encoding === 'hex-block' && typeof value === 'string' && /^[0-9A-Fa-f]+$/.test(value)) {
    // No `0x` prefix and no length tolerance (unlike `hex` above): a Lesson author uses this for
    // a fixed-width block/key field (e.g. AES's 32-character 128-bit hex input) where whitespace,
    // an odd digit count, or a stray prefix should read as a rejected value, not a padded guess.
    const packed = packHexDigits(type, value)
    if (packed) return packed
    // Even-length valid hex of the wrong width reports expected/actual bit sizes. Odd length and
    // non-hex forms fall through to the bare invalid-input diagnostic without inventing a size.
    if (type.family === 'bits' && typeof type.size === 'number' && value.length % 2 === 0) {
      diagnostics.push(diagnostic(
        'lesson.invalid-input',
        'Value does not match its declared type and encoding.',
        path,
        spans.get(path),
        { expectedBits: type.size, actualBits: value.length * 4 },
      ))
      return undefined
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

const equalTypes = (left: PortType, right: PortType): boolean =>
  left.family === 'alphabet-text' && right.family === 'alphabet-text'
    ? left.mapping === '*' || right.mapping === '*' || left.mapping === right.mapping
    : JSON.stringify(left) === JSON.stringify(right)

export const equalCryptoValues = (left: CryptoValue, right: CryptoValue): boolean => {
  if (!equalTypes(left.type, right.type)) return false
  if ('symbol' in left && 'symbol' in right) return left.symbol === right.symbol
  if ('symbols' in left && 'symbols' in right) return left.symbols.join('') === right.symbols.join('')
  if ('value' in left && 'value' in right) return left.value === right.value
  const leftBytes = 'words' in left ? left.words : (left as { bytes: Uint8Array }).bytes
  const rightBytes = 'words' in right ? right.words : (right as { bytes: Uint8Array }).bytes
  return [...leftBytes].every((value, index) => value === rightBytes[index])
}

const validateReference = (
  value: unknown,
  path: string,
  spans: ReadonlyMap<string, SourceOrigin>,
  diagnostics: Diagnostic[],
  isV2: boolean,
  allowProjection: boolean,
): void => {
  const reference = requireMap(value, path, spans, diagnostics)
  if (!reference) return
  checkFields(reference, allowProjection ? ['node', 'port', 'bits'] : ['node', 'port'], path, spans, diagnostics)
  if (typeof reference.node !== 'string' || typeof reference.port !== 'string') {
    diagnostics.push(diagnostic('lesson.invalid-input', 'Graph reference requires node and port IDs.', path, spans.get(path)))
  }
  if (allowProjection && !isV2 && reference.bits !== undefined) {
    diagnostics.push(diagnostic('lesson.v2-feature-in-v1', 'Input projections require version: 2.', `${path}.bits`, spans.get(`${path}.bits`)))
  }
  if (allowProjection && reference.bits !== undefined && (!Array.isArray(reference.bits) || reference.bits.length !== 2)) {
    diagnostics.push(diagnostic('graph.projection-invalid-format', 'Projection needs exactly two values.', `${path}.bits`, spans.get(`${path}.bits`)))
  }
}

const validateGraphNode = (
  raw: unknown,
  path: string,
  spans: ReadonlyMap<string, SourceOrigin>,
  diagnostics: Diagnostic[],
  isV2: boolean,
): Record<string, unknown> | undefined => {
  const node = requireMap(raw, path, spans, diagnostics)
  if (!node) return undefined
  checkFields(node, ['id', 'operation', 'repeat', 'inputs', 'parameters', 'role', 'round', 'iteration', 'unit'], path, spans, diagnostics)
  for (const key of ['role', 'round', 'iteration', 'unit']) if (!isV2 && key in node) diagnostics.push(diagnostic('lesson.v2-feature-in-v1', 'V2 node annotations require version: 2.', `${path}.${key}`, spans.get(`${path}.${key}`)))
  if (isV2) {
    if (node.role !== undefined && node.role !== 'state' && node.role !== 'round-key') diagnostics.push(diagnostic('lesson.invalid-input', 'Node role must be state or round-key.', `${path}.role`, spans.get(`${path}.role`)))
    for (const key of ['round', 'iteration']) if (node[key] !== undefined && (!Number.isSafeInteger(node[key]) || (node[key] as number) < 0)) diagnostics.push(diagnostic('lesson.invalid-input', 'Node round and iteration must be non-negative integers.', `${path}.${key}`, spans.get(`${path}.${key}`)))
    if (node.unit !== undefined && (!Number.isSafeInteger(node.unit) || (node.unit as number) <= 0)) diagnostics.push(diagnostic('lesson.invalid-input', 'Node unit must be a positive integer.', `${path}.unit`, spans.get(`${path}.unit`)))
  }
  if (typeof node.id !== 'string' || !identifier.test(node.id)) diagnostics.push(diagnostic('lesson.invalid-input', 'Node ID is invalid.', `${path}.id`, spans.get(`${path}.id`)))
  if (node.inputs !== undefined) {
    const inputs = requireMap(node.inputs, `${path}.inputs`, spans, diagnostics)
    for (const [name, reference] of Object.entries(inputs ?? {})) validateReference(reference, `${path}.inputs.${name}`, spans, diagnostics, isV2, true)
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
      : node.operation === 'spn.permute@1' || node.operation === 'spn.permute-gather@1' ? ['permutation']
      : node.operation === 'core.substitute-nibbles@1' ? ['sBox', 'start', 'count']
      : node.operation === 'core.substitute-bytes@1' ? ['sBox', 'start', 'count']
      : node.operation === 'core.permute-bytes@1' ? ['permutation']
      : node.operation === 'core.rotate-word@1' || node.operation === 'core.xor-constant@1' ? ['target', ...(node.operation === 'core.rotate-word@1' ? ['amount'] : ['constant'])]
      : node.operation === 'aes.xor-words@1' ? ['start', 'count']
      : node.operation === 'aes.key-word@1' ? ['index']
      : node.operation === 'aes.rcon-word@1' ? ['round']
      : node.operation === 'core.xor@1' || node.operation === 'core.output@1'
        || node.operation === 'classical.caesar@1' || node.operation === 'classical.affine@1'
        || node.operation === 'classical.substitution@1' || node.operation === 'classical.vigenere@1'
        || node.operation === 'classical.transposition@1'
        || node.operation === 'aes.rot-word@1' || node.operation === 'aes.sub-word@1'
        || node.operation === 'aes.word-xor@1' || node.operation === 'aes.round-key@1' ? []
      : undefined
    if (parameters && allowed) checkFields(parameters, allowed, `${path}.parameters`, spans, diagnostics)
    if (parameters && !isV2) {
      for (const [name, value] of Object.entries(parameters)) {
        const reference = fields(value)
        if (reference && Object.keys(reference).length === 1 && typeof reference.constant === 'string') {
          diagnostics.push(diagnostic('lesson.v2-feature-in-v1', 'Parameter constant references require version: 2.', `${path}.parameters.${name}`, spans.get(`${path}.parameters.${name}`)))
        }
      }
    }
  }
  return node
}

type GraphInfo = {
  readonly graph: CompiledGraph
  readonly sourceTypes: Readonly<Record<string, PortType>>
  readonly outputTypes: Readonly<Record<string, PortType>>
  readonly traceBitWidths: readonly number[]
  readonly traceLevel?: 'summary' | 'round' | 'detail'
}

type TableConstant = { readonly entryBits: number; readonly value: readonly number[] }

const parameterReferences = (value: unknown, tables: Readonly<Record<string, TableConstant>>, constants: Readonly<Record<string, CryptoValue>>, path: string, spans: ReadonlyMap<string, SourceOrigin>, diagnostics: Diagnostic[], preserveTables = false): unknown => {
  const map = fields(value)
  if (!map || Object.keys(map).length !== 1 || typeof map.constant !== 'string') return value
  if (typeof map.constant === 'string') {
    const table = tables[map.constant]
    if (table) return preserveTables ? { constant: map.constant } : [...table.value]
    const constant = constants[map.constant]
    if (constant) return constant
    diagnostics.push(diagnostic('lesson.unknown-constant', 'Parameter references an unknown constant.', path, spans.get(path)))
    return value
  }
  return value
}

const decodeSourceValues = (
  rawNodes: unknown[],
  path: string,
  spans: ReadonlyMap<string, SourceOrigin>,
  diagnostics: Diagnostic[],
): unknown[] => rawNodes.map((rawNode, index) => {
  const nodePath = `${path}.nodes.${index}`
  const node = fields(rawNode)
  const parameters = fields(node?.parameters)
  if (node?.operation !== 'core.source@1' || !parameters) return rawNode
  const type = typeAt(parameters.type, `${nodePath}.parameters.type`, spans, diagnostics)
  if (!type) return rawNode
  const decoded = { ...parameters }
  const valueReference = fields(parameters.value)
  const directReference = valueReference && Object.keys(valueReference).length === 1 && typeof valueReference.constant === 'string'
  if (parameters.value !== undefined && !directReference) {
    const encoding = type.family === 'alphabet-text' || type.family === 'text' ? 'text'
      : type.family === 'integer' ? 'integer'
        : type.family === 'alphabet-policy' ? 'policy'
          : type.family === 'alphabet-direction' ? 'direction'
          : type.family === 'alphabet-symbol' ? 'literal'
            : 'hex'
    const value = decodeValue(parameters.value, type, encoding, `${nodePath}.parameters.value`, spans, diagnostics)
    if (value) decoded.value = value
  }
  if (Array.isArray(parameters.roundKeys)) {
    const values = parameters.roundKeys.map((value, round) =>
      decodeValue(value, type, 'hex', `${nodePath}.parameters.roundKeys.${round}`, spans, diagnostics))
    if (values.every((value): value is CryptoValue => value !== undefined)) decoded.roundKeys = values
  }
  return { ...node, parameters: decoded }
})

const traceBitWidths = (nodes: unknown[]): readonly number[] => nodes.flatMap((rawNode) => {
  const node = fields(rawNode)
  const type = fields(fields(node?.parameters)?.type)
  return node?.operation === 'core.source@1' && type?.family === 'bits' && typeof type.size === 'number'
    ? [type.size]
    : []
})

const compileGraph = (
  id: string,
  raw: unknown,
  path: string,
  spans: ReadonlyMap<string, SourceOrigin>,
  diagnostics: Diagnostic[],
  isV2: boolean,
  tables: Readonly<Record<string, TableConstant>>,
  constants: Readonly<Record<string, CryptoValue>>,
): GraphInfo | undefined => {
  const graph = requireMap(raw, path, spans, diagnostics)
  if (!graph) return undefined
  checkFields(graph, ['nodes', 'outputs', 'alphabetMappings', 'subgraphs', 'traceLevel'], path, spans, diagnostics)
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.outputs)) {
    diagnostics.push(diagnostic('lesson.invalid-input', 'Graph requires nodes and outputs sequences.', path, spans.get(path)))
    return undefined
  }
  const sourceTypes: Record<string, PortType> = {}
  const authoredOutputs = graph.outputs.map((output) => {
    const reference = fields(output)
    return reference && typeof reference.node === 'string' && typeof reference.port === 'string'
      ? { node: reference.node, port: reference.port }
      : undefined
  })
  for (const [index, rawNode] of graph.nodes.entries()) {
    const nodePath = `${path}.nodes.${index}`
    const node = validateGraphNode(rawNode, nodePath, spans, diagnostics, isV2)
    if (!node) continue
    if (typeof node.id !== 'string' || !identifier.test(node.id)) continue
    if (node.operation === 'core.source@1') {
      const parameters = requireMap(node.parameters, `${nodePath}.parameters`, spans, diagnostics)
      const type = parameters && typeAt(parameters.type, `${nodePath}.parameters.type`, spans, diagnostics)
      if (type) sourceTypes[node.id] = type
    }
    ;(node as { origin?: SourceOrigin }).origin = spans.get(nodePath)
  }
  for (const [index, rawOutput] of graph.outputs.entries()) validateReference(rawOutput, `${path}.outputs.${index}`, spans, diagnostics, isV2, false)
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
      else for (const [index, rawNode] of subgraph.nodes.entries()) validateGraphNode(rawNode, `${subgraphPath}.nodes.${index}`, spans, diagnostics, isV2)
    }
  }
  const resolveNodes = (nodes: unknown[], nodePath: string) => decodeSourceValues(nodes, nodePath, spans, diagnostics).map((rawNode, index) => {
    const node = fields(rawNode)
    if (!node?.parameters) return rawNode
    const parameters = fields(node.parameters) ?? {}
    if (!isV2) return { ...node, parameters }
    return {
      ...node,
      traceParameters: Object.fromEntries(Object.entries(parameters).map(([name, value]) => [name, parameterReferences(value, tables, constants, `${nodePath}.nodes.${index}.parameters.${name}`, spans, diagnostics, true)])),
      parameters: Object.fromEntries(Object.entries(parameters).map(([name, value]) => [name, parameterReferences(value, tables, constants, `${nodePath}.nodes.${index}.parameters.${name}`, spans, diagnostics)])),
    }
  })
  const decodedGraph = {
    ...graph,
    nodes: resolveNodes(graph.nodes, path),
    subgraphs: Object.fromEntries(Object.entries(fields(graph.subgraphs) ?? {}).map(([name, rawSubgraph]) => {
      const subgraph = fields(rawSubgraph)
      return [name, subgraph
        ? { ...subgraph, nodes: Array.isArray(subgraph.nodes) ? resolveNodes(subgraph.nodes, `${path}.subgraphs.${name}`) : subgraph.nodes }
        : rawSubgraph]
    })),
  }
  const result = compile({ ...decodedGraph, ...(isV2 ? { schema: 2 as const } : {}) } as unknown as AuthoredGraph)
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
    const resolved = result.value.outputTypes?.[`${nodeId}.${port}`]
    if (resolved) return resolved
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
    if (node.operation === 'classical.caesar@1' || node.operation === 'classical.affine@1'
      || node.operation === 'classical.substitution@1' || node.operation === 'classical.vigenere@1'
      || node.operation === 'classical.transposition@1') return forwarded('text')
    const declared = operationManifests.find((manifest) => manifest.identity === node.operation)?.outputs.find((output) => output.name === port)?.type
    if (!declared || ['alphabet-symbol', 'alphabet-text', 'text', 'integer', 'alphabet-policy', 'alphabet-direction'].includes(declared.family)
      || typeof (declared as { size?: unknown }).size !== 'string') return declared
    return forwarded(Object.keys(inputs ?? {})[0])
  }
  const outputTypes = Object.fromEntries(authoredOutputs.flatMap((reference, index) => {
    const resolvedOutput = result.value.graph.outputs[index]
    const typeReference = isV2 && resolvedOutput ? resolvedOutput : reference
    const type = typeReference && typeof typeReference.node === 'string' && typeof typeReference.port === 'string'
      ? portType(typeReference.node, typeReference.port)
      : undefined
    return reference && typeof reference.node === 'string' && typeof reference.port === 'string' && type
      ? [[`${reference.node}.${reference.port}`, type]]
      : []
  }))
  const outputAliases = Object.fromEntries(authoredOutputs.flatMap((reference, index) => {
      const resolvedOutput = result.value.graph.outputs[index]
      return isV2 && reference && resolvedOutput && typeof reference.node === 'string' && typeof reference.port === 'string'
        ? [[`${reference.node}.${reference.port}`, `${resolvedOutput.node}.${resolvedOutput.port}`]]
        : []
    }))
  return {
    graph: { ...result.value, ...(isV2 ? { outputAliases } : {}) },
    sourceTypes,
    outputTypes,
    traceBitWidths: [
      ...traceBitWidths(graph.nodes),
      ...Object.values(fields(graph.subgraphs) ?? {}).flatMap((rawSubgraph) => {
        const subgraph = fields(rawSubgraph)
        return Array.isArray(subgraph?.nodes) ? traceBitWidths(subgraph.nodes) : []
      }),
      ...Object.values(outputTypes).flatMap((type) => type.family === 'bits' && typeof (type as { size?: unknown }).size === 'number'
        ? [(type as { size: number }).size]
        : []),
    ],
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

const spnCipherRows = (graph: CompiledGraph | undefined, path: string, span?: SourceOrigin): Result<readonly string[]> => {
  const nodes = graph?.graph.nodes ?? []
  if (!nodes.some((node) => node.role === 'state') || !nodes.some((node) => node.role === 'round-key')
    || nodes.some((node) => !node.role || graph?.outputTypes?.[`${node.id}.value`]?.family !== 'bits')) {
    return { ok: false, diagnostics: [diagnostic('presentation.spn-role-required', 'Cipher presentation requires bit-valued state and round-key roles on its execution nodes.', path, span)] }
  }
  const byId = new Map(nodes.map((node) => [node.id, node]))
  if (nodes.some((node) => node.round === undefined || Object.values(node.inputs ?? {}).some((input) =>
    byId.get(input.node)?.role === 'round-key' && byId.get(input.node)?.round !== node.round))) {
    return { ok: false, diagnostics: [diagnostic('presentation.spn-round-required', 'Cipher rows need round annotations, and round keys must match their consuming state round.', path, span)] }
  }
  const lineageTargets = new Set(graph?.lineage?.map((edge) => `${edge.target}#${edge.targetBit}`))
  for (const node of nodes.filter((node) => Object.keys(node.inputs ?? {}).length)) {
    const type = graph?.outputTypes?.[`${node.id}.value`]
    if (type?.family === 'bits' && Array.from({ length: type.size as number }, (_, bit) => bit)
      .some((bit) => !lineageTargets.has(`${node.id}.value#${bit}`))) {
      return { ok: false, diagnostics: [diagnostic('presentation.spn-lineage-required', 'Cipher transforms require compiled bit lineage for every output bit.', path, span, { node: node.id })] }
    }
  }
  const states = nodes.filter((node) => node.role === 'state')
  const keys = nodes.filter((node) => node.role === 'round-key')
  const parents = (node: typeof nodes[number]) => [...new Set(Object.values(node.inputs ?? {})
    .filter((input) => byId.get(input.node)?.role === 'state').map((input) => input.node))]
  const roots = states.filter((node) => parents(node).length === 0)
  const successors = new Map<string, typeof nodes[number]>()
  const unsupported = (): Result<readonly string[]> => ({ ok: false, diagnostics: [diagnostic(
    'presentation.spn-order-unsupported', 'Cipher teaching order requires one state chain, with at most one new round-key source at each consumer.', path, span,
  )] })
  if (roots.length !== 1 || Object.keys(roots[0].inputs ?? {}).length || keys.some((node) => Object.keys(node.inputs ?? {}).length)) return unsupported()
  for (const node of states.filter((node) => node !== roots[0])) {
    const inputs = parents(node)
    if (inputs.length !== 1 || successors.has(inputs[0])) return unsupported()
    successors.set(inputs[0], node)
  }
  const rows: string[] = []
  const placedKeys = new Set<string>()
  // State dependencies establish consumption order; source declarations and IDs never break ties.
  for (let state: typeof nodes[number] | undefined = roots[0]; state; state = successors.get(state.id)) {
    const newKeys = [...new Set(Object.values(state.inputs ?? {}).filter((input) => byId.get(input.node)?.role === 'round-key')
      .map((input) => input.node))].filter((id) => !placedKeys.has(id))
    if (newKeys.length > 1) return unsupported()
    for (const id of newKeys) { rows.push(`${id}.value`); placedKeys.add(id) }
    rows.push(`${state.id}.value`)
  }
  return rows.length === nodes.length ? { ok: true, value: rows } : unsupported()
}

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
  const isV1 = root.version === 1
  const isV2 = root.version === undefined || root.version === 2
  if (!isV1 && !isV2) diagnostics.push(diagnostic('lesson.unsupported-version', 'Unsupported Lesson version.', 'version', lesson.spans.get('version'), { version: typeof root.version === 'number' ? root.version : null }))
  if (typeof root.id !== 'string' || !identifier.test(root.id)) diagnostics.push(diagnostic('lesson.invalid-input', 'Lesson ID is invalid.', 'id', lesson.spans.get('id')))
  if (typeof root.default_locale !== 'string') diagnostics.push(diagnostic('lesson.invalid-input', 'Default locale is invalid.', 'default_locale', lesson.spans.get('default_locale')))
  const inputMap = requireMap(root.inputs, 'inputs', lesson.spans, diagnostics) ?? {}
  const constantMap = requireMap(root.constants, 'constants', lesson.spans, diagnostics) ?? {}
  const graphMap = requireMap(root.graphs, 'graphs', lesson.spans, diagnostics) ?? {}
  if (!Array.isArray(root.steps) || root.steps.length === 0) diagnostics.push(diagnostic('lesson.invalid-input', 'Lesson needs at least one Step.', 'steps', lesson.spans.get('steps')))
  const inputs: Record<string, { type: PortType; encoding: string; default: CryptoValue }> = {}
  const constants: Record<string, CryptoValue> = {}
  const tables: Record<string, TableConstant> = {}
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
    if (constant.kind === 'table') {
      if (!isV2) diagnostics.push(diagnostic('lesson.v2-feature-in-v1', 'Table constants require version: 2.', path, lesson.spans.get(path)))
      checkFields(constant, ['kind', 'entryBits', 'value'], path, lesson.spans, diagnostics)
      const entryBits = constant.entryBits
      const value = constant.value
      if (!Number.isSafeInteger(entryBits) || (entryBits as number) < 1 || (entryBits as number) > 16) diagnostics.push(diagnostic('table.entry-bits-out-of-range', 'Table entryBits must be from 1 through 16.', `${path}.entryBits`, lesson.spans.get(`${path}.entryBits`)))
      else if (!Array.isArray(value) || value.length !== 2 ** (entryBits as number)) diagnostics.push(diagnostic('table.length-mismatch', 'Table length does not match entryBits.', `${path}.value`, lesson.spans.get(`${path}.value`)))
      else if (!value.every((entry) => Number.isSafeInteger(entry) && (entry as number) >= 0 && (entry as number) < 2 ** (entryBits as number))) diagnostics.push(diagnostic('table.entry-out-of-range', 'Table entry is out of range.', `${path}.value`, lesson.spans.get(`${path}.value`)))
      else tables[id] = { entryBits: entryBits as number, value: value as number[] }
    } else {
      checkFields(constant, ['type', 'encoding', 'value'], path, lesson.spans, diagnostics)
      const type = typeAt(constant.type, `${path}.type`, lesson.spans, diagnostics)
      const decoded = type && decodeValue(constant.value, type, constant.encoding, `${path}.value`, lesson.spans, diagnostics)
      if (decoded) constants[id] = decoded
    }
  }
  const graphInfo: Record<string, GraphInfo> = {}
  for (const [id, raw] of Object.entries(graphMap)) {
    if (!identifier.test(id)) diagnostics.push(diagnostic('lesson.invalid-input', 'Graph ID is invalid.', `graphs.${id}`, lesson.spans.get(`graphs.${id}`)))
    else {
      const compiled = compileGraph(id, raw, `graphs.${id}`, lesson.spans, diagnostics, isV2, tables, constants)
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
    checkFields(step, ['id', 'prose', 'bit_flip', 'inputs', 'execute', 'presentation', 'visualizer', 'accepted_error_codes', 'check'], path, lesson.spans, diagnostics)
    if (typeof step.id !== 'string' || !identifier.test(step.id) || stepIds.has(step.id)) {
      diagnostics.push(diagnostic('lesson.invalid-input', 'Step ID is invalid or duplicated.', `${path}.id`, lesson.spans.get(`${path}.id`)))
      continue
    }
    stepIds.add(step.id)
    const compiled: { id: string; prose?: string; bitFlip?: CompiledStep['bitFlip']; inputs?: { input: string; prompt: string; type: PortType }[]; execute?: { graph: string; bindings: Record<string, LessonValueReference> }; presentation?: LessonPresentation; visualizer?: CompiledStep['visualizer']; acceptedErrorCodes?: string[]; check?: LessonCheck } = { id: step.id }
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
            compiled.inputs.push({ input: prompt.input, prompt: prompt.prompt, type: inputs[prompt.input].type })
            textIds.add(prompt.prompt)
          }
        }
      }
    }
    if (step.bit_flip !== undefined) {
      const flipPath = `${path}.bit_flip`
      const options: { input: string; changed: string; prompt: string }[] = []
      if (!Array.isArray(step.bit_flip) || step.bit_flip.length === 0 || step.execute !== undefined) {
        diagnostics.push(diagnostic('lesson.invalid-input', 'Bit flipping requires source options in a non-execution Step.', flipPath, lesson.spans.get(flipPath)))
      } else for (const [optionIndex, rawOption] of step.bit_flip.entries()) {
        const optionPath = `${flipPath}.${optionIndex}`
        const option = requireMap(rawOption, optionPath, lesson.spans, diagnostics)
        if (!option) continue
        checkFields(option, ['input', 'changed', 'prompt'], optionPath, lesson.spans, diagnostics)
        const source = typeof option.input === 'string' && inputs[option.input]
        const target = typeof option.changed === 'string' && inputs[option.changed]
        if (!source || !target || source.type.family !== 'bits' || !equalTypes(source.type, target.type)
          || typeof option.prompt !== 'string' || option.input === option.changed) {
          diagnostics.push(diagnostic('lesson.invalid-input', 'Bit flip inputs must be distinct bit values of equal size with a prompt.', optionPath, lesson.spans.get(optionPath)))
        } else {
          options.push({ input: option.input as string, changed: option.changed as string, prompt: option.prompt })
          textIds.add(option.prompt)
        }
      }
      const sources = options.map((option) => option.input)
      const targets = options.map((option) => option.changed)
      if (new Set(sources).size !== sources.length || new Set(targets).size !== targets.length || targets.some((target) => sources.includes(target))) {
        diagnostics.push(diagnostic('lesson.invalid-input', 'Bit flip sources and targets must not overlap or repeat.', flipPath, lesson.spans.get(flipPath)))
      }
      compiled.bitFlip = options
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
            if ('constant' in binding && !constants[binding.constant] && tables[binding.constant]) {
              diagnostics.push(diagnostic('lesson.invalid-constant-use', 'Table constants are only valid as operation parameters.', bindingPath, lesson.spans.get(bindingPath)))
            } else if (!source) {
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
    if (step.presentation !== undefined) {
      const presentation = requireMap(step.presentation, `${path}.presentation`, lesson.spans, diagnostics)
      if (presentation) {
        checkFields(presentation, ['kind', 'algorithm', 'variant', 'direction', 'labels', 'mode'], `${path}.presentation`, lesson.spans, diagnostics)
        const kind = presentation.kind
        if (presentation.mode !== undefined && (!isV2 || kind !== 'spn-cipher' || presentation.mode !== 'key-expansion')) diagnostics.push(diagnostic('lesson.invalid-input', 'Standalone schedule mode requires a v2 spn-cipher presentation.', `${path}.presentation.mode`, lesson.spans.get(`${path}.presentation.mode`)))
        const algorithm = presentation.algorithm
        const variant = presentation.variant
        const direction = presentation.direction
        const labels = presentation.labels === undefined ? undefined : requireMap(presentation.labels, `${path}.presentation.labels`, lesson.spans, diagnostics)
        if (labels) for (const [identity, textId] of Object.entries(labels)) {
          if (typeof textId !== 'string' || !identity) diagnostics.push(diagnostic('lesson.invalid-input', 'Presentation labels must map operation identities to text IDs.', `${path}.presentation.labels.${identity}`, lesson.spans.get(`${path}.presentation.labels.${identity}`)))
          else textIds.add(textId)
        }
        if (!isV2 && presentation.labels !== undefined) diagnostics.push(diagnostic('lesson.v2-feature-in-v1', 'Presentation labels require version: 2.', `${path}.presentation.labels`, lesson.spans.get(`${path}.presentation.labels`)))
        const validVariant = variant === 128 || variant === 192 || variant === 256
        if (isV2 && (kind === 'block-cipher' || kind === 'key-expansion')) {
          diagnostics.push(diagnostic('lesson.v1-feature-in-v2', 'This presentation is only supported by version: 1.', `${path}.presentation.kind`, lesson.spans.get(`${path}.presentation.kind`)))
        } else if (!isV2 && kind === 'spn-cipher') {
          diagnostics.push(diagnostic('lesson.v2-feature-in-v1', 'This presentation requires version: 2.', `${path}.presentation.kind`, lesson.spans.get(`${path}.presentation.kind`)))
        } else if (kind === 'block-cipher' && algorithm === 'AES' && validVariant && (direction === 'encrypt' || direction === 'decrypt')) {
          compiled.presentation = { kind, algorithm, variant, direction, ...(labels ? { labels: labels as Record<string, string> } : {}) }
        } else if (kind === 'key-expansion' && algorithm === 'AES' && validVariant && direction === undefined) {
          compiled.presentation = { kind, algorithm, variant, ...(labels ? { labels: labels as Record<string, string> } : {}) }
        } else if (isV2 && kind === 'spn-cipher') {
          const rows = presentation.mode !== 'key-expansion' ? spnCipherRows(
            compiled.execute ? graphInfo[compiled.execute.graph]?.graph : undefined, `${path}.presentation`, lesson.spans.get(`${path}.presentation`),
          ) : undefined
          if (rows && !rows.ok) diagnostics.push(...rows.diagnostics)
          compiled.presentation = {
            kind,
            ...(rows?.ok ? { rowOrder: rows.value } : {}),
            ...(presentation.mode === 'key-expansion' ? { mode: 'key-expansion' as const } : {}),
            ...(typeof algorithm === 'string' ? { algorithm } : {}),
            ...(typeof variant === 'number' ? { variant } : {}),
            ...(direction === 'encrypt' || direction === 'decrypt' ? { direction } : {}),
            ...(labels ? { labels: labels as Record<string, string> } : {}),
          }
        } else {
          diagnostics.push(diagnostic('lesson.invalid-input', 'Presentation metadata is invalid.', `${path}.presentation`, lesson.spans.get(`${path}.presentation`)))
        }
      }
    }
    if (step.visualizer !== undefined) {
      const visualizer = requireMap(step.visualizer, `${path}.visualizer`, lesson.spans, diagnostics)
      if (visualizer) {
        checkFields(visualizer, ['id', 'bindings', 'compare', 'options'], `${path}.visualizer`, lesson.spans, diagnostics)
        const v2VisualizerCode = isV2 && (visualizer.id === 'teaching-spn@1' || visualizer.id === 'avalanche@1' || visualizer.id === 'classical-cipher@1')
        const unsupportedV2Visualizer = isV2 && (visualizer.id === 'avalanche@1' || visualizer.id === 'classical-cipher@1')
        if (isV2 && visualizer.compare !== undefined) diagnostics.push(diagnostic('lesson.v2-unsupported', 'Comparison steps are not supported by version: 2.', `${path}.visualizer.compare`, lesson.spans.get(`${path}.visualizer.compare`)))
        if (v2VisualizerCode) diagnostics.push(diagnostic(
          visualizer.id === 'teaching-spn@1' ? 'lesson.v1-feature-in-v2' : 'lesson.v2-unsupported',
          visualizer.id === 'teaching-spn@1' ? 'This visualizer is only supported by version: 1.' : 'This visualizer is not supported by version: 2.',
          `${path}.visualizer.id`,
          lesson.spans.get(`${path}.visualizer.id`),
        ))
        const descriptor = typeof visualizer.id === 'string' ? catalog?.get(visualizer.id) : undefined
        if (!descriptor) {
          if (!unsupportedV2Visualizer && !v2VisualizerCode) diagnostics.push(diagnostic('lesson.invalid-input', 'Visualizer is not registered.', `${path}.visualizer.id`, lesson.spans.get(`${path}.visualizer.id`)))
        } else {
          const bindings = visualizer.bindings === undefined ? {} : requireMap(visualizer.bindings, `${path}.visualizer.bindings`, lesson.spans, diagnostics) ?? {}
          const execution = compiled.execute ? graphInfo[compiled.execute.graph] : undefined
          for (const [slot, rawBinding] of Object.entries(bindings)) {
            const bindingPath = `${path}.visualizer.bindings.${slot}`
            const trace = fields(rawBinding)
            if (descriptor.inputSlots[slot]) {
              const binding = bindingAt(rawBinding, bindingPath, lesson.spans, diagnostics)
              const tableUse = binding && 'constant' in binding && tables[binding.constant]
              if (tableUse) diagnostics.push(diagnostic('lesson.invalid-constant-use', 'Table constants are only valid as operation parameters.', bindingPath, lesson.spans.get(bindingPath)))
              const source = tableUse ? undefined : binding && ('input' in binding ? inputs[binding.input]?.type
                : 'constant' in binding ? constants[binding.constant]?.type
                : (binding.step === step.id ? execution : executionSteps.get(binding.step))?.outputTypes?.[binding.output])
              if (!tableUse && (!source || !equalTypes(descriptor.inputSlots[slot], source))) diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Visualizer value binding is invalid.', bindingPath, lesson.spans.get(bindingPath)))
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
          if (descriptor.trace?.family === 'execution' && !execution) {
            diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Execution visualizers require an execution in the same Step.', `${path}.visualizer`, lesson.spans.get(`${path}.visualizer`)))
          }
          if (descriptor.trace?.family === 'execution' && descriptor.limits?.bits !== undefined && execution
            && execution.traceBitWidths.some((size) => size > descriptor.limits!.bits)) {
            diagnostics.push(diagnostic('lesson.invalid-input', 'Visualizer graph exceeds its declared bit limit.', `${path}.visualizer`, lesson.spans.get(`${path}.visualizer`)))
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
        const actualTable = actual && 'constant' in actual && tables[actual.constant]
        const expectedTable = expected && 'constant' in expected && tables[expected.constant]
        if (actualTable) diagnostics.push(diagnostic('lesson.invalid-constant-use', 'Table constants are only valid as operation parameters.', `${checkPath}.actual`, lesson.spans.get(`${checkPath}.actual`)))
        if (expectedTable) diagnostics.push(diagnostic('lesson.invalid-constant-use', 'Table constants are only valid as operation parameters.', `${checkPath}.expected`, lesson.spans.get(`${checkPath}.expected`)))
        const referenceType = (reference: LessonValueReference | undefined): PortType | undefined =>
          !reference ? undefined
            : 'input' in reference ? inputs[reference.input]?.type
              : 'constant' in reference ? constants[reference.constant]?.type
                : executionSteps.get(reference.step)?.outputTypes[reference.output]
        const actualType = actualTable ? undefined : referenceType(actual)
        const expectedType = expectedTable ? undefined : referenceType(expected)
        if ((!actualType || !expectedType) && !actualTable && !expectedTable) {
          diagnostics.push(diagnostic('lesson.invalid-step-reference', 'Check references an unavailable value.', checkPath, lesson.spans.get(checkPath)))
        } else if (actualType && expectedType && !equalTypes(actualType, expectedType)) {
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
    if (!compiled.prose && !compiled.bitFlip && !compiled.inputs && !compiled.execute && !compiled.visualizer && !compiled.check) diagnostics.push(diagnostic('lesson.invalid-input', 'Step must contain content.', path, lesson.spans.get(path)))
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
  const notices: LessonNotice[] = isV1 ? [{ severity: 'warning', code: 'lesson.schema-v1-deprecated', path: 'version', message: 'Lesson schema v1 is deprecated; see docs/MIGRATION-v2.md.' }] : []
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
      notices,
      ...(limits ? { limits } : {}),
    },
  }
}
