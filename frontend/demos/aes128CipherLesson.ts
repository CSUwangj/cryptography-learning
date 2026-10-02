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
    ciphertext: '69c4e0d86a7b0430d8cdb78070b4c55a',
  },
  192: {
    key: '000102030405060708090a0b0c0d0e0f1011121314151617',
    plaintext: '00112233445566778899aabbccddeeff',
    ciphertext: 'dda97ca4864cdfe06eaf70a0ec0d7191',
  },
  256: {
    key: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    plaintext: '00112233445566778899aabbccddeeff',
    ciphertext: '8ea2b7ca516745bfeafc49904b496089',
  },
} as const

/** Single Lesson with expand-key, encrypt, and decrypt steps sharing one authoritative key schedule execution. */
export const aesCipherDemoDocuments = (variant: 128 | 192 | 256): LessonDocuments => {
  const schedule = aesKeyExpansionGraph(variant)
  const encrypt = aesCipherGraph(variant)
  const decrypt = aesInverseCipherGraph(variant)
  const nr = { 128: 10, 192: 12, 256: 14 }[variant]
  return {
    lesson: `version: 1
id: aes-${variant}-demo
default_locale: en-US
inputs:
  key:
    type: {family: bits, size: ${variant}}
    encoding: hex-block
    default: "${kat[variant].key}"
  plaintext:
    type: {family: bits, size: 128}
    encoding: hex-block
    default: "${kat[variant].plaintext}"
  ciphertext:
    type: {family: bits, size: 128}
    encoding: hex-block
    default: "${kat[variant].ciphertext}"
constants: {}
graphs:
  expand:
    traceLevel: detail
    nodes: ${JSON.stringify(schedule.nodes)}
    outputs: ${JSON.stringify(schedule.outputs)}
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
      - {input: ciphertext, prompt: ciphertext}
  - id: expand-key
    execute:
      graph: expand
      bindings:
        key.value: {input: key}
    presentation:
      kind: key-expansion
      algorithm: AES
      variant: ${variant}
  - id: encrypt
    execute:
      graph: encrypt
      bindings:
        plaintext.value: {input: plaintext}${Array.from({ length: nr + 1 }, (_, r) => `
        round-key-${r}.value: {step: expand-key, output: round-key-${r}.value}`).join('')}
    presentation:
      kind: block-cipher
      algorithm: AES
      variant: ${variant}
      direction: encrypt
  - id: decrypt
    execute:
      graph: decrypt
      bindings:
        ciphertext.value: {input: ciphertext}${Array.from({ length: nr + 1 }, (_, r) => `
        round-key-${r}.value: {step: expand-key, output: round-key-${r}.value}`).join('')}
    presentation:
      kind: block-cipher
      algorithm: AES
      variant: ${variant}
      direction: decrypt
`,
    locales: {
      'en-US': `title: AES-${variant} cipher\nsummary: Encrypt and decrypt blocks with the same key, inspecting the shared key schedule.\ntexts: {key: Key, plaintext: Plaintext, ciphertext: Ciphertext}`,
      'zh-CN': `title: AES-${variant} 密码\nsummary: 用同一密钥加密和解密数据块，查看共享的密钥编排。\ntexts: {key: 密钥, plaintext: 明文, ciphertext: 密文}`,
    },
  }
}
