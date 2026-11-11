import { aesCipherGraph, aesKeyExpansionGraph } from 'crypto_graph'
import { serializeLessonLocales } from './serializeLessonLocales'
import enUS from './locales/en-US/uiOptimizationPrototype.json' with { type: 'json' }
import zhCN from './locales/zh-CN/uiOptimizationPrototype.json' with { type: 'json' }

const locales = { 'en-US': enUS, 'zh-CN': zhCN }

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

export const aes256PrototypeLocales = serializeLessonLocales(locales)
