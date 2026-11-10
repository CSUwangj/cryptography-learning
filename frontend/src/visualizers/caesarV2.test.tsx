import { cleanup, render, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { parse, stringify } from 'yaml'
import { i18n } from '../app'
import { executeWorkerRequest, type AlphabetTextValue, type AlphabetPolicyValue } from '../crypto_graph'
import { compileLesson } from '../lesson_runtime'
import { caesarV2Documents } from '../../demos/caesarLesson'
import { RenderHost, visualizerCatalog, type RenderHostProps } from './index'

const realCaesar = (version: 1 | 2 = 2, documents = caesarV2Documents, shift = -1): RenderHostProps => {
  const document = documents.lesson.replace('version: 2', `version: ${version}`)
  const compiled = compileLesson({ ...documents, lesson: version === 1 ? document.replace('  cipher:\n', '  cipher:\n    traceLevel: detail\n') : document }, visualizerCatalog)
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
  const lesson = compiled.value
  const graph = lesson.graphs.cipher
  const inputs = { 'message.value': lesson.inputs.message.default, 'rotation.value': { type: { family: 'integer', signed: true, safe: true }, value: shift }, 'policy.value': lesson.inputs.policy.default } as const
  const response = executeWorkerRequest({ requestId: 'caesar-render', kind: 'execute', payload: { graph: graph.graph, inputs } })
  if (response.kind !== 'snapshot') throw new Error(JSON.stringify(response))
  return { compiledGraph: graph, invocation: lesson.steps[1].visualizer, execution: response.snapshot,
    executionIdentity: 'caesar-render', dimensions: { width: 390, height: 600 }, reducedMotion: true,
    classicalCipher: { input: inputs['message.value'] as AlphabetTextValue, output: response.snapshot.outputs['rotated.text'] as AlphabetTextValue,
      mapping: graph.graph.alphabetMappings![0], policy: inputs['policy.value'] as AlphabetPolicyValue, policyLabel: 'Preserve',
      motionDirection: shift < 0 ? -1 : 1, caesar: { shift } },
  }
}
afterEach(cleanup)

it.each(['en-US', 'zh-CN'])('renders real custom-alphabet reverse output with vertical reels and no mandatory control in %s', (language) => {
  const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: language })}><RenderHost {...realCaesar()} /></I18nextProvider>)
  expect(view.getByText('α → 😀')).toBeVisible()
  const viewport = view.getByLabelText(`α ${language === 'en-US' ? 'moves' : '移动'} 0 4`)
  expect(viewport.firstElementChild).toHaveStyle({ flexDirection: 'column', transition: 'none' })
  expect(within(viewport).getByText('😀', { selector: '[aria-current="true"]' })).toBeVisible()
  expect(view.getAllByText(language === 'en-US' ? 'Unmapped' : '未映射')).toHaveLength(2)
  expect(view.getByText(language === 'en-US' ? 'Committed shift: -1' : '已提交位移：-1')).toBeVisible()
  expect(view.queryByRole('slider')).not.toBeInTheDocument()
  expect(view.queryByText(/Drag to preview|拖动预览/)).not.toBeInTheDocument()
})

it('keeps the new key presentation out of v1 even when supplied new control metadata', () => {
  const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...realCaesar(1)} /></I18nextProvider>)
  expect(view.getByText('α → 😀')).toBeVisible()
  expect(view.queryByText('Committed shift: -1')).not.toBeInTheDocument()
})

it.each([true, false])('shows retained composed Caesar output instead of inferring it from one key, reduced motion %s', (reducedMotion) => {
  const lesson = parse(caesarV2Documents.lesson)
  const nodes = lesson.graphs.cipher.nodes
  const rotated = nodes.pop()
  nodes.push({ ...structuredClone(rotated), id: 'first' }, { ...rotated, inputs: { ...rotated.inputs, text: { node: 'first', port: 'text' } } })
  const props = realCaesar(2, { ...caesarV2Documents, lesson: stringify(lesson) }, 1)
  expect(props.execution?.outputs['rotated.text']).toMatchObject({ symbols: [...'γδα ?'] })
  const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...props} reducedMotion={reducedMotion} /></I18nextProvider>)
  for (const [input, output, source, target] of [['α', 'γ', 0, 2], ['β', 'δ', 1, 3], ['δ', 'α', 3, 0]] as const) {
    expect(view.getByText(`${input} → ${output}`)).toBeVisible()
    const reel = view.getByLabelText(`${input} moves ${source} ${target}`)
    expect(within(reel).getByText(output, { selector: '[aria-current="true"]' })).toBeVisible()
  }
})
