import type { LessonDocuments } from '../src/lesson_runtime'
import { aesCipherGraph, aesInverseCipherGraph, aesKeyExpansionGraph } from '../src/crypto_graph'

// Real AES (Nk/Nr from FIPS-197) rather than a hand-authored toy schedule: the known-answer
// vectors need the true key schedule and cipher, so this serializes the same tested
// `aesKeyExpansionGraph`/`aesCipherGraph`/`aesInverseCipherGraph` builders to YAML flow syntax
// (valid YAML is a JSON superset) instead of hand-typing that many node entries and risking
// drift from those builders.
const kat = {
  128: {
    key: '000102030405060708090a0b0c0d0e0f',
    plaintext: '00112233445566778899aabbccddeeff',
    rounds: 10,
  },
  192: {
    key: '000102030405060708090a0b0c0d0e0f1011121314151617',
    plaintext: '00112233445566778899aabbccddeeff',
    rounds: 12,
  },
  256: {
    key: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    plaintext: '00112233445566778899aabbccddeeff',
    rounds: 14,
  },
} as const

const roundKeyBindings = (step: string, rounds: number): string =>
  Array.from({ length: rounds + 1 }, (_, round) => `        round-key-${round}.value: {step: ${step}, output: round-key-${round}.value}`).join('\n')

const locales = {
  128: {
    'en-US': 'title: AES-128 encryption and decryption\nsummary: Encrypt a block, then decrypt it back with the same round keys.\ntexts: {key: Key, plaintext: Plaintext}',
    'zh-CN': 'title: AES-128 加密与解密\nsummary: 加密一个数据块，再用相同的轮密钥解密回来。\ntexts: {key: 密钥, plaintext: 明文}',
  },
  192: {
    'en-US': 'title: AES-192 encryption and decryption\nsummary: Encrypt a block, then decrypt it back with the same round keys.\ntexts: {key: Key, plaintext: Plaintext}',
    'zh-CN': 'title: AES-192 加密与解密\nsummary: 加密一个数据块，再用相同的轮密钥解密回来。\ntexts: {key: 密钥, plaintext: 明文}',
  },
  256: {
    'en-US': 'title: AES-256 encryption and decryption\nsummary: Encrypt a block, then decrypt it back with the same round keys.\ntexts: {key: Key, plaintext: Plaintext}',
    'zh-CN': 'title: AES-256 加密与解密\nsummary: 加密一个数据块，再用相同的轮密钥解密回来。\ntexts: {key: 密钥, plaintext: 明文}',
  },
} as const

const presentationYaml = (variant: 128 | 192 | 256, kind: 'key-expansion' | 'encrypt' | 'decrypt'): string => {
  // AES-128 keeps the #84 descriptor-free shape (generic ExecutionTrace). #85 presentation
  // metadata is only for the new 192/256 Lesson paths.
  if (variant === 128) return ''
  if (kind === 'key-expansion') {
    return `
    presentation:
      kind: key-expansion
      algorithm: AES
      variant: ${variant}`
  }
  return `
    presentation:
      kind: block-cipher
      algorithm: AES
      variant: ${variant}
      direction: ${kind}`
}

export const aesCipherDemoDocuments = (variant: 128 | 192 | 256): LessonDocuments => {
  const { key, plaintext, rounds } = kat[variant]
  const expand = aesKeyExpansionGraph(variant)
  const encrypt = aesCipherGraph(variant)
  const decrypt = aesInverseCipherGraph(variant)
  return {
    lesson: `version: 1
id: aes-${variant}-cipher-demo
default_locale: en-US
inputs:
  key:
    type: {family: bits, size: ${variant}}
    encoding: hex-block
    default: "${key}"
  plaintext:
    type: {family: bits, size: 128}
    encoding: hex-block
    default: "${plaintext}"
constants: {}
graphs:
  expand:
    traceLevel: detail
    nodes: ${JSON.stringify(expand.nodes)}
    outputs: ${JSON.stringify(expand.outputs)}
  encrypt:
    traceLevel: detail
    nodes: ${JSON.stringify(encrypt.nodes)}
    outputs: ${JSON.stringify(encrypt.outputs)}
  decrypt:
    traceLevel: detail
    nodes: ${JSON.stringify(decrypt.nodes)}
    outputs: ${JSON.stringify(decrypt.outputs)}
steps:
  - id: enter-input
    inputs:
      - {input: key, prompt: key}
      - {input: plaintext, prompt: plaintext}
  - id: expand-key
    execute:
      graph: expand
      bindings:
        key.value: {input: key}${presentationYaml(variant, 'key-expansion')}
  - id: encrypt
    execute:
      graph: encrypt
      bindings:
        plaintext.value: {input: plaintext}
${roundKeyBindings('expand-key', rounds)}${presentationYaml(variant, 'encrypt')}
  - id: decrypt
    execute:
      graph: decrypt
      bindings:
        ciphertext.value: {step: encrypt, output: cipher-${rounds}-add-round-key.value}
${roundKeyBindings('expand-key', rounds)}${presentationYaml(variant, 'decrypt')}
`,
    locales: locales[variant],
  }
}

export const aes128CipherDemoDocuments: LessonDocuments = aesCipherDemoDocuments(128)
export const aes192CipherDemoDocuments: LessonDocuments = aesCipherDemoDocuments(192)
export const aes256CipherDemoDocuments: LessonDocuments = aesCipherDemoDocuments(256)
