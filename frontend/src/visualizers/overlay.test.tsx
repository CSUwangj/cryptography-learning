import React from 'react'
import { I18nextProvider } from 'react-i18next'
import { cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import i18n from '../app/i18n'
import { executeWorkerRequest, type CryptoValue, type WorkerExecutionSnapshot } from '../crypto_graph'
import { compileLesson, type LessonDocuments } from '../lesson_runtime'
import lesson from '../lesson_runtime/fixture/overlay-three-anchor-v2.yaml?raw'
import en from '../lesson_runtime/fixture/overlay-three-anchor-v2-locales/en-US.yaml?raw'
import zh from '../lesson_runtime/fixture/overlay-three-anchor-v2-locales/zh-CN.yaml?raw'
import { RenderHost, type RenderHostProps } from './index'

const documents = { lesson, locales: { 'en-US': en, 'zh-CN': zh } }
const execute = (documents: LessonDocuments) => {
  const compiled = compileLesson(documents)
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
  const snapshots: Record<string, WorkerExecutionSnapshot> = {}
  for (const step of compiled.value.steps) {
    if (!step.execute) continue
    const inputs = Object.fromEntries(Object.entries(step.execute.bindings).map(([target, binding]) => [target,
      'input' in binding ? compiled.value.inputs[binding.input].default : 'constant' in binding ? compiled.value.constants[binding.constant] : snapshots[binding.step].outputs[compiled.value.graphs[compiled.value.steps.find((prior) => prior.id === binding.step)!.execute!.graph].outputAliases?.[binding.output] ?? binding.output],
    ])) as Record<string, CryptoValue>
    const result = executeWorkerRequest({ requestId: step.id, kind: 'execute', payload: { graph: compiled.value.graphs[step.execute.graph].graph, inputs } })
    if (result.kind !== 'snapshot') throw new Error(JSON.stringify(result))
    snapshots[step.id] = result.snapshot
  }
  const step = compiled.value.steps[1]
  const props: RenderHostProps = {
    execution: snapshots.cipher, compiledGraph: compiled.value.graphs.cipher, presentation: step.presentation,
    allSnapshots: snapshots, executionIdentity: 'cipher', dimensions: { width: 390, height: 844 }, reducedMotion: true,
    // The compiled overlay is wired with the schedule's actual snapshot and main-thread graph.
    overlay: step.overlay && { anchors: step.overlay.anchors, execution: snapshots.schedule, graph: compiled.value.graphs.schedule, presentation: compiled.value.steps[0].presentation! },
    lessonTexts: compiled.value.locales['en-US'].texts,
  }
  return { props, compiled: compiled.value, snapshots }
}
const mount = (props: RenderHostProps) => render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...props} /></I18nextProvider>)
afterEach(cleanup)

