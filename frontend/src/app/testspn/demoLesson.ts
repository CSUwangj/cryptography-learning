import type { LessonDocuments } from '../../lesson_runtime'

export const teachingSpnDemoDocuments: LessonDocuments = {
  lesson: `version: 1
id: teaching-spn-demo
default_locale: en-US
inputs:
  plaintext:
    type: {family: bits, size: 16}
    encoding: hex
    default: "0x1234"
constants: {}
graphs:
  teaching-spn:
    nodes:
      - id: state
        operation: core.source@1
        parameters:
          type: {family: bits, size: 16}
      - id: round
        repeat: {subgraph: round, count: 2}
        inputs:
          permute: {node: state, port: value}
    outputs:
      - {node: round, port: permute}
    traceLevel: detail
    subgraphs:
      round:
        inputs:
          - {name: permute, type: {family: bits, size: 16}}
        outputs:
          - {name: permute, type: {family: bits, size: 16}}
        nodes:
          - id: key
            operation: core.source@1
            parameters:
              type: {family: bits, size: 16}
              roundKeys: ["0x0f0f", "0xf0f0"]
          - id: key-mix
            operation: core.xor@1
            inputs:
              left: {node: "@previous", port: permute}
              right: {node: key, port: value}
          - id: substitute
            operation: spn.substitute@1
            inputs:
              value: {node: key-mix, port: value}
            parameters:
              sBox: [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7]
          - id: permute
            operation: spn.permute@1
            inputs:
              value: {node: substitute, port: value}
            parameters:
              permutation: [0, 2, 1, 3]
steps:
  - id: visualize
    execute:
      graph: teaching-spn
      bindings:
        state.value: {input: plaintext}
    visualizer:
      id: teaching-spn@1
      bindings:
        trace: {step: visualize, trace: output}
      options: {}
`,
  locales: {
    'en-US': 'title: Teaching SPN\nsummary: Trace one SPN execution.\ntexts: {}',
    'zh-CN': 'title: 教学 SPN\nsummary: 跟踪一次 SPN 执行。\ntexts: {}',
  },
}
