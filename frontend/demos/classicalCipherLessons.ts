import type { LessonDocuments } from '../src/lesson_runtime'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const keyedAlphabet = 'QWERTYUIOPASDFGHJKLZXCVBNM'

const documents = (kind: 'substitution' | 'vigenere'): LessonDocuments => {
  const substitution = kind === 'substitution'
  const id = `${kind}-demo`
  const title = substitution ? 'Substitution cipher' : 'Vigenere cipher'
  const titleZh = substitution ? '替换密码' : '维吉尼亚密码'
  const operation = substitution ? 'classical.substitution@1' : 'classical.vigenere@1'
  const key = substitution ? keyedAlphabet : 'KEY'
  const plaintext = substitution ? 'ABC XYZ!' : 'ATTACK AT DAWN!'
  return {
    lesson: `version: 1
id: ${id}
default_locale: en-US
inputs:
  plaintext:
    type: {family: alphabet-text, mapping: latin}
    encoding: text
    default: "${plaintext}"
  key:
    type: {family: alphabet-text, mapping: latin}
    encoding: text
    default: "${key}"
  policy:
    type: {family: alphabet-policy}
    encoding: policy
    default: preserve
  direction:
    type: {family: alphabet-direction}
    encoding: direction
    default: encrypt
constants:
  decrypt-direction:
    type: {family: alphabet-direction}
    encoding: direction
    value: decrypt
graphs:
  cipher:
    alphabetMappings:
      - id: latin
        symbols: [${[...alphabet].join(', ')}]
    traceLevel: detail
    nodes:
      - id: text
        operation: core.source@1
        parameters: {type: {family: alphabet-text, mapping: latin}}
      - id: key
        operation: core.source@1
        parameters: {type: {family: alphabet-text, mapping: latin}}
      - id: policy
        operation: core.source@1
        parameters: {type: {family: alphabet-policy}}
      - id: direction
        operation: core.source@1
        parameters: {type: {family: alphabet-direction}}
      - id: cipher
        operation: ${operation}
        inputs:
          text: {node: text, port: value}
          key: {node: key, port: value}
          policy: {node: policy, port: value}
          direction: {node: direction, port: value}
    outputs:
      - {node: cipher, port: text}
steps:
  - id: enter-input
    inputs:
      - {input: plaintext, prompt: plaintext}
      - {input: key, prompt: key}
      - {input: policy, prompt: policy}
      - {input: direction, prompt: direction}
  - id: encrypt
    execute:
      graph: cipher
      bindings:
        text.value: {input: plaintext}
        key.value: {input: key}
        policy.value: {input: policy}
        direction.value: {input: direction}
    visualizer:
      id: classical-cipher@1
      bindings:
        plaintext: {input: plaintext}
        ciphertext: {step: encrypt, output: cipher.text}
        policy: {input: policy}
        trace: {step: encrypt, trace: output}
      options: {}
  - id: decrypt
    execute:
      graph: cipher
      bindings:
        text.value: {step: encrypt, output: cipher.text}
        key.value: {input: key}
        policy.value: {input: policy}
        direction.value: {constant: decrypt-direction}
    visualizer:
      id: classical-cipher@1
      bindings:
        plaintext: {step: encrypt, output: cipher.text}
        ciphertext: {step: decrypt, output: cipher.text}
        policy: {input: policy}
        trace: {step: decrypt, trace: output}
      options: {}
`,
    locales: {
      'en-US': `title: ${title}\nsummary: Run a ${kind} cipher through the shared classical cipher presentation.\ntexts: {plaintext: Plaintext, key: Key, policy: Policy, direction: Direction}`,
      'zh-CN': `title: ${titleZh}\nsummary: 使用共享的古典密码展示运行${substitution ? '替换' : '维吉尼亚'}密码。\ntexts: {plaintext: 明文, key: 密钥, policy: 策略, direction: 方向}`,
    },
  }
}

export const substitutionCipherDemoDocuments = documents('substitution')
export const vigenereCipherDemoDocuments = documents('vigenere')
