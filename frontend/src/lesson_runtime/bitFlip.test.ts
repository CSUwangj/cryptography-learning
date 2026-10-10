import { describe, expect, it } from 'vitest'
import { hex } from '../crypto_graph'
import { compileLesson, createBrowserLessonSession, type LessonDocuments } from './index'

const documents: LessonDocuments = {
  lesson: `version: 1
id: bit-flip-experiment
default_locale: en-US
constants: {}
inputs:
  plaintext: {type: {family: bits, size: 16}, encoding: hex-block, default: "1234"}
  key: {type: {family: bits, size: 16}, encoding: hex-block, default: "5678"}
  changed_plaintext: {type: {family: bits, size: 16}, encoding: hex-block, default: "9234"}
  changed_key: {type: {family: bits, size: 16}, encoding: hex-block, default: "5678"}
graphs: {}
steps:
  - id: experiment
    bit_flip:
      - {input: plaintext, changed: changed_plaintext, prompt: plaintext}
      - {input: key, changed: changed_key, prompt: key}
`,
  locales: { 'en-US': 'title: Experiment\nsummary: Flip one input bit.\ntexts: {plaintext: Plaintext, key: Key}\n' },
}

const session = (inputDocuments = documents) => {
  const result = createBrowserLessonSession(inputDocuments, 'en-US')
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.value
}
const value = (s: ReturnType<typeof session>, id: string) => {
  const input = s.state().inputs[id]
  if (typeof input === 'string' || !('bytes' in input)) throw new Error('Expected decoded bits')
  return hex(input)
}

describe('one-bit Lesson experiment inputs', () => {
  it('flips first and last bits, switches source, and follows baseline edits without mutating the baseline', () => {
    const s = session()
    expect(value(s, 'changed_plaintext')).toBe('0x9234')
    expect(s.setBitFlip('experiment', 'plaintext', 15).ok).toBe(true)
    expect(value(s, 'changed_plaintext')).toBe('0x1235')
    expect(value(s, 'plaintext')).toBe('0x1234')
    expect(s.setBitFlip('experiment', 'key', 0).ok).toBe(true)
    expect(value(s, 'changed_plaintext')).toBe('0x1234')
    expect(value(s, 'changed_key')).toBe('0xd678')
    expect(s.setInput('key', 'abcd').ok).toBe(true)
    expect(value(s, 'changed_key')).toBe('0x2bcd')
    expect(s.setBitFlip('experiment', 'key', 15).ok).toBe(true)
    expect(value(s, 'changed_key')).toBe('0xabcc')
    expect(s.setInput('plaintext', '0000').ok).toBe(true)
    expect(value(s, 'changed_plaintext')).toBe('0x0000')
    s.dispose()
  })

  it('rejects invalid indices and sources, and never reuses a changed value from invalid input', () => {
    const s = session()
    for (const bit of [-1, 16, 1.5, NaN]) expect(s.setBitFlip('experiment', 'plaintext', bit).ok).toBe(false)
    expect(s.setBitFlip('experiment', 'changed_key', 0).ok).toBe(false)
    expect(s.setInput('plaintext', 'bad').ok).toBe(false)
    expect(typeof s.state().inputs.changed_plaintext).toBe('string')
    expect(s.setBitFlip('experiment', 'plaintext', 0).ok).toBe(false)
    expect(s.setInput('plaintext', 'ffff').ok).toBe(true)
    expect(value(s, 'changed_plaintext')).toBe('0x7fff')
    s.dispose()
  })

  it('numbers the significant bits rather than padding bits in packed input values', () => {
    const s = session({ ...documents, lesson: documents.lesson.replaceAll('size: 16', 'size: 4')
      .replaceAll('"1234"', '"1"').replaceAll('"9234"', '"9"').replaceAll('"5678"', '"2"') })
    expect(value(s, 'changed_plaintext')).toBe('0x9')
    expect(s.setBitFlip('experiment', 'plaintext', 3).ok).toBe(true)
    expect(value(s, 'changed_plaintext')).toBe('0x0')
    s.dispose()
  })

  it('rejects invalid source/target wiring at compilation', () => {
    for (const replacement of [
      'input: missing, changed: changed_plaintext',
      'input: plaintext, changed: plaintext',
      'input: plaintext, changed: key',
    ]) expect(compileLesson({ ...documents, lesson: documents.lesson.replace('input: plaintext, changed: changed_plaintext', replacement) }).ok).toBe(false)
    expect(compileLesson({ ...documents, lesson: documents.lesson.replace('prompt: key', 'prompt: missing') }).ok).toBe(false)
  })
})
