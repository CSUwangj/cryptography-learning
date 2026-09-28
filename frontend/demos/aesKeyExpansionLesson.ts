import type { LessonDocuments } from '../src/lesson_runtime'

// The `expand` graph's node list for a toy Nk=2, Nr=1 key schedule (not a real AES key size),
// built from the same registered AES key-expansion primitives (aes.key-word@1, aes.rot-word@1,
// aes.sub-word@1, aes.rcon-word@1, aes.word-xor@1, aes.round-key@1) and FIPS-197 node-naming
// convention as `aesKeyExpansionGraph` in `src/crypto_graph`, kept small enough to hand-author
// and review. Exported (rather than inlined below) so `lesson_runtime`'s test proving one
// execution feeds both a consuming step and this same key-expansion trace can share this exact
// node list instead of maintaining a second, drift-prone copy of it.
export const aesKeyExpansionGraphNodesYaml = `      - {id: key, operation: core.source@1, parameters: {type: {family: bits, size: 64}}}
      - {id: word-0, operation: aes.key-word@1, inputs: {key: {node: key, port: value}}, parameters: {index: 0}}
      - {id: word-1, operation: aes.key-word@1, inputs: {key: {node: key, port: value}}, parameters: {index: 1}}
      - {id: word-2-rot, operation: aes.rot-word@1, inputs: {value: {node: word-1, port: value}}}
      - {id: word-2-sub, operation: aes.sub-word@1, inputs: {value: {node: word-2-rot, port: value}}}
      - {id: word-2-rcon, operation: aes.rcon-word@1, parameters: {round: 1}}
      - {id: word-2-temp, operation: aes.word-xor@1, inputs: {left: {node: word-2-sub, port: value}, right: {node: word-2-rcon, port: value}}}
      - {id: word-2, operation: aes.word-xor@1, inputs: {left: {node: word-0, port: value}, right: {node: word-2-temp, port: value}}}
      - {id: word-3, operation: aes.word-xor@1, inputs: {left: {node: word-1, port: value}, right: {node: word-2, port: value}}}
      - {id: word-4-rot, operation: aes.rot-word@1, inputs: {value: {node: word-3, port: value}}}
      - {id: word-4-sub, operation: aes.sub-word@1, inputs: {value: {node: word-4-rot, port: value}}}
      - {id: word-4-rcon, operation: aes.rcon-word@1, parameters: {round: 2}}
      - {id: word-4-temp, operation: aes.word-xor@1, inputs: {left: {node: word-4-sub, port: value}, right: {node: word-4-rcon, port: value}}}
      - {id: word-4, operation: aes.word-xor@1, inputs: {left: {node: word-2, port: value}, right: {node: word-4-temp, port: value}}}
      - {id: word-5, operation: aes.word-xor@1, inputs: {left: {node: word-3, port: value}, right: {node: word-4, port: value}}}
      - {id: word-6-rot, operation: aes.rot-word@1, inputs: {value: {node: word-5, port: value}}}
      - {id: word-6-sub, operation: aes.sub-word@1, inputs: {value: {node: word-6-rot, port: value}}}
      - {id: word-6-rcon, operation: aes.rcon-word@1, parameters: {round: 3}}
      - {id: word-6-temp, operation: aes.word-xor@1, inputs: {left: {node: word-6-sub, port: value}, right: {node: word-6-rcon, port: value}}}
      - {id: word-6, operation: aes.word-xor@1, inputs: {left: {node: word-4, port: value}, right: {node: word-6-temp, port: value}}}
      - {id: word-7, operation: aes.word-xor@1, inputs: {left: {node: word-5, port: value}, right: {node: word-6, port: value}}}
      - id: round-key-0
        operation: aes.round-key@1
        inputs:
          w0: {node: word-0, port: value}
          w1: {node: word-1, port: value}
          w2: {node: word-2, port: value}
          w3: {node: word-3, port: value}
      - id: round-key-1
        operation: aes.round-key@1
        inputs:
          w0: {node: word-4, port: value}
          w1: {node: word-5, port: value}
          w2: {node: word-6, port: value}
          w3: {node: word-7, port: value}`

export const aesKeyExpansionDemoDocuments: LessonDocuments = {
  lesson: `version: 1
id: aes-key-expansion-demo
default_locale: en-US
inputs:
  key:
    type: {family: bits, size: 64}
    encoding: hex
    default: "0x0011223344556677"
constants: {}
graphs:
  expand:
    traceLevel: detail
    nodes:
${aesKeyExpansionGraphNodesYaml}
    outputs:
      - {node: round-key-0, port: value}
      - {node: round-key-1, port: value}
steps:
  - id: expand-key
    execute:
      graph: expand
      bindings:
        key.value: {input: key}
    visualizer:
      id: aes-key-expansion@1
      bindings:
        trace: {step: expand-key, trace: output}
      options: {}
`,
  locales: {
    'en-US': 'title: AES key expansion\nsummary: Expand a key and inspect the round keys it produces.\ntexts: {}',
    'zh-CN': 'title: AES 密钥扩展\nsummary: 扩展密钥并查看其生成的轮密钥。\ntexts: {}',
  },
}
