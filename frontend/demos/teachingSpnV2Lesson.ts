export const teachingSpnV2DemoDocuments = {
  lesson: `version: 2
id: teaching-spn-v2
default_locale: en-US
inputs:
  state:
    type: {family: bits, size: 16}
    encoding: hex
    default: "0x1234"
constants:
  key:
    type: {family: bits, size: 16}
    encoding: hex
    value: "0x0f0f"
  expected:
    type: {family: bits, size: 16}
    encoding: hex
    value: "0x674b"
  teaching-spn-sbox:
    kind: table
    entryBits: 4
    value: [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7]
graphs:
  cipher:
    nodes:
      - id: state
        operation: core.source@1
        parameters: {type: {family: bits, size: 16}}
        role: state
        round: 0
        unit: 4
      - id: key-1
        operation: core.source@1
        parameters: {type: {family: bits, size: 16}}
        role: round-key
        round: 1
        unit: 4
      - id: key-mix-1
        operation: core.xor@1
        inputs:
          left: {node: state, port: value}
          right: {node: key-1, port: value}
        role: state
        round: 1
        unit: 4
      - id: substitute-1
        operation: core.substitute-nibbles@1
        inputs: {value: {node: key-mix-1, port: value}}
        parameters: {sBox: {constant: teaching-spn-sbox}}
        role: state
        round: 1
        unit: 4
      - id: permute-1
        operation: spn.permute-gather@1
        inputs: {value: {node: substitute-1, port: value}}
        parameters: {permutation: [3, 0, 1, 2]}
        role: state
        round: 1
        unit: 4
      - id: key-2
        operation: core.source@1
        parameters: {type: {family: bits, size: 16}}
        role: round-key
        round: 2
        unit: 4
      - id: key-mix-2
        operation: core.xor@1
        inputs:
          left: {node: permute-1, port: value}
          right: {node: key-2, port: value}
        role: state
        round: 2
        unit: 4
      - id: substitute-2
        operation: core.substitute-nibbles@1
        inputs: {value: {node: key-mix-2, port: value}}
        parameters: {sBox: {constant: teaching-spn-sbox}}
        role: state
        round: 2
        unit: 4
      - id: permute-2
        operation: spn.permute-gather@1
        inputs: {value: {node: substitute-2, port: value}}
        parameters: {permutation: [3, 0, 1, 2]}
        role: state
        round: 2
        unit: 4
      - id: key-3
        operation: core.source@1
        parameters: {type: {family: bits, size: 16}}
        role: round-key
        round: 3
        unit: 4
      - id: key-mix-3
        operation: core.xor@1
        inputs:
          left: {node: permute-2, port: value}
          right: {node: key-3, port: value}
        role: state
        round: 3
        unit: 4
      - id: substitute-3
        operation: core.substitute-nibbles@1
        inputs: {value: {node: key-mix-3, port: value}}
        parameters: {sBox: {constant: teaching-spn-sbox}}
        role: state
        round: 3
        unit: 4
      - id: permute-3
        operation: spn.permute-gather@1
        inputs: {value: {node: substitute-3, port: value}}
        parameters: {permutation: [3, 0, 1, 2]}
        role: state
        round: 3
        unit: 4
      - id: key-4
        operation: core.source@1
        parameters: {type: {family: bits, size: 16}}
        role: round-key
        round: 4
        unit: 4
      - id: key-mix-4
        operation: core.xor@1
        inputs:
          left: {node: permute-3, port: value}
          right: {node: key-4, port: value}
        role: state
        round: 4
        unit: 4
      - id: substitute-4
        operation: core.substitute-nibbles@1
        inputs: {value: {node: key-mix-4, port: value}}
        parameters: {sBox: {constant: teaching-spn-sbox}}
        role: state
        round: 4
        unit: 4
      - id: permute-4
        operation: spn.permute-gather@1
        inputs: {value: {node: substitute-4, port: value}}
        parameters: {permutation: [3, 0, 1, 2]}
        role: state
        round: 4
        unit: 4
      - id: result
        operation: core.output@1
        inputs: {value: {node: permute-4, port: value}}
        role: state
        round: 4
        unit: 4
    outputs: [{node: result, port: value}]
steps:
  - id: execute
    execute:
      graph: cipher
      bindings:
        state.value: {input: state}
        key-1.value: {constant: key}
        key-2.value: {constant: key}
        key-3.value: {constant: key}
        key-4.value: {constant: key}
    presentation:
      kind: spn-cipher
      labels:
        core.substitute-nibbles@1: substitute-label
        spn.permute-gather@1: permute-label
    check:
      kind: equal
      actual: {step: execute, output: result.value}
      expected: {constant: expected}
      feedback: {match: check-match, mismatch: check-mismatch}
`,
  locales: {
    'en-US': `title: Teaching SPN v2
summary: Follow four rounds of key mixing, nibble substitution and gather permutation on a 16-bit state.
texts:
  substitute-label: Nibble substitution
  permute-label: Nibble gather
  check-match: The four-round result is correct.
  check-mismatch: Check the four round operations.
`,
    'zh-CN': `title: 教学型 SPN v2
summary: 观察 16 位状态经过四轮密钥混合、半字节替换和聚集置换。
texts:
  substitute-label: 半字节替换
  permute-label: 半字节聚集
  check-match: 四轮结果正确。
  check-mismatch: 请检查四轮操作。
`,
  },
} as const
