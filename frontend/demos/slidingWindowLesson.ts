export const slidingWindowDemoDocuments = {
  lesson: `version: 2
id: sliding-window
default_locale: en-US
inputs:
  key: {type: {family: bits, size: 32}, encoding: hex, default: '0x12345678'}
constants: {}
graphs:
  schedule:
    nodes:
      - {id: key, operation: core.source@1, parameters: {type: {family: bits, size: 32}}, role: state, unit: 4}
      - {id: rk1, operation: core.output@1, inputs: {value: {node: key, port: value, bits: [0,16]}}, role: round-key, round: 1, unit: 4}
      - {id: rk2, operation: core.output@1, inputs: {value: {node: key, port: value, bits: [4,16]}}, role: round-key, round: 2, unit: 4}
      - {id: rk3, operation: core.output@1, inputs: {value: {node: key, port: value, bits: [8,16]}}, role: round-key, round: 3, unit: 4}
      - {id: rk4, operation: core.output@1, inputs: {value: {node: key, port: value, bits: [12,16]}}, role: round-key, round: 4, unit: 4}
    outputs: [{node: rk1, port: value}, {node: rk2, port: value}, {node: rk3, port: value}, {node: rk4, port: value}]
steps:
  - id: inspect
    presentation: {kind: spn-cipher, mode: key-expansion, labels: {core.source@1: master-key}}
    execute: {graph: schedule, bindings: {key.value: {input: key}}}
`,
  locales: {
    'en-US': `title: Sliding-window key schedule
summary: Each round key is a 16-bit window of the original 32-bit master key. Rounds 1–4 start at bits 0, 4, 8 and 12, counted from the most significant bit. Select a group to inspect its exact structural dependencies.
texts:
  master-key: Master key
`,
    'zh-CN': `title: 滑动窗口密钥调度
summary: 每个轮密钥都是原始 32 位主密钥中的一个 16 位窗口。第 1–4 轮分别从第 0、4、8、12 位开始，从最高有效位起计数。选择一个组即可检查它的精确结构依赖。
texts:
  master-key: 主密钥
`,
  },
} as const
