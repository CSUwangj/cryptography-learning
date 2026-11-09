import type { LessonDocuments } from '../src/lesson_runtime'

export const dataAvalancheDocuments: LessonDocuments = {
  lesson: `version: 2
id: data-avalanche
default_locale: en-US
inputs:
  data: {type: {family: bits, size: 8}, encoding: hex, default: "0x00"}
  changed-data: {type: {family: bits, size: 8}, encoding: hex, default: "0x80"}
  other: {type: {family: bits, size: 8}, encoding: hex, default: "0x00"}
  changed-other: {type: {family: bits, size: 8}, encoding: hex, default: "0x00"}
constants:
  key: {type: {family: bits, size: 8}, encoding: hex, value: "0x5a"}
  equal-key: {type: {family: bits, size: 8}, encoding: hex, value: "0x5a"}
graphs:
  network:
    nodes:
      - {id: data, operation: core.source@1, parameters: {type: {family: bits, size: 8}}, unit: 4}
      - {id: other, operation: core.source@1, parameters: {type: {family: bits, size: 8}}, unit: 4}
      - {id: key, operation: core.source@1, parameters: {type: {family: bits, size: 8}}, unit: 4}
      - {id: mix, operation: core.xor@1, inputs: {left: {node: data, port: value}, right: {node: other, port: value}}, unit: 4}
      - {id: keyed, operation: core.xor@1, inputs: {left: {node: mix, port: value}, right: {node: key, port: value}}, unit: 4}
      - {id: result, operation: core.substitute-nibbles@1, inputs: {value: {node: keyed, port: value}}, parameters: {sBox: [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7]}, unit: 4}
    outputs: [{node: result, port: value}]
steps:
  - id: inputs
    prose: introduction
    inputs:
      - {input: data, prompt: data}
      - {input: other, prompt: other}
    bit_flip:
      - {input: data, changed: changed-data, prompt: data}
      - {input: other, changed: changed-other, prompt: other}
  - id: compare
    visualizer:
      id: avalanche@1
      compare:
        kind: avalanche
        sources: [data, other]
        graph: network
        traceLevel: detail
        bindings:
          data: {baseline: {input: data}, changed: {input: changed-data}}
          other: {baseline: {input: other}, changed: {input: changed-other}}
          key: {baseline: {constant: key}, changed: {constant: equal-key}}
`,
  locales: {
    'en-US': `title: Change one data bit
summary: Derive one changed bit from either baseline data input, then compare the executions.
texts:
  introduction: Choose a data source and one MSB-first bit. Changing the bit replaces the previous flip. Continue to execute the comparison.
  data: First data input
  other: Second data input
`,
    'zh-CN': `title: 改变一个数据位
summary: 从任一基准数据输入派生单比特变化，然后比较两次执行。
texts:
  introduction: 选择数据源和一个从最高有效位开始编号的位。更换位会替换之前的翻转。继续下一步执行比较。
  data: 第一组数据输入
  other: 第二组数据输入
`,
  },
}
