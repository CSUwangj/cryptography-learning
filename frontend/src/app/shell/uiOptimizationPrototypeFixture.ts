import { aesCipherGraph, aesKeyExpansionGraph } from 'crypto_graph'

// Throwaway layout fixture: real AES-256 graph primitives, ending after SubBytes 1.
// Only round key 0 is needed; the remaining key schedule and rounds are outside this preview.
const initialKeyNodes = new Set(['key', 'word-0', 'word-1', 'word-2', 'word-3', 'round-key-0'])
const cipherNodes = new Set(['plaintext', 'cipher-0-add-round-key', 'cipher-1-sub-bytes'])
const nodes = [
  ...aesKeyExpansionGraph(256).nodes.filter((node) => initialKeyNodes.has(node.id)),
  ...aesCipherGraph(256).nodes.filter((node) => cipherNodes.has(node.id)),
]

export const aes256PrototypeLesson = `version: 1
id: aes-256-preview
default_locale: en-US
inputs:
  key:
    type: {family: bits, size: 256}
    encoding: hex-block
    default: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
  plaintext:
    type: {family: bits, size: 128}
    encoding: hex-block
    default: "00112233445566778899aabbccddeeff"
constants: {}
graphs:
  opening:
    traceLevel: detail
    nodes: ${JSON.stringify(nodes)}
    outputs: [{node: cipher-1-sub-bytes, port: value}]
steps:
  - id: inspect-opening
    prose: introduction
    execute:
      graph: opening
      bindings:
        key.value: {input: key}
        plaintext.value: {input: plaintext}
    presentation:
      kind: block-cipher
      algorithm: AES
      variant: 256
      direction: encrypt
`

export const aes256PrototypeLocales = {
  'en-US': `title: AES-256 — AddRoundKey and SubBytes
summary: Follow the complete 128-bit state through the opening two operations.
texts:
  introduction: |
    AES-256 uses a 256-bit key and a 128-bit block. The initial AddRoundKey combines the plaintext with the first 128 key bits; SubBytes then substitutes each byte.

    Select a bit to inspect its relationships. Scroll horizontally inside the trace to reach the final byte. This preview stops after SubBytes in round 1.
`,
  'zh-CN': `title: AES-256 — 轮密钥加与字节替换
summary: 沿着前两个操作观察完整的 128 位状态。
texts:
  introduction: |
    AES-256 使用 256 位密钥和 128 位分组。初始轮密钥加将明文与密钥的前 128 位进行异或，随后 SubBytes 对每个字节进行替换。

    点击任意一位可以查看关联关系。在画卷内部横向滚动可以到达最后一个字节。本原型展示到第一轮 SubBytes 为止。
`,
}
