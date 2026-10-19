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
    value: "0xc491"
  teaching-spn-sbox:
    kind: table
    entryBits: 4
    value: [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7]
graphs:
  round:
    nodes:
      - id: state
        operation: core.source@1
        parameters: {type: {family: bits, size: 16}}
        role: state
        round: 0
        unit: 4
      - id: key
        operation: core.source@1
        parameters: {type: {family: bits, size: 16}}
        role: round-key
        round: 1
        unit: 4
      - id: key-mix
        operation: core.xor@1
        inputs:
          left: {node: state, port: value}
          right: {node: key, port: value}
        role: state
        round: 1
        unit: 4
      - id: substitute
        operation: core.substitute-nibbles@1
        inputs: {value: {node: key-mix, port: value}}
        parameters: {sBox: {constant: teaching-spn-sbox}}
        role: state
        round: 1
        unit: 4
      - id: permute
        operation: spn.permute-gather@1
        inputs: {value: {node: substitute, port: value}}
        parameters: {permutation: [3, 0, 1, 2]}
        role: state
        round: 1
        unit: 4
      - id: result
        operation: core.output@1
        inputs: {value: {node: permute, port: value}}
        role: state
        round: 1
        unit: 4
    outputs: [{node: result, port: value}]
steps:
  - id: execute
    execute:
      graph: round
      bindings:
        state.value: {input: state}
        key.value: {constant: key}
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
summary: Execute one composable substitution-permutation round.
texts:
  substitute-label: Nibble substitution
  permute-label: Nibble gather
  check-match: The round value is correct.
  check-mismatch: Check the round operations.
`,
    'zh-CN': `title: 教学型 SPN v2
summary: 执行一个可组合的替换置换网络轮。
texts:
  substitute-label: 半字节替换
  permute-label: 半字节聚集
  check-match: 轮值正确。
  check-mismatch: 请检查轮操作。
`,
  },
} as const
