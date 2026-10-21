import type {
  AlphabetMapping,
  AlphabetDirectionValue,
  AlphabetPolicyValue,
  AlphabetTextValue,
  AuthoredNode,
  BitsValue,
  CryptoValue,
  Diagnostic,
  IntegerValue,
  PortType,
  TextValue,
  BytesValue,
  WordsValue,
} from './index'
import type { Result } from './operation'

type ByteValue = BitsValue | BytesValue | WordsValue

const isIntegerValue = (value: CryptoValue): value is IntegerValue => value.type.family === 'integer'
const isAlphabetPolicyValue = (value: CryptoValue): value is AlphabetPolicyValue => value.type.family === 'alphabet-policy'
const isAlphabetDirectionValue = (value: CryptoValue): value is AlphabetDirectionValue => value.type.family === 'alphabet-direction'
const isAlphabetTextValue = (value: CryptoValue): value is AlphabetTextValue => value.type.family === 'alphabet-text'
const isTextValue = (value: CryptoValue): value is TextValue => value.type.family === 'text'
const isByteValue = (value: CryptoValue): value is ByteValue =>
  value.type.family === 'bits' || value.type.family === 'bytes' || value.type.family === 'words'

export const diagnostic = (code: string, message: string, path: string, node?: AuthoredNode, details: Record<string, string | number | boolean | null> = {}): Diagnostic => ({
  code,
  message,
  path,
  ...(node?.origin ? { span: node.origin } : {}),
  details,
})

export const isPortType = (value: unknown): value is PortType => {
  if (typeof value !== 'object' || value === null) return false
  const type = value as Record<string, unknown>
  if (type.family === 'alphabet-symbol') return typeof type.mapping === 'string'
  if (type.family === 'alphabet-text') return typeof type.mapping === 'string'
  if (type.family === 'text') return true
  if (type.family === 'integer') return type.signed === true && type.safe === true
  if (type.family === 'alphabet-policy') return true
  if (type.family === 'alphabet-direction') return true
  if ((type.family === 'bits' || type.family === 'bytes') && (typeof type.size === 'number' || typeof type.size === 'string')) return true
  return type.family === 'words' && (typeof type.size === 'number' || typeof type.size === 'string') && type.wordSize === 8
}

export const actualType = (value: CryptoValue): PortType => value.type

export const typeMatches = (expected: PortType, actual: PortType, bindings: Map<string, number>): boolean => {
  if (expected.family !== actual.family) return false
  if (expected.family === 'alphabet-symbol' && actual.family === 'alphabet-symbol') return expected.mapping === actual.mapping
  if (expected.family === 'alphabet-text' && actual.family === 'alphabet-text') return expected.mapping === '*' || expected.mapping === actual.mapping
  if (expected.family === 'text') return actual.family === 'text'
  if (expected.family === 'integer' || expected.family === 'alphabet-policy' || expected.family === 'alphabet-direction') return true
  if (expected.family === 'words' && actual.family === 'words' && expected.wordSize !== actual.wordSize) return false
  if (expected.family === 'alphabet-symbol' || expected.family === 'alphabet-text' || actual.family === 'alphabet-symbol' || actual.family === 'alphabet-text') return false
  const binaryExpected = expected as Exclude<PortType, { family: 'alphabet-symbol' | 'alphabet-text' | 'text' | 'integer' | 'alphabet-policy' | 'alphabet-direction' }>
  const binaryActual = actual as Exclude<PortType, { family: 'alphabet-symbol' | 'alphabet-text' | 'text' | 'integer' | 'alphabet-policy' | 'alphabet-direction' }>
  const actualSize = binaryActual.size as number
  if (typeof binaryExpected.size === 'number') return binaryExpected.size === actualSize
  const bound = bindings.get(binaryExpected.size)
  if (bound === undefined) {
    bindings.set(binaryExpected.size, actualSize)
    return true
  }
  return bound === actualSize
}

