import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { OverlaysProvider } from '@blueprintjs/core'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { of } from 'rxjs'
import { parse, stringify } from 'yaml'
import { i18n } from '../app'
import { executeWorkerRequest, type WorkerRequest } from '../crypto_graph'
import type { LessonDocuments } from '../lesson_runtime'
import { classicalV2Documents } from '../../demos/classicalV2Lessons'
import { LearningPage } from './index'

class LocalWorker extends EventTarget {
  postMessage(request: WorkerRequest): void {
    queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: executeWorkerRequest(request) })))
  }
  terminate(): void {}
}

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await i18n.changeLanguage('en-US')
})

const openLesson = async (documents: LessonDocuments, language = 'en-US') => {
  vi.stubGlobal('Worker', LocalWorker)
  await i18n.changeLanguage(language)
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => of({ data: operation.operationName === 'LearningCatalog'
      ? { learning: { lessonCategories: [] } }
      : { lessonDocuments: { lesson: documents.lesson, locale: documents.locales[operation.variables.language] ?? null } },
    })),
  })
  render(<ApolloProvider client={client}><MemoryRouter initialEntries={['/learning/classical-v2']}><OverlaysProvider>
    <LearningPage />
  </OverlaysProvider></MemoryRouter></ApolloProvider>)
  await screen.findByLabelText(language === 'en-US' ? 'Message' : '消息')
}

it('aligns the cyclic Vigenere string key to consumed positions through real Lesson execution and RenderHost', async () => {
  await openLesson(classicalV2Documents('vigenere'))
  expect(screen.getByLabelText('Key')).toHaveValue('βγ')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('β?δ δααγ (alphabet-text<custom>)')
  const region = screen.getByRole('region', { name: 'Classical cipher position mapping' })
  const cells = [...region.querySelectorAll('[data-mapped]')]
  expect(cells.map((cell) => within(cell as HTMLElement).getByText(/Key:|No key consumed/).textContent)).toEqual([
    'Key: β', 'No key consumed', 'Key: γ', 'No key consumed', 'Key: β', 'Key: γ', 'Key: β', 'Key: γ',
  ])
  expect(within(region).getByText('α → β')).toBeVisible()
  expect(within(region).getAllByText('Unmapped')).toHaveLength(2)
  expect(within(region).queryByRole('slider')).not.toBeInTheDocument()
  expect(region.querySelector('[aria-current]')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('α?β γδ😀α (alphabet-text<custom>)')
  await act(async () => { await i18n.changeLanguage('zh-CN') })
  const decrypted = await screen.findByRole('region', { name: '古典密码位置映射' })
  expect(within(decrypted).getAllByText('密钥：β')).toHaveLength(3)
  expect(within(decrypted).getAllByText('密钥：γ')).toHaveLength(3)
  expect(within(decrypted).getAllByText('不消耗密钥')).toHaveLength(2)
  expect(within(decrypted).getByRole('group', { name: 'β 在位置 1 映射到位置 0 的 α' })).toBeVisible()
})

it.each(['en-US', 'zh-CN'])('shows one affine formula with executed parameters and direct output mappings in %s', async (language) => {
  await openLesson(classicalV2Documents('affine'), language)
  fireEvent.click(screen.getByRole('button', { name: language === 'en-US' ? 'Next' : '下一步' }))
  await screen.findByText('😀?β δαγ😀 (alphabet-text<custom>)')
  const formula = screen.getAllByLabelText(language === 'en-US' ? 'Affine formula' : '仿射公式')
  expect(formula).toHaveLength(1)
  expect(formula[0]).toHaveTextContent('y = (a × x + b) mod 5, a = 2, b = -1')
  const region = screen.getByRole('region', { name: language === 'en-US' ? 'Classical cipher position mapping' : '古典密码位置映射' })
  expect(within(region).getAllByText('α → 😀')).toHaveLength(2)
  expect(within(region).getByRole('group', { name: language === 'en-US' ? 'β at 1 maps to β at 1' : 'β 在位置 1 映射到位置 1 的 β' })).toBeVisible()
  expect(region.querySelector('[aria-current]')).toBeNull()
  expect(within(region).queryByRole('slider')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: language === 'en-US' ? 'Previous' : '上一步' }))
  fireEvent.change(await screen.findByLabelText(language === 'en-US' ? 'Multiplier' : '乘数'), { target: { value: '-2' } })
  fireEvent.change(screen.getByLabelText(language === 'en-US' ? 'Offset' : '偏移量'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: language === 'en-US' ? 'Next' : '下一步' }))
  await screen.findByText('β?😀 γαδβ (alphabet-text<custom>)')
  expect(screen.getByLabelText(language === 'en-US' ? 'Affine formula' : '仿射公式')).toHaveTextContent('y = (a × x + b) mod 5, a = -2, b = 1')
})

