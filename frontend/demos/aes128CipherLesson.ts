import type { LessonDocuments } from '../src/lesson_runtime'
import { aesCipherGraph, aesInverseCipherGraph, aesKeyExpansionGraph } from '../src/crypto_graph'

// Real AES-128 (Nk=4, Nr=10) rather than a hand-authored toy schedule (as in
// `aesKeyExpansionLesson.ts`'s Nk=2 demo): the FIPS-197 known-answer vector this fixture checks
// needs the true key schedule and 10-round cipher, so this serializes the same tested
// `aesKeyExpansionGraph`/`aesCipherGraph`/`aesInverseCipherGraph` builders to YAML flow syntax
// (valid YAML is a JSON superset) instead of hand-typing that many node entries and risking
// drift from those builders.
const expand = aesKeyExpansionGraph(128)
const encrypt = aesCipherGraph()
const decrypt = aesInverseCipherGraph()

const roundKeyBindings = (step: string): string =>
  Array.from({ length: 11 }, (_, round) => `        round-key-${round}.value: {step: ${step}, output: round-key-${round}.value}`).join('\n')

export const aes128CipherDemoDocuments: LessonDocuments = {
  lesson: `version: 1
id: aes-128-cipher-demo
default_locale: en-US
inputs:
  key:
    type: {family: bits, size: 128}
    encoding: hex-block
    default: "000102030405060708090a0b0c0d0e0f"
  plaintext:
    type: {family: bits, size: 128}
    encoding: hex-block
    default: "00112233445566778899aabbccddeeff"
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
        key.value: {input: key}
  - id: encrypt
    execute:
      graph: encrypt
      bindings:
        plaintext.value: {input: plaintext}
${roundKeyBindings('expand-key')}
  - id: decrypt
    execute:
      graph: decrypt
      bindings:
        ciphertext.value: {step: encrypt, output: cipher-10-add-round-key.value}
${roundKeyBindings('expand-key')}
`,
  locales: {
    'en-US': 'title: AES-128 encryption and decryption\nsummary: Encrypt a block, then decrypt it back with the same round keys.\ntexts: {key: Key, plaintext: Plaintext}',
    'zh-CN': 'title: AES-128 加密与解密\nsummary: 加密一个数据块，再用相同的轮密钥解密回来。\ntexts: {key: 密钥, plaintext: 明文}',
  },
}