export const typeText = (type: PortType): string => {
  if (type.family === 'alphabet-symbol') return `alphabet-symbol<${type.mapping}>`
  if (type.family === 'alphabet-text') return `alphabet-text<${type.mapping}>`
  if (type.family === 'text') return 'text'
  if (type.family === 'integer') return 'integer'
  if (type.family === 'alphabet-policy') return 'alphabet-policy'
  if (type.family === 'alphabet-direction') return 'alphabet-direction'
  if (type.family === 'words') return `words<${type.size},u8>`
  return `${type.family}<${type.size}>`
}

const isUint8Array = (value: unknown): value is Uint8Array => Object.prototype.toString.call(value) === '[object Uint8Array]'

export const isCryptoValue = (value: unknown): value is CryptoValue => {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const candidate = value as { type: unknown; bytes?: unknown; words?: unknown; symbol?: unknown; symbols?: unknown; value?: unknown }
  if (!isPortType(candidate.type)) return false
  if (candidate.type.family === 'alphabet-symbol') return typeof candidate.symbol === 'string'
  if (candidate.type.family === 'alphabet-text') return Array.isArray(candidate.symbols) && candidate.symbols.every((symbol) => typeof symbol === 'string' && [...symbol].length === 1)
  if (candidate.type.family === 'text') return Array.isArray(candidate.symbols) && candidate.symbols.every((symbol) => typeof symbol === 'string' && [...symbol].length === 1)
  if (candidate.type.family === 'integer') return typeof candidate.value === 'number'
  if (candidate.type.family === 'alphabet-policy') return candidate.value === 'preserve' || candidate.value === 'strict'
  if (candidate.type.family === 'alphabet-direction') return candidate.value === 'encrypt' || candidate.value === 'decrypt'
  return candidate.type.family === 'words' ? isUint8Array(candidate.words) : isUint8Array(candidate.bytes)
}

export const validSizedValue = (value: CryptoValue): boolean => {
  if ('symbol' in value) return true
  if (isAlphabetTextValue(value) || isTextValue(value) || isIntegerValue(value) || isAlphabetPolicyValue(value) || isAlphabetDirectionValue(value)) return true
  if (!isByteValue(value)) return false
  const size = value.type.size
  const contents = 'words' in value ? value.words : value.bytes
  if (!Number.isInteger(size) || size <= 0 || contents.length !== (value.type.family === 'bits' ? bytesForBits(size) : size)) return false
  return value.type.family !== 'bits' || size % 8 === 0 || contents[0] < 2 ** (size % 8)
}

export const cloneValue = (value: CryptoValue): CryptoValue => {
  if ('symbol' in value) return { type: { family: 'alphabet-symbol', mapping: value.type.mapping }, symbol: value.symbol }
  if (isAlphabetTextValue(value)) return { type: { family: 'alphabet-text', mapping: value.type.mapping }, symbols: [...value.symbols] }
  if (isTextValue(value)) return { type: { family: 'text' }, symbols: [...value.symbols] }
  if (isIntegerValue(value)) return { type: { family: 'integer', signed: true, safe: true }, value: value.value }
  if (isAlphabetPolicyValue(value)) return { type: { family: 'alphabet-policy' }, value: value.value }
  if (isAlphabetDirectionValue(value)) return { type: { family: 'alphabet-direction' }, value: value.value }
  if ('words' in value) return { type: { family: 'words', size: value.type.size, wordSize: 8 }, words: value.words.slice() }
  return value.type.family === 'bits'
    ? { type: { family: 'bits', size: value.type.size }, bytes: value.bytes.slice() }
    : { type: { family: 'bytes', size: value.type.size }, bytes: value.bytes.slice() }
}

export const bytesForBits = (size: number): number => Math.ceil(size / 8)

export const bitPosition = (size: number, index: number): readonly [number, number] => {
  const leading = size % 8 || 8
  if (index < leading) return [0, leading - 1 - index]
  const trailing = index - leading
  return [1 + Math.floor(trailing / 8), 7 - (trailing % 8)]
}

export const bitAt = (value: BitsValue, index: number): number => {
  const [byte, shift] = bitPosition(value.type.size, index)
  return (value.bytes[byte] >> shift) & 1
}