it('retains the transposition grid and incomplete cells through real v2 Lesson encryption and decryption', async () => {
  await openLesson(classicalV2Documents('transposition'))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('😀B C😀 (text)')
  const grid = screen.getByRole('region', { name: 'Transposition grid' })
  expect(within(grid).getByRole('cell', { name: '0:😀' })).toBeVisible()
  expect(within(grid).getByRole('cell', { name: 'Empty cell' })).toBeVisible()
  expect(within(grid).getByText('Read order: 0:😀 → 3:B → 1:[space] → 4:C → 2:😀')).toBeVisible()
  expect(screen.queryByRole('region', { name: 'Classical cipher position mapping' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('😀 😀BC (text)')
  const decrypted = screen.getByRole('region', { name: 'Transposition grid' })
  expect(within(decrypted).getByRole('cell', { name: 'Empty cell' })).toBeVisible()
  expect(within(decrypted).getByText('Read order: 0:😀 → 2:[space] → 4:😀 → 1:B → 3:C')).toBeVisible()
})

it.each(['en-US', 'zh-CN'])('retains substitution in both directions with direct mappings in %s', async (language) => {
  await openLesson(classicalV2Documents('substitution'), language)
  const next = () => fireEvent.click(screen.getByRole('button', { name: language === 'en-US' ? 'Next' : '下一步' }))
  next()
  await screen.findByText('😀?γ δαβ😀 (alphabet-text<custom>)')
  const region = screen.getByRole('region', { name: language === 'en-US' ? 'Classical cipher position mapping' : '古典密码位置映射' })
  expect(within(region).getAllByText('α → 😀')).toHaveLength(2)
  expect(within(region).getAllByText(language === 'en-US' ? 'Unmapped' : '未映射')).toHaveLength(2)
  expect(region.querySelector('[aria-current]')).toBeNull()
  expect(within(region).queryByRole('slider')).not.toBeInTheDocument()
  expect(within(region).queryByText(/Key:|密钥：|mod/)).not.toBeInTheDocument()
  next()
  await screen.findByText('α?β γδ😀α (alphabet-text<custom>)')
  const decrypted = screen.getByRole('region', { name: language === 'en-US' ? 'Classical cipher position mapping' : '古典密码位置映射' })
  expect(within(decrypted).getAllByText('😀 → α')).toHaveLength(2)
  expect(decrypted.querySelector('[aria-current]')).toBeNull()
})

it('aligns the executed Vigenere key when its binding differs from the editable key', async () => {
  const documents = classicalV2Documents('vigenere')
  const lesson = parse(documents.lesson)
  lesson.constants['fixed-key'] = { type: lesson.inputs.key.type, encoding: 'text', value: 'γβ' }
  lesson.steps[1].execute.bindings['key.value'] = { constant: 'fixed-key' }
  await openLesson({ ...documents, lesson: stringify(lesson, { aliasDuplicateObjects: false }) })
  expect(screen.getByLabelText('Key')).toHaveValue('βγ')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('γ?γ 😀😀ββ (alphabet-text<custom>)')
  const cells = screen.getByRole('region', { name: 'Classical cipher position mapping' }).querySelectorAll('[data-mapped]')
  expect(within(cells[0] as HTMLElement).getByText('Key: γ')).toBeVisible()
  expect(within(cells[2] as HTMLElement).getByText('Key: β')).toBeVisible()
})

it.each([
  ['vigenere', 'Key', '?', 'βγ', 'cipher.invalid-vigenere-key'],
  ['substitution', 'Key', 'ααααα', '😀γδαβ', 'cipher.invalid-substitution-key'],
  ['affine', 'Multiplier', '5', '2', 'cipher.invalid-affine-key'],
] as const)('retains %s key validation and Strict diagnostics in a real v2 Lesson', async (kind, keyLabel, invalid, valid, code) => {
  await openLesson(classicalV2Documents(kind))
  fireEvent.change(screen.getByLabelText(keyLabel), { target: { value: invalid } })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByText(new RegExp(code))).toBeVisible()
  expect(screen.queryByRole('region', { name: 'Classical cipher position mapping' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
  fireEvent.change(await screen.findByLabelText(keyLabel), { target: { value: valid } })
  fireEvent.change(screen.getByLabelText('Policy'), { target: { value: 'strict' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByText(/cipher.unmapped-symbol/)).toBeVisible()
  expect(screen.queryByRole('region', { name: 'Classical cipher position mapping' })).not.toBeInTheDocument()
})

it('retains transposition row validation and short-input warnings in both existing directions', async () => {
  await openLesson(classicalV2Documents('transposition'))
  fireEvent.change(screen.getByLabelText('Rows'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByText(/cipher.invalid-transposition-rows/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
  fireEvent.change(await screen.findByLabelText('Rows'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: '😀' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('😀 (text)')
  expect(screen.getByText('The text length is smaller than the encryption parameter; encryption leaves the text unchanged.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('😀 (text)')
  expect(await screen.findByText('The text length is smaller than the decryption parameter; decryption leaves the text unchanged.')).toBeVisible()
})
