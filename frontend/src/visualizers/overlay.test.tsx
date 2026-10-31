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
import aes from '../lesson_runtime/fixture/aes192-v2.yaml?raw'
import aesEn from '../lesson_runtime/fixture/aes192-v2-locales/en-US.yaml?raw'
import aesZh from '../lesson_runtime/fixture/aes192-v2-locales/zh-CN.yaml?raw'
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
const mount = (props: RenderHostProps, language = 'en-US') => render(<I18nextProvider i18n={i18n.cloneInstance({ lng: language })}><RenderHost {...props} /></I18nextProvider>)
afterEach(cleanup)

describe('Complete D overlay (#108)', () => {
  it.each(['en-US', 'zh-CN'])('toggles the complete schedule from generic bound row controls without changing origin or sizes in %s (#109 correction)', async (language) => {
    const { props } = execute(documents)
    const view = mount(props, language)
    const user = userEvent.setup()
    const show = language === 'zh-CN' ? '显示密钥编排' : 'Show key schedule'
    const close = language === 'zh-CN' ? '关闭密钥编排' : 'Close key schedule'
    const toolbar = within(view.getByRole('toolbar'))
    const rowControl = (id: string, name: string) => within(view.container.querySelector(`[data-row-id="${id}"]`) as HTMLElement).getByRole('button', { name })
    const keys = ['key2.value', 'key1.value', 'key0.value']
    const cipherMode = view.getByRole('combobox')
    await user.selectOptions(cipherMode, '8')
    await user.click(toolbar.getByRole('button', { name: show }))
    await user.selectOptions(view.getAllByRole('combobox')[1], '32')
    await user.click(toolbar.getByRole('button', { name: close }))
    await user.click(within(view.container.querySelector('[data-row-id="state.value"]') as HTMLElement).getAllByRole('button')[1])
    const origin = view.getByRole('status').textContent
    expect(origin).toContain('state.value')
    expect(origin).toContain('8–15')
    for (const key of keys) {
      expect(rowControl(key, show)).toHaveAttribute('aria-pressed', 'false')
      expect(rowControl(key, show).textContent).toBe(show)
    }
    await user.click(rowControl(keys[0], show))
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(8)
    for (const key of keys) {
      expect(rowControl(key, close)).toHaveAttribute('aria-pressed', 'true')
      expect(rowControl(key, close).textContent).toBe(close)
    }
    expect(toolbar.getByRole('button', { name: close })).toHaveAttribute('aria-pressed', 'true')
    expect(view.getAllByRole('combobox')[1]).toHaveValue('32')
    expect(cipherMode).toHaveValue('8')
    expect(view.getByRole('status').textContent).toBe(origin)
    await user.click(rowControl(keys[1], close))
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(0)
    for (const key of keys) expect(rowControl(key, show)).toHaveAttribute('aria-pressed', 'false')
    expect(toolbar.getByRole('button', { name: show })).toHaveAttribute('aria-pressed', 'false')
    expect(view.getByRole('status').textContent).toBe(origin)
    expect(cipherMode).toHaveValue('8')
    expect(view.container.querySelector('[data-row-id="state.value"] button[aria-pressed="true"]')).toHaveAccessibleName(/8–15/)
    await user.click(rowControl(keys[2], show))
    expect(view.getAllByRole('combobox')[1]).toHaveValue('32')
    expect(cipherMode).toHaveValue('8')
    expect(view.getByRole('status').textContent).toBe(origin)
  })

  it.each(['en-US', 'zh-CN'])('uses one stateful whole-schedule toggle and names the common selection units in %s', async (language) => {
    const { props } = execute(documents)
    const view = mount(props, language)
    const user = userEvent.setup()
    const chinese = language === 'zh-CN'
    const show = chinese ? '显示密钥编排' : 'Show key schedule'
    const close = chinese ? '关闭密钥编排' : 'Close key schedule'
    const labels = chinese ? ['4 位（半字节）', '8 位（字节）', '32 位（字）'] : ['4 bits (nibble)', '8 bits (byte)', '32 bits (word)']
    const mode = view.getByRole('combobox')
    for (const [index, size] of ['4', '8', '32'].entries()) expect(within(mode).getByRole('option', { name: labels[index] })).toHaveValue(size)
    expect(within(view.container.querySelector('[data-row-id="key1.value"]') as HTMLElement).getByRole('button', { name: show })).toBeVisible()
    const toggle = within(view.getByRole('toolbar')).getByRole('button', { name: show })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(within(view.getByRole('toolbar')).getByRole('button', { name: close })).toBe(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(8)
    const scheduleMode = view.getAllByRole('combobox')[1]
    for (const [index, size] of ['4', '8', '32'].entries()) expect(within(scheduleMode).getByRole('option', { name: labels[index] })).toHaveValue(size)
    expect(within(view.container.querySelector('[data-row-id="key1.value"]') as HTMLElement).getByRole('button', { name: close })).toHaveAttribute('aria-pressed', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAccessibleName(show)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(0)
    await user.click(toggle)
    expect(toggle).toHaveAccessibleName(close)
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(8)
  })

  it('offers one independent whole-view unit control for cipher and covering schedule (#109)', async () => {
    const { props } = execute({ lesson: aes, locales: { 'en-US': aesEn, 'zh-CN': aesZh } })
    const view = mount(props)
    const user = userEvent.setup()
    expect(view.getAllByRole('combobox')).toHaveLength(1)
    const cipherMode = view.getByRole('combobox', { name: 'AES-192 encryption: Selection unit' })
    expect(within(cipherMode).getAllByRole('option').map((option) => (option as HTMLOptionElement).value)).toEqual(['1', '2', '4', '8', '16', '32', '64', '128'])
    await user.selectOptions(cipherMode, '128')
    const plaintext = within(view.container.querySelector('[data-row-id="plaintext.value"]') as HTMLElement).getByRole('button')
    expect(plaintext).toHaveTextContent(/^0x00112233445566778899aabbccddeeff$/)
    expect(plaintext).toHaveAttribute('title', 'Source 0 (plaintext.value), Bits 0–127: 0x00112233445566778899aabbccddeeff')
    await user.click(plaintext)
    expect(view.getByRole('status')).toHaveTextContent('Bits 0–127: 0x00112233445566778899aabbccddeeff')
    expect([...view.container.querySelectorAll('[data-row-id]')].every((row) => row.querySelectorAll('button[title]').length === 1)).toBe(true)
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    expect(view.getAllByRole('combobox')).toHaveLength(2)
    const scheduleMode = view.getByRole('combobox', { name: 'Key schedule overlay: Selection unit' })
    expect(within(scheduleMode).getAllByRole('option').map((option) => (option as HTMLOptionElement).value)).toEqual(['1', '2', '4', '8', '16', '32', '64'])
    expect(scheduleMode).toHaveValue('1')
    await user.selectOptions(scheduleMode, '64')
    expect(cipherMode).toHaveValue('128')
    expect(view.container.querySelector('[data-lane-row="schedule:key.value"]')?.querySelectorAll('button')).toHaveLength(3)
    expect(view.container.querySelector('[data-lane-row="schedule:round-key-1.value"]')?.querySelectorAll('button')).toHaveLength(2)
    expect([...view.container.querySelectorAll('[data-lane-row]')].every((row) => [2, 3].includes(row.querySelectorAll('button').length))).toBe(true)
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Close key schedule' }))
    expect(view.getAllByRole('combobox')).toHaveLength(1)
    expect(cipherMode).toHaveValue('128')
    await user.selectOptions(cipherMode, '8')
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    expect(view.getByRole('combobox', { name: 'Key schedule overlay: Selection unit' })).toHaveValue('64')
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Close key schedule' }))
    expect([...view.container.querySelectorAll('[data-row-id]')].every((row) => row.querySelectorAll('button[title]').length === 16)).toBe(true)
  }, 60000)

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
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    const scheduleKey = view.container.querySelector('[data-row-id="mix2.value"] [data-lane-row="schedule:rk2.1/value.value"]') as HTMLElement
    expect(within(scheduleKey.closest('tr')!).getByRole('cell', { name: 'Round key 2' })).toBeVisible()
    expect(within(scheduleKey).getAllByRole('button').filter((button) => button.dataset.state === 'related')).toHaveLength(1)
    expect(within(scheduleKey).getAllByRole('button')[5]).toHaveAttribute('data-state', 'related')
    await user.click(within(scheduleKey).getAllByRole('button')[5])
    expect(view.getByRole('status')).toHaveTextContent('rk2.1/value.value')
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Close key schedule' }))
    expect(within(view.container.querySelector('[data-row-id="key2.value"]') as HTMLElement).getAllByRole('button')[5]).toHaveAttribute('data-state', 'related')
    expect(JSON.stringify(snapshots)).toBe(before)
  })

  it('starts closed and opens the complete schedule over the cipher controls at operation anchors', async () => {
    const { props, snapshots } = execute(documents)
    const before = JSON.stringify(snapshots)
    const view = mount(props)
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(0)
    await userEvent.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    expect([...view.container.querySelectorAll('[data-lane-row]')].map((row) => row.getAttribute('data-lane-row'))).toEqual([
      'schedule:rk2.value', 'schedule:rot.value', 'schedule:sub.value', 'schedule:rcon.value', 'schedule:xor.value', 'schedule:rk1.value', 'schedule:input.value', 'schedule:rk0.value',
    ])
    expect(view.container.querySelector('[data-row-id="mix2.value"] [data-lane-row]')).toHaveAttribute('data-lane-row', 'schedule:rk2.value')
    expect(view.container.querySelector('[data-row-id="mix1.value"] [data-lane-row]')).toHaveAttribute('data-lane-row', 'schedule:rk1.value')
    expect(view.queryByRole('button', { name: /^Source 3 \(state.value\), Bit 0/ })).toBeNull()
    expect(JSON.stringify(snapshots)).toBe(before)
  })
  it('preserves exact cipher origin through schedule toggles and close, with a visible source-view status', async () => {
    const { props } = execute(documents)
    const view = mount(props)
    const user = userEvent.setup()
    const source = view.container.querySelector('[data-row-id="state.value"]') as HTMLElement
    await user.click(within(source).getAllByRole('button')[5])
    const before = view.getByRole('status').textContent
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    expect(view.getByRole('status')).toHaveTextContent('Cipher')
    expect(view.getByRole('status')).toHaveTextContent('state.value')
    expect(view.getByRole('status')).toHaveTextContent('Bit 5:')
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Close key schedule' }))
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    expect(view.getByRole('status').textContent).toBe(before)
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Close key schedule' }))
    expect(view.container.querySelector('[data-row-id="state.value"] button[aria-pressed="true"]')).toHaveAccessibleName(/Bit 5:/)
    expect(view.getByRole('status').textContent).toBe(before)
  })

  it('maps exact anchor bits without widening a related word or visiting an ancestor’s siblings', async () => {
    const { props } = execute(documents)
    const view = mount(props)
    const user = userEvent.setup()
    const opener = () => within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' })
    await user.click(opener())
    const scheduleInput = () => view.container.querySelector('[data-lane-row="schedule:input.value"]') as HTMLElement
    await user.selectOptions(view.getByRole('combobox', { name: 'Key schedule overlay: Selection unit' }), '32')
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Close key schedule' }))
    const key1 = view.container.querySelector('[data-row-id="key1.value"]') as HTMLElement
    await user.click(within(key1).getAllByRole('button')[0])
    await user.click(opener())
    const partial = within(scheduleInput()).getAllByRole('button')[1]
    expect(partial).toHaveTextContent(/^0x04050607$/)
    expect(scheduleInput().querySelector('details')).toBeNull()
    expect(partial).toHaveAttribute('aria-pressed', 'false')
    expect(partial).toHaveAccessibleName(/Bits 32–63: 0x04050607; Related group$/)
    expect(view.container.querySelectorAll('[data-lane-row="schedule:rk1.value"] button[data-state="related"]')).toHaveLength(1)
    expect(view.container.querySelectorAll('[data-lane-row="schedule:rot.value"] button[data-state="related"]')).toHaveLength(0)
    await user.click(partial)
    expect(view.getByRole('status')).toHaveTextContent('Key schedule')
    expect(view.getByRole('status')).toHaveTextContent('Bits 32–63')
    expect(partial).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Close key schedule' }))
    expect(view.container.querySelectorAll('[data-row-id="key1.value"] button[data-state="related"]')).toHaveLength(32)
  })

  it('keeps toolbar visibility and explicit clear independent of the shared selection', async () => {
    const { props } = execute(documents)
    const view = mount(props)
    const user = userEvent.setup()
    const source = view.container.querySelector('[data-row-id="state.value"]') as HTMLElement
    await user.click(within(source).getAllByRole('button')[5])
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    expect(view.getByRole('status')).toHaveTextContent('Bit 5:')
    await user.click(view.getByRole('button', { name: 'Clear selection' }))
    expect(view.getByRole('status')).toHaveTextContent('No bit selected')
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(8)
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Close key schedule' }))
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(0)
  })

  it('retains original generation information and an expandable reference in reverse consumption order', async () => {
    const { props } = execute(documents)
    const view = mount(props)
    await userEvent.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    expect(within(view.container.querySelector('[data-lane-row="schedule:rk2.value"]')!.closest('tr')!).getByRole('cell', { name: 'Generation row 8' })).toBeVisible()
    expect(within(view.container.querySelector('[data-lane-row="schedule:rot.value"]')!.closest('tr')!).getByRole('cell', { name: 'Generation row 3' })).toBeVisible()
    const scheduleKey = view.container.querySelector('[data-lane-row="schedule:rk2.value"]')!
    const scheduleRow = scheduleKey.closest('tr')!
    expect([...scheduleRow.cells].slice(-6, -1).map((cell) => cell.textContent)).toEqual([
      'Generation row 8', 'Round key 2', 'rk2.value', '2', '0xeae1eaef',
    ])
    expect([...scheduleRow.closest('table')!.querySelectorAll('thead th')].slice(-6).map((cell) => cell.textContent)).toEqual([
      'Generation row', 'Stage', 'Source', 'Round', 'Value', 'Bits',
    ])
    for (const row of scheduleRow.parentElement!.querySelectorAll('tr')) {
      expect(row.cells.length).toBe(scheduleRow.closest('table')!.querySelectorAll('thead th').length)
    }
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
    await userEvent.selectOptions(view.getByRole('combobox', { name: 'SPN decryption: Selection unit' }), '4')
    await userEvent.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    await userEvent.selectOptions(view.getByRole('combobox', { name: 'Key schedule overlay: Selection unit' }), '16')
    await userEvent.click(within(view.container.querySelector('[data-lane-row="schedule:input.value"]') as HTMLElement).getAllByRole('button')[0])
    view.rerender(host('decrypt'))
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(8)
    expect(view.getByRole('status')).toHaveTextContent('Bits 0–15')
    expect(view.getByRole('combobox', { name: 'SPN decryption: Selection unit' })).toHaveValue('4')
    expect(view.getByRole('combobox', { name: 'Key schedule overlay: Selection unit' })).toHaveValue('16')
    view.rerender(host('encrypt'))
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(0)
    expect(view.getByRole('status')).toHaveTextContent('No bit selected')
    expect(view.getByRole('combobox', { name: 'SPN encryption: Selection unit' })).toHaveValue('1')
    await userEvent.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    expect(view.getByRole('combobox', { name: 'Key schedule overlay: Selection unit' })).toHaveValue('1')
  })

  it('resets a different real Worker execution while preserving immutable prior snapshots', async () => {
    const { props, snapshots } = execute(documents)
    const before = JSON.stringify(snapshots)
    const view = mount(props)
    await userEvent.selectOptions(view.getByRole('combobox', { name: 'SPN decryption: Selection unit' }), '8')
    const source = view.container.querySelector('[data-row-id="state.value"]') as HTMLElement
    await userEvent.click(within(source).getAllByRole('button')[0])
    await userEvent.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    await userEvent.selectOptions(view.getByRole('combobox', { name: 'Key schedule overlay: Selection unit' }), '16')
    await userEvent.click(within(view.container.querySelector('[data-lane-row="schedule:input.value"]') as HTMLElement).getAllByRole('button')[0])
    const changed = documents.lesson.replace("default: '0x00112233'", "default: '0x00000000'")
    const replacement = execute({ ...documents, lesson: changed })
    view.rerender(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...replacement.props} executionIdentity="new-result" /></I18nextProvider>)
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(0)
    expect(view.getByRole('status')).toHaveTextContent('No bit selected')
    expect(view.getByRole('combobox', { name: 'SPN decryption: Selection unit' })).toHaveValue('1')
    await userEvent.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    expect(view.getByRole('combobox', { name: 'Key schedule overlay: Selection unit' })).toHaveValue('1')
    expect(JSON.stringify(snapshots)).toBe(before)
    expect(replacement.snapshots.cipher.outputs).not.toEqual(snapshots.cipher.outputs)
  })

  it('resolves schedule operation labels from the Lesson locale inside the covering lane', async () => {
    const { props } = execute(documents)
    const view = mount(props)
    await userEvent.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    expect(within(view.container.querySelector('[data-lane-row="schedule:rot.value"]')!.closest('tr')!).getByRole('cell', { name: 'RotWord' })).toBeVisible()
    expect(within(view.container.querySelector('[data-lane-row="schedule:input.value"]')!.closest('tr')!).getByRole('cell', { name: 'Input' })).toBeVisible()
  })

  it('derives the overlay from bindings even when the source Step has no standalone presentation', async () => {
    const { props } = execute(documents)
    const view = mount({ ...props, overlay: { ...props.overlay!, presentation: undefined } })
    const opener = within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' })
    expect(opener).toBeVisible()
    await userEvent.click(opener)
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(8)
  })

})