export const setBit = (value: Uint8Array, size: number, index: number): void => {
  const [byte, shift] = bitPosition(size, index)
  value[byte] |= 1 << shift
}

export const bits = (size: number, bytes: Uint8Array): BitsValue => ({ type: { family: 'bits', size }, bytes: bytes.slice() })
export const bytes = (size: number, value: Uint8Array): BytesValue => ({ type: { family: 'bytes', size }, bytes: value.slice() })
export const words = (size: number, value: Uint8Array): WordsValue => ({ type: { family: 'words', size, wordSize: 8 }, words: value.slice() })
export const text = (value: string): TextValue => ({ type: { family: 'text' }, symbols: [...value] })
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

export class CipherDiagnostic extends Error {
  constructor(readonly code: string, readonly message: string, readonly details: Diagnostic['details']) { super(message) }
}

export const isBitsValue = (value: CryptoValue): value is BitsValue => value.type.family === 'bits'

export const validKey = (value: IntegerValue): void => {
  if (!Number.isInteger(value.value)) throw new CipherDiagnostic('cipher.invalid-key', 'Cipher keys must be integers.', { reason: Number.isFinite(value.value) ? 'fraction' : 'non-integer' })
  if (!Number.isSafeInteger(value.value)) throw new CipherDiagnostic('cipher.invalid-key', 'Cipher keys must be safe integers.', { reason: 'unsafe' })
}

export const modulo = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus
export const multiplyModulo = (left: number, right: number, modulus: number): number => Number((BigInt(left) * BigInt(right)) % BigInt(modulus))

export const cipherText = (text: AlphabetTextValue, key: (position: number) => number, policy: AlphabetPolicyValue, mappings: ReadonlyMap<string, AlphabetMapping>): AlphabetTextValue => {
  const mapping = mappings.get(text.type.mapping)
  if (!mapping) throw new CipherDiagnostic('cipher.invalid-mapping', 'Cipher text references an unknown alphabet mapping.', { mapping: text.type.mapping })
  const positions = new Map(mapping.symbols.map((symbol, position) => [symbol, position]))
  const symbols = text.symbols.map((symbol, index) => {
    const position = positions.get(symbol)
    if (position === undefined) {
      if (policy.value === 'strict') throw new CipherDiagnostic('cipher.unmapped-symbol', 'Strict alphabet policy rejects symbols outside the mapping.', { symbol, index, strict: true })
      return symbol
    }
    return mapping.symbols[key(position)]
  })
  return { type: { family: 'alphabet-text', mapping: text.type.mapping }, symbols }
}


export const validPermutation = (values: unknown, size: number): values is readonly number[] =>
  Array.isArray(values)
  && values.length === size
  && Array.from({ length: size }, (_, index) => Object.prototype.hasOwnProperty.call(values, index) && Number.isSafeInteger(values[index]) && values[index] >= 0 && values[index] < size).every(Boolean)
  && new Set(values).size === size

export const readBits = (value: BitsValue, start: number, size: number): number => {
  let result = 0
  for (let index = 0; index < size; index += 1) result = (result << 1) | bitAt(value, start + index)
  return result
}

export const writeBits = (bytes: Uint8Array, size: number, start: number, value: number, width: number): void => {
  for (let index = 0; index < width; index += 1) if ((value & (1 << (width - index - 1))) !== 0) setBit(bytes, size, start + index)
}

export const rangeParameter = (parameters: Readonly<Record<string, unknown>>, size: number, node: AuthoredNode): Result<{ start: number; count: number }> => {
  const start = parameters.start === undefined ? 0 : parameters.start
  const count = parameters.count === undefined ? size - (typeof start === 'number' ? start : 0) : parameters.count
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || (start as number) < 0 || (count as number) < 0 || (start as number) + (count as number) > size) {
    return { ok: false, diagnostics: [diagnostic('operation.substitute-nibbles-range-out-of-bounds', 'Substitution range is outside the input width.', 'parameters', node)] }
  }
  return { ok: true, value: { start: start as number, count: count as number } }
}
