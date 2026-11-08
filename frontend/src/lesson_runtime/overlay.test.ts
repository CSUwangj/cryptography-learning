import { parse, stringify } from 'yaml'
import { describe, expect, it } from 'vitest'
import { compileLesson } from './index'
import type { AuthoredGraph } from '../crypto_graph'
import aes from './fixture/aes192-v2.yaml?raw'
import en from './fixture/aes192-v2-locales/en-US.yaml?raw'
import zh from './fixture/aes192-v2-locales/zh-CN.yaml?raw'

const documents = { lesson: aes, locales: { 'en-US': en, 'zh-CN': zh } }

type OverlayFixture = {
  constants: Record<string, unknown>
  graphs: Record<string, AuthoredGraph>
  steps: {
    id: string
    prose?: string
    presentation?: { kind: string, overlay?: boolean }
    execute?: { bindings: Record<string, { step?: string, output?: string, constant?: string }> }
  }[]
}

const compile = (change: (lesson: OverlayFixture) => void) => {
  const lesson: OverlayFixture = parse(aes)
  lesson.steps[1].presentation!.overlay = true
  change(lesson)
  return compileLesson({ ...documents, lesson: stringify(lesson) })
}

describe('Binding-derived v2 overlay (#108)', () => {
  it('ships the AES-192 page with an explicit overlay request', () => {
    const result = compileLesson(documents)
    expect(result).toMatchObject({ ok: true, value: { steps: [expect.anything(), { overlay: { step: 'schedule', anchors: expect.any(Array) } }] } })
  })

  it('compiles all thirteen AES-192 anchors only on explicit request, following a renamed schedule Step', () => {
    const lesson = parse(aes)
    lesson.steps[0].id = 'derive'
    for (const binding of Object.values(lesson.steps[1].execute!.bindings) as { step?: string }[]) if (binding.step) binding.step = 'derive'
    lesson.steps[1].presentation!.overlay = true
    const result = compileLesson({ ...documents, lesson: stringify(lesson) })
    expect(result).toMatchObject({ ok: true, value: { steps: [expect.anything(), { overlay: {
      step: 'derive', anchors: Array.from({ length: 13 }, (_, round) => ({ cipherRow: `round-key-${round}.value`, scheduleRow: `round-key-${round}.value`, round })),
    } }] } })
  })
  it('rejects an overlay outside the supported cipher presentation', () => {
    expect(compile((lesson) => { lesson.steps[1].presentation!.kind = 'other' })).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.invalid-overlay-kind' })]) })
  })
  it('reports an explicitly requested overlay with no cross-Step round-key bindings', () => {
    expect(compile((lesson) => {
      lesson.constants.rk = { type: { family: 'bits', size: 128 }, encoding: 'hex', value: '0x00000000000000000000000000000000' }
      for (let round = 0; round < 13; round++) lesson.steps[1].execute!.bindings[`round-key-${round}.value`] = { constant: 'rk' }
    })).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.overlay-without-schedule-binding' })]) })
  })

  it('requires every cipher round key to participate in the schedule binding', () => {
    expect(compile((lesson) => { delete lesson.steps[1].execute!.bindings['round-key-4.value'] })).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'overlay.unbound-round-key' })]) })
  })

  it('rejects multiple schedule Steps even when each output is individually available', () => {
    expect(compile((lesson) => {
      const second = structuredClone(lesson.steps[0]); second.id = 'second'
      lesson.steps.splice(1, 0, second)
      lesson.steps[2].execute!.bindings['round-key-4.value'].step = 'second'
    })).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'overlay.multiple-schedule-steps' })]) })
  })

  it('rejects reuse of a schedule anchor by two cipher keys', () => {
    expect(compile((lesson) => { lesson.steps[1].execute!.bindings['round-key-4.value'].output = 'round-key-3.value' })).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'overlay.duplicate-anchor' })]) })
  })

  it('requires exported anchors to have round-key roles rather than recognizable names', () => {
    expect(compile((lesson) => { lesson.graphs.schedule.nodes.find((node) => node.id === 'round-key-4')!.role = 'state' })).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'overlay.not-round-key' })]) })
  })

  it('reports unequal anchor widths with the stable overlay diagnostic', () => {
    expect(compile((lesson) => { lesson.graphs.schedule.nodes.find((node) => node.id === 'round-key-2')!.inputs!.value.bits = [64, 64] })).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'overlay.width-mismatch' })]) })
  })

  it('rejects mixed generation order while retaining monotonic reversed consumption', () => {
    expect(compile((lesson) => {
      lesson.steps[1].execute!.bindings['round-key-3.value'].output = 'round-key-4.value'
      lesson.steps[1].execute!.bindings['round-key-4.value'].output = 'round-key-3.value'
    })).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'overlay.schedule-order-inconsistent' })]) })
  })

})

describe('Overlay boundaries retained by #108', () => {
  it.each([undefined, false])('does not create incidental anchors when overlay is %s', (overlay) => {
    const result = compile((lesson) => { lesson.steps[1].presentation!.overlay = overlay })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.steps[1].overlay).toBeUndefined()
  })

  it.each(['unavailable', 'forward', 'non-execute'])('keeps %s Step references in the existing diagnostic category', (kind) => {
    expect(compile((lesson) => {
      const cipher = lesson.steps[1]
      if (kind === 'forward') lesson.steps.push({ ...structuredClone(lesson.steps[0]), id: 'later' })
      if (kind === 'non-execute') lesson.steps.splice(1, 0, { id: 'later', prose: 'schedule-description' })
      cipher.execute!.bindings['round-key-4.value'].step = 'later'
    })).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.invalid-step-reference' })]) })
  })

  it('follows renamed graph nodes and accepts exported concat anchors with many output nodes', () => {
    const result = compile((lesson) => {
      const node = lesson.graphs.schedule.nodes.find((node) => node.id === 'round-key-1')!
      node.id = 'joined-key'
      lesson.graphs.schedule.outputs.find((output) => output.node === 'round-key-1')!.node = 'joined-key'
      lesson.steps[1].execute!.bindings['round-key-1.value'].output = 'joined-key.value'
    })
    expect(result).toMatchObject({ ok: true, value: { steps: [expect.anything(), { overlay: { anchors: expect.arrayContaining([{ cipherRow: 'round-key-1.value', scheduleRow: 'joined-key.value', round: 1 }]) } }] } })
  })
})