describe('Complete D overlay (#108)', () => {
  it('aligns exported repeat anchors to actual schedule rows and maps their exact bits', async () => {
    const authored = parse(lesson)
    authored.graphs.schedule.subgraphs = { exportKey: {
      inputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
      outputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
      nodes: [{ id: 'value', operation: 'core.output@1', inputs: { value: { node: '@input', port: 'value' } }, role: 'round-key', round: 2, unit: 32 }],
    } }
    const key = authored.graphs.schedule.nodes.find((node: { id: string }) => node.id === 'rk2')
    authored.graphs.schedule.nodes = authored.graphs.schedule.nodes.map((node: { id: string }) => node === key
      ? { id: 'rk2', repeat: { subgraph: 'exportKey', count: 1 }, inputs: key.inputs } : node)
    const aliased = { ...documents, lesson: stringify(authored) }
    expect(compileLesson(aliased).ok).toBe(true)
    const { props, compiled, snapshots } = execute(aliased)
    expect(compiled.steps[1].execute!.bindings['key2.value']).toEqual({ step: 'schedule', output: 'rk2.value' })
    expect(compiled.steps[1].overlay!.anchors[0]).toEqual({ cipherRow: 'key2.value', scheduleRow: 'rk2.1/value.value', round: 2 })
    const exported = snapshots.schedule.outputs['rk2.1/value.value']
    expect('bytes' in exported ? [...exported.bytes] : undefined).toEqual([0xea, 0xe1, 0xea, 0xef])
    const before = JSON.stringify(snapshots)
    const view = mount(props)
    const user = userEvent.setup()
    const cipherKey = view.container.querySelector('[data-row-id="key2.value"]') as HTMLElement
    expect(cipherKey).toHaveTextContent('0xeae1eaef')
    await user.click(within(cipherKey).getAllByRole('button')[5])
    await user.click(view.getByRole('button', { name: 'Open key schedule: Round key 2' }))
    const scheduleKey = view.container.querySelector('[data-row-id="mix2.value"] [data-lane-row="schedule:rk2.1/value.value"]') as HTMLElement
    expect(scheduleKey).toHaveTextContent('Round key 2')
    expect(within(scheduleKey).getAllByRole('button').filter((button) => button.dataset.state === 'related')).toHaveLength(1)
    expect(within(scheduleKey).getAllByRole('button')[5]).toHaveAttribute('data-state', 'related')
    await user.click(within(scheduleKey).getAllByRole('button')[5])
    expect(view.getByRole('status')).toHaveTextContent('rk2.1/value.value')
    await user.click(view.getByRole('button', { name: 'Close key schedule' }))
    expect(within(view.container.querySelector('[data-row-id="key2.value"]') as HTMLElement).getAllByRole('button')[5]).toHaveAttribute('data-state', 'related')
    expect(JSON.stringify(snapshots)).toBe(before)
  })

  it('starts closed and opens the complete schedule over the cipher controls at operation anchors', async () => {
    const { props, snapshots } = execute(documents)
    const before = JSON.stringify(snapshots)
    const view = mount(props)
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(0)
    await userEvent.click(view.getByRole('button', { name: 'Open key schedule: Round key 2' }))
    expect([...view.container.querySelectorAll('[data-lane-row]')].map((row) => row.getAttribute('data-lane-row'))).toEqual([
      'schedule:rk2.value', 'schedule:rot.value', 'schedule:sub.value', 'schedule:rcon.value', 'schedule:xor.value', 'schedule:rk1.value', 'schedule:input.value', 'schedule:rk0.value',
    ])
    expect(view.container.querySelector('[data-row-id="mix2.value"] [data-lane-row]')).toHaveAttribute('data-lane-row', 'schedule:rk2.value')
    expect(view.container.querySelector('[data-row-id="mix1.value"] [data-lane-row]')).toHaveAttribute('data-lane-row', 'schedule:rk1.value')
    expect(view.queryByRole('button', { name: /^Source 3 \(state.value\), Bit 0/ })).toBeNull()
    expect(JSON.stringify(snapshots)).toBe(before)
  })
  it('preserves exact cipher origin through openers and close, with a visible source-view status', async () => {
    const { props } = execute(documents)
    const view = mount(props)
    const user = userEvent.setup()
    const source = view.container.querySelector('[data-row-id="state.value"]') as HTMLElement
    await user.click(within(source).getAllByRole('button')[5])
    const before = view.getByRole('status').textContent
    await user.click(view.getByRole('button', { name: 'Open key schedule: Round key 2' }))
    expect(view.getByRole('status')).toHaveTextContent('Cipher')
    expect(view.getByRole('status')).toHaveTextContent('state.value')
    expect(view.getByRole('status')).toHaveTextContent('Bit 5:')
    await user.click(view.getByRole('button', { name: 'Open key schedule: Round key 1' }))
    expect(view.getByRole('status').textContent).toBe(before)
    await user.click(view.getByRole('button', { name: 'Close key schedule' }))
    expect(view.container.querySelector('[data-row-id="state.value"] button[aria-pressed="true"]')).toHaveAccessibleName(/Bit 5:/)
    expect(view.getByRole('status').textContent).toBe(before)
  })

  it('maps exact anchor bits without widening a related word or visiting an ancestor’s siblings', async () => {
    const { props } = execute(documents)
    const view = mount(props)
    const user = userEvent.setup()
    const opener = () => within(view.container.querySelector('[data-row-id="key1.value"]') as HTMLElement).getByRole('button', { name: 'Open key schedule: Round key 1' })
    await user.click(opener())
    const scheduleInput = () => view.container.querySelector('[data-lane-row="schedule:input.value"]') as HTMLElement
    await user.selectOptions(within(scheduleInput()).getByRole('combobox'), '32')
    await user.click(view.getByText('Close key schedule', { selector: 'button' }))
    const key1 = view.container.querySelector('[data-row-id="key1.value"]') as HTMLElement
    await user.click(within(key1).getAllByRole('button')[0])
    await user.click(opener())
    const partial = within(scheduleInput()).getAllByRole('button')[1]
    expect(partial).toHaveTextContent('1/32')
    expect(partial).toHaveAttribute('aria-pressed', 'false')
    expect(partial).toHaveAccessibleName(/Related bits 1\/32: 32$/)
    expect(view.container.querySelectorAll('[data-lane-row="schedule:rk1.value"] button[data-state="related"]')).toHaveLength(1)
    expect(view.container.querySelectorAll('[data-lane-row="schedule:rot.value"] button[data-state="related"]')).toHaveLength(0)
    await user.click(partial)
    expect(view.getByRole('status')).toHaveTextContent('Key schedule')
    expect(view.getByRole('status')).toHaveTextContent('Bits 32–63')
    expect(partial).toHaveAttribute('aria-pressed', 'true')
    await user.click(view.getByText('Close key schedule', { selector: 'button' }))
    expect(view.container.querySelectorAll('[data-row-id="key1.value"] button[data-state="related"]')).toHaveLength(32)
  })

  it('keeps toolbar visibility and explicit clear independent of the shared selection', async () => {
    const { props } = execute(documents)
    const view = mount(props)
    const user = userEvent.setup()
    const source = view.container.querySelector('[data-row-id="state.value"]') as HTMLElement
    await user.click(within(source).getAllByRole('button')[5])
    await user.click(view.getByRole('button', { name: 'Show key schedule' }))
    expect(view.getByRole('status')).toHaveTextContent('Bit 5:')
    await user.click(view.getByRole('button', { name: 'Clear selection' }))
    expect(view.getByRole('status')).toHaveTextContent('No bit selected')
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(8)
    await user.click(view.getByRole('button', { name: 'Show key schedule' }))
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(0)
  })

  it('retains original generation information and an expandable reference in reverse consumption order', async () => {
    const { props } = execute(documents)
    const view = mount(props)
    await userEvent.click(view.getByText('Show key schedule', { selector: 'button span' }))
    expect(view.container.querySelector('[data-lane-row="schedule:rk2.value"]')).toHaveTextContent('Generation row 8')
    expect(view.container.querySelector('[data-lane-row="schedule:rot.value"]')).toHaveTextContent('Generation row 3')
    const summary = view.getByText('Original generation order', { selector: 'summary' })
    await userEvent.click(summary)
    const reference = summary.parentElement as HTMLElement
    expect([...reference.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-row-id'))).toEqual([
      'input.value', 'rk0.value', 'rot.value', 'sub.value', 'rcon.value', 'xor.value', 'rk1.value', 'rk2.value',
    ])
    expect(reference).toHaveTextContent('Round key 2')
    expect(reference.querySelectorAll('button')).toHaveLength(0)
  })

  it('resets the shared origin and closes only on an actual direction change', async () => {
    const { props } = execute(documents)
    const language = i18n.cloneInstance({ lng: 'en-US' })
    const host = (direction: 'encrypt' | 'decrypt') => <I18nextProvider i18n={language}><RenderHost {...props} presentation={{ ...props.presentation!, kind: 'spn-cipher', direction }} /></I18nextProvider>
    const view = render(host('decrypt'))
    const source = view.container.querySelector('[data-row-id="state.value"]') as HTMLElement
    await userEvent.click(within(source).getAllByRole('button')[5])
    await userEvent.click(view.getByText('Show key schedule', { selector: 'button span' }))
    view.rerender(host('decrypt'))
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(8)
    expect(view.getByRole('status')).toHaveTextContent('Bit 5:')
    view.rerender(host('encrypt'))
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(0)
    expect(view.getByRole('status')).toHaveTextContent('No bit selected')
  })

  it('resets a different real Worker execution while preserving immutable prior snapshots', async () => {
    const { props, snapshots } = execute(documents)
    const before = JSON.stringify(snapshots)
    const view = mount(props)
    const source = view.container.querySelector('[data-row-id="state.value"]') as HTMLElement
    await userEvent.click(within(source).getAllByRole('button')[5])
    await userEvent.click(view.getByText('Show key schedule', { selector: 'button span' }))
    const changed = documents.lesson.replace("default: '0x00112233'", "default: '0x00000000'")
    const replacement = execute({ ...documents, lesson: changed })
    view.rerender(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...replacement.props} executionIdentity="new-result" /></I18nextProvider>)
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(0)
    expect(view.getByRole('status')).toHaveTextContent('No bit selected')
    expect(JSON.stringify(snapshots)).toBe(before)
    expect(replacement.snapshots.cipher.outputs).not.toEqual(snapshots.cipher.outputs)
  })

  it('resolves schedule operation labels from the Lesson locale inside the covering lane', async () => {
    const { props } = execute(documents)
    const view = mount(props)
    await userEvent.click(view.getByText('Show key schedule', { selector: 'button span' }))
    expect(view.container.querySelector('[data-lane-row="schedule:rot.value"]')).toHaveTextContent('RotWord')
    expect(view.container.querySelector('[data-lane-row="schedule:input.value"]')).toHaveTextContent('Input')
  })

  it('derives the overlay from bindings even when the source Step has no standalone presentation', async () => {
    const { props } = execute(documents)
    const view = mount({ ...props, overlay: { ...props.overlay!, presentation: undefined } })
    const opener = view.getByText('Show key schedule', { selector: 'button span' })
    expect(opener).toBeVisible()
    await userEvent.click(opener)
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(8)
  })

})
