import type { LessonDocuments } from '../src/lesson_runtime'

export const caesarV2Documents: LessonDocuments = {
  lesson: `version: 2
id: caesar-v2
default_locale: en-US
inputs:
  message: {type: {family: alphabet-text, mapping: custom}, encoding: text, default: "αβδ ?"}
  rotation: {type: {family: integer, signed: true, safe: true}, encoding: integer, default: 1}
  policy: {type: {family: alphabet-policy}, encoding: policy, default: preserve}
constants: {}
graphs:
  cipher:
    alphabetMappings: [{id: custom, symbols: [α, β, γ, δ, 😀]}]
    nodes:
      - {id: message, operation: core.source@1, parameters: {type: {family: alphabet-text, mapping: custom}}}
      - {id: rotation, operation: core.source@1, parameters: {type: {family: integer, signed: true, safe: true}}}
      - {id: policy, operation: core.source@1, parameters: {type: {family: alphabet-policy}}}
      - id: rotated
        operation: classical.caesar@1
        inputs:
          text: {node: message, port: value}
          shift: {node: rotation, port: value}
          policy: {node: policy, port: value}
    outputs: [{node: rotated, port: text}]
steps:
  - id: inputs
    inputs:
      - {input: message, prompt: message}
      - {input: rotation, prompt: rotation}
      - {input: policy, prompt: policy}
  - id: rotate
    execute:
      graph: cipher
      bindings:
        message.value: {input: message}
        rotation.value: {input: rotation}
        policy.value: {input: policy}
    visualizer:
      id: classical-cipher@1
      bindings:
        plaintext: {input: message}
        ciphertext: {step: rotate, output: rotated.text}
        policy: {input: policy}
        trace: {step: rotate, trace: output}
`,
  locales: {
    'en-US': 'title: Caesar reels\nsummary: Explore a custom alphabet.\ntexts: {message: Message, rotation: Signed shift, policy: Policy}\n',
    'zh-CN': 'title: 凯撒滚筒\nsummary: 探索自定义字母表。\ntexts: {message: 消息, rotation: 有符号位移, policy: 策略}\n',
  },
}
