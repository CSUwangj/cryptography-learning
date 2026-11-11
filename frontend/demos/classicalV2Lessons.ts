import { stringify } from 'yaml'
import type { LessonDocuments } from '../src/lesson_runtime'
import { serializeLessonLocales } from './serializeLessonLocales'
import enUS from './locales/en-US/classicalV2.json' with { type: 'json' }
import zhCN from './locales/zh-CN/classicalV2.json' with { type: 'json' }

const locales = { 'en-US': enUS, 'zh-CN': zhCN }

// Public synthetic Lessons for the existing classical operation inventory.
export const classicalV2Documents = (kind: 'vigenere' | 'affine' | 'substitution' | 'transposition'): LessonDocuments => {
  const transposition = kind === 'transposition'
  const affine = kind === 'affine'
  const textType = transposition ? { family: 'text' } : { family: 'alphabet-text', mapping: 'custom' }
  const integerType = { family: 'integer', signed: true, safe: true }
  const inputs = {
    message: { type: textType, encoding: 'text', default: transposition ? '😀 😀BC' : 'α?β γδ😀α' },
    ...(affine ? {
      a: { type: integerType, encoding: 'integer', default: 2 },
      b: { type: integerType, encoding: 'integer', default: -1 },
    } : transposition ? {
      rows: { type: integerType, encoding: 'integer', default: 3 },
    } : {
      key: { type: textType, encoding: 'text', default: kind === 'vigenere' ? 'βγ' : '😀γδαβ' },
    }),
    ...(!transposition ? { policy: { type: { family: 'alphabet-policy' }, encoding: 'policy', default: 'preserve' } } : {}),
    ...(!affine ? { direction: { type: { family: 'alphabet-direction' }, encoding: 'direction', default: 'encrypt' } } : {}),
  }
  const bindings = Object.fromEntries(Object.keys(inputs).map((name) => [`${name}.value`, { input: name }]))
  const visualizer = (step: string, plaintext: object) => transposition ? {} : { visualizer: {
    id: 'classical-cipher@1', bindings: {
      plaintext, ciphertext: { step, output: 'cipher.text' }, policy: { input: 'policy' }, trace: { step, trace: 'output' },
    },
  } }
  return {
    lesson: stringify({
      version: 2, id: `${kind}-v2`, default_locale: 'en-US', inputs,
      constants: affine ? {} : { decrypt: { type: { family: 'alphabet-direction' }, encoding: 'direction', value: 'decrypt' } },
      graphs: { cipher: {
        ...(!transposition ? { alphabetMappings: [{ id: 'custom', symbols: [...'αβγδ😀'] }] } : {}),
        nodes: [
          ...Object.entries(inputs).map(([id, input]) => ({ id, operation: 'core.source@1', parameters: { type: input.type } })),
          { id: 'cipher', operation: `classical.${kind}@1`, inputs: Object.fromEntries(Object.keys(inputs).map((name) => [name === 'message' ? 'text' : name, { node: name, port: 'value' }])) },
        ],
        outputs: [{ node: 'cipher', port: 'text' }],
      } },
      steps: [
        { id: 'inputs', inputs: Object.keys(inputs).map((input) => ({ input, prompt: input })) },
        { id: 'encrypt', execute: { graph: 'cipher', bindings }, ...visualizer('encrypt', { input: 'message' }) },
        ...(!affine ? [{ id: 'decrypt', execute: { graph: 'cipher', bindings: {
          ...bindings, 'message.value': { step: 'encrypt', output: 'cipher.text' }, 'direction.value': { constant: 'decrypt' },
        } }, ...visualizer('decrypt', { step: 'encrypt', output: 'cipher.text' }) }] : []),
      ],
    }, { aliasDuplicateObjects: false }),
    locales: serializeLessonLocales(locales, (copy) => stringify({
      title: copy.titles[kind], summary: copy.summary, texts: copy.texts,
    })),
  }
}
