import type { LessonDocuments } from '../src/lesson_runtime'
import {
  aesCipherGraph,
  aesInverseCipherGraph,
  aesKeyExpansionGraph,
  bits,
  compile,
  hex,
  type AuthoredGraph,
  type BitsValue,
} from '../src/crypto_graph'

// Cipher-only comparison graphs (ADR 0006 / #86): round keys are Lesson constants from a
// one-shot expansion so left+right node budgets fit platform caps and key-expansion avalanche
// stays out of scope (#67).

const kat = {
  128: { key: '000102030405060708090a0b0c0d0e0f', plaintext: '00112233445566778899aabbccddeeff', rounds: 10 },
  192: { key: '000102030405060708090a0b0c0d0e0f1011121314151617', plaintext: '00112233445566778899aabbccddeeff', rounds: 12 },
  256: { key: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', plaintext: '00112233445566778899aabbccddeeff', rounds: 14 },
} as const

const hexToBytes = (value: string): Uint8Array => Uint8Array.from(value.match(/../g)!.map((byte) => Number.parseInt(byte, 16)))

/** Flip bit index 0 (MSB of the first byte), matching CryptoGraph bit numbering. */
const flipBit0 = (value: BitsValue): BitsValue => {
  const bytes = new Uint8Array(value.bytes)
  bytes[0] ^= 0x80
  return bits(value.type.size, bytes)
}

const stripHex = (value: string): string => value.replace(/^0x/i, '')

const roundKeys = (variant: 128 | 192 | 256): readonly BitsValue[] => {
  const compiled = compile(aesKeyExpansionGraph(variant))
  if (!compiled.ok) throw new Error('unreachable: AES key-expansion graph must compile')
  const execution = compiled.value.execute({ 'key.value': bits(variant, hexToBytes(kat[variant].key)) })
  if (!execution.ok) throw new Error('unreachable: AES key expansion must execute')
  const keys: BitsValue[] = []
  for (let round = 0; round <= kat[variant].rounds; round += 1) {
    const value = execution.value.outputs[`round-key-${round}.value`]
    if (!value || !('bytes' in value) || value.type.family !== 'bits') throw new Error(`missing round-key-${round}`)
    keys.push(bits(128, value.bytes))
  }
  return keys
}

/** Encrypt the KAT plaintext so decrypt-comparison fixtures bind a real ciphertext, not the plaintext. */
const katCiphertext = (variant: 128 | 192 | 256, keys: readonly BitsValue[]): BitsValue => {
  const compiled = compile(aesCipherGraph(variant))
  if (!compiled.ok) throw new Error('unreachable: AES cipher graph must compile')
  const inputs = Object.fromEntries([
    ['plaintext.value', bits(128, hexToBytes(kat[variant].plaintext))],
    ...keys.map((value, round) => [`round-key-${round}.value`, value] as const),
  ])
  const execution = compiled.value.execute(inputs)
  if (!execution.ok) throw new Error('unreachable: AES encryption must execute')
  const output = execution.value.outputs[`cipher-${kat[variant].rounds}-add-round-key.value`]
  if (!output || !('bytes' in output) || output.type.family !== 'bits') throw new Error('missing ciphertext output')
  return bits(128, output.bytes)
}

const roundKeyConstantsYaml = (keys: readonly BitsValue[]): string =>
  keys.map((value, round) =>
    `  round-key-${round}: {type: {family: bits, size: 128}, encoding: hex-block, value: "${stripHex(hex(value))}"}`).join('\n')

const roundKeyBindingsYaml = (rounds: number, changedRoundKey?: number): string =>
  Array.from({ length: rounds + 1 }, (_, round) =>
    changedRoundKey === round
      ? `          round-key-${round}:\n            baseline: {constant: round-key-${round}}\n            changed: {input: changed_round_key}`
      : `          round-key-${round}: {constant: round-key-${round}}`).join('\n')

const localesFor = (variant: 128 | 192 | 256): LessonDocuments['locales'] => ({
  'en-US': `title: AES-${variant} comparison and avalanche\nsummary: Compare one plaintext or round-key bit change through AES encryption and decryption.\ntexts: {plaintext: Plaintext, ciphertext: Ciphertext, changed_plaintext: Changed plaintext, changed_ciphertext: Changed ciphertext, changed_round_key: Changed round key 0}`,
  'zh-CN': `title: AES-${variant} 比较与雪崩\nsummary: 比较明文或轮密钥单比特变化在 AES 加密与解密中的传播。\ntexts: {plaintext: 明文, ciphertext: 密文, changed_plaintext: 改变后的明文, changed_ciphertext: 改变后的密文, changed_round_key: 改变后的轮密钥 0}`,
})

const graphYaml = (id: string, graph: AuthoredGraph): string => `
  ${id}:
    traceLevel: detail
    nodes: ${JSON.stringify(graph.nodes)}
    outputs: ${JSON.stringify(graph.outputs)}`

export const aesCipherComparisonDocuments = (variant: 128 | 192 | 256): LessonDocuments => {
  const { plaintext, rounds } = kat[variant]
  const keys = roundKeys(variant)
  const ciphertext = katCiphertext(variant, keys)
  const changedPlaintext = stripHex(hex(flipBit0(bits(128, hexToBytes(plaintext)))))
  const changedCiphertext = stripHex(hex(flipBit0(ciphertext)))
  const changedRoundKey = stripHex(hex(flipBit0(keys[0])))
  return {
    lesson: `version: 1
id: aes-${variant}-comparison-demo
default_locale: en-US
inputs:
  plaintext:
    type: {family: bits, size: 128}
    encoding: hex-block
    default: "${plaintext}"
  changed_plaintext:
    type: {family: bits, size: 128}
    encoding: hex-block
    default: "${changedPlaintext}"
  ciphertext:
    type: {family: bits, size: 128}
    encoding: hex-block
    default: "${stripHex(hex(ciphertext))}"
  changed_ciphertext:
    type: {family: bits, size: 128}
    encoding: hex-block
    default: "${changedCiphertext}"
  changed_round_key:
    type: {family: bits, size: 128}
    encoding: hex-block
    default: "${changedRoundKey}"
constants:
${roundKeyConstantsYaml(keys)}
graphs:${graphYaml('encrypt', aesCipherGraph(variant))}${graphYaml('decrypt', aesInverseCipherGraph(variant))}
steps:
  - id: compare-plaintext
    visualizer:
      id: avalanche@1
      compare:
        kind: avalanche
        graph: encrypt
        bindings:
          plaintext:
            baseline: {input: plaintext}
            changed: {input: changed_plaintext}
${roundKeyBindingsYaml(rounds)}
        traceLevel: detail
  - id: compare-key
    visualizer:
      id: avalanche@1
      compare:
        kind: generic
        graph: encrypt
        bindings:
          plaintext: {input: plaintext}
${roundKeyBindingsYaml(rounds, 0)}
        traceLevel: detail
  - id: compare-ciphertext
    visualizer:
      id: avalanche@1
      compare:
        kind: generic
        graph: decrypt
        bindings:
          ciphertext:
            baseline: {input: ciphertext}
            changed: {input: changed_ciphertext}
${roundKeyBindingsYaml(rounds)}
        traceLevel: detail
  - id: compare-decrypt-key
    visualizer:
      id: avalanche@1
      compare:
        kind: generic
        graph: decrypt
        bindings:
          ciphertext: {input: ciphertext}
${roundKeyBindingsYaml(rounds, 0)}
        traceLevel: detail
`,
    locales: localesFor(variant),
  }
}

export const aes128CipherComparisonDocuments: LessonDocuments = aesCipherComparisonDocuments(128)
export const aes192CipherComparisonDocuments: LessonDocuments = aesCipherComparisonDocuments(192)
export const aes256CipherComparisonDocuments: LessonDocuments = aesCipherComparisonDocuments(256)
