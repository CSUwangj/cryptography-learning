import type { LessonDocuments } from '../src/lesson_runtime'

export const genericComparisonDocuments: LessonDocuments = {
  lesson: `version: 2
id: generic-comparison
default_locale: en-US
inputs:
  baseline-data: {type: {family: bits, size: 16}, encoding: hex, default: "0x0f0f"}
  changed-data: {type: {family: bits, size: 16}, encoding: hex, default: "0x00ff"}
  baseline-key: {type: {family: bits, size: 16}, encoding: hex, default: "0x0000"}
  changed-key: {type: {family: bits, size: 16}, encoding: hex, default: "0x8000"}
constants: {}
graphs:
  network:
    nodes:
      - {id: data, operation: core.source@1, parameters: {type: {family: bits, size: 16}}, role: state, round: 0, unit: 4}
      - {id: key, operation: core.source@1, parameters: {type: {family: bits, size: 16}}, role: round-key, round: 1, unit: 4}
      - {id: mix, operation: core.xor@1, inputs: {left: {node: data, port: value}, right: {node: key, port: value}}, role: state, round: 1, unit: 4}
      - {id: substitute, operation: core.substitute-nibbles@1, inputs: {value: {node: mix, port: value}}, parameters: {sBox: [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7]}, role: state, round: 1, unit: 4}
      - {id: result, operation: core.output@1, inputs: {value: {node: substitute, port: value}}, role: state, round: 1, unit: 4}
    outputs: [{node: result, port: value}]
steps:
  - id: inputs
    prose: introduction
    inputs:
      - {input: baseline-data, prompt: baseline-data}
      - {input: changed-data, prompt: changed-data}
      - {input: baseline-key, prompt: baseline-key}
      - {input: changed-key, prompt: changed-key}
  - id: compare
    presentation: {kind: spn-cipher}
    visualizer:
      id: avalanche@1
      compare:
        kind: generic
        graph: network
        traceLevel: detail
        bindings:
          data: {baseline: {input: baseline-data}, changed: {input: changed-data}}
          key: {baseline: {input: baseline-key}, changed: {input: changed-key}}
`,
  locales: {
    'en-US': `title: Compare a small network
summary: Compare two independent 16-bit inputs through XOR and nibble substitution.
texts:
  introduction: Enter valid data and key values for each execution, then continue to compare them.
  baseline-data: Baseline data
  changed-data: Changed data
  baseline-key: Baseline key
  changed-key: Changed key
`,
    'zh-CN': `title: 比较一个小型网络
summary: 比较两组独立的 16 位输入经过异或与半字节替换后的结果。
texts:
  introduction: 分别输入两次执行的数据和密钥，然后继续查看比较。
  baseline-data: 基准数据
  changed-data: 变化后数据
  baseline-key: 基准密钥
  changed-key: 变化后密钥
`,
  },
}
