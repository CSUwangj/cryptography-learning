import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { bits, type WorkerExecutionSnapshot } from 'crypto_graph'
import i18n from '../app/i18n'
import { RenderHost } from './RenderHost'
import { executionTracePresentation } from './ExecutionTrace'
import { teachingSpnPresentation } from './TeachingSpn'

afterEach(async () => { await i18n.changeLanguage('en-US') })

it.each([
  ['en-US', '.plaintext/ciphertext.output/repeat.round/key.key-mix/substitute.permute/17..constructor/__proto__.toString/runtime.custom/'],
  ['zh-CN', '.明文/密文.输出/重复.轮/密钥.密钥混合/替换.置换/17..constructor/__proto__.toString/runtime.custom/'],
  ['fr-FR', '.plaintext/ciphertext.output/repeat.round/key.key-mix/substitute.permute/17..constructor/__proto__.toString/runtime.custom/'],
])('translates only known trace tokens in %s while retaining separators, numbers and unknown names', (language, expected) => {
  const execution: WorkerExecutionSnapshot = {
    outputs: {},
    trace: ['.plaintext/ciphertext.output/repeat.round/key.key-mix/substitute.permute/17..constructor/__proto__.toString/runtime.custom/', '']
      .map((path) => ({ path, level: 'detail', value: bits(8, new Uint8Array([18])) })),
    traceStatus: { truncated: false, retained: 2, dropped: 0 },
  }
  const presentation = teachingSpnPresentation(execution, i18n.getFixedT(language, 'visualizers'), 'runtime-path')
  expect(presentation.sections[0].rows[0].label).toBe(expected)
  expect(presentation.sections[0].rows[0].cells[1].value).toBe(`${expected}: 0x12`)
  expect(presentation.sections[0].rows[1].label).toBe('')
  expect(presentation.sections[0].rows[1].cells[1].value).toBe(': 0x12')
})

it('preserves unknown diagnostic content instead of relabeling it as a transposition warning', () => {
  const warning = { code: 'runtime.custom-warning', message: 'Runtime value {{unchanged}}', path: 'runtime.custom.path', details: { source: 'external' } }
  const execution: WorkerExecutionSnapshot = { outputs: {}, trace: [], traceStatus: { truncated: false, retained: 0, dropped: 0 }, warnings: [warning] }
  expect(executionTracePresentation(execution, i18n.getFixedT('zh-CN', 'visualizers'), 'unknown-warning').diagnostics)
    .toEqual([expect.objectContaining({ code: warning.code, message: warning.message, path: warning.path })])
})

it('updates a mounted trace and fallback with shared UI language, retaining runtime paths', async () => {
  await i18n.changeLanguage('en-US')
  const execution: WorkerExecutionSnapshot = {
    outputs: {},
    trace: [{ path: 'runtime.custom.path', level: 'detail', primitive: 'unknown.operation@1', parameters: {}, value: bits(8, new Uint8Array([18])) }],
    traceStatus: { truncated: false, retained: 1, dropped: 0 },
  }
  const props = { execution, executionIdentity: 'locale-switch', dimensions: { width: 800, height: 600 }, reducedMotion: true }
  const view = render(<RenderHost {...props} />)
  expect(screen.getByText('Unnamed operation')).toBeVisible()
  await act(async () => { await i18n.changeLanguage('zh-CN') })
  expect(screen.getByText('执行轨迹')).toBeVisible()
  expect(screen.getByText('未命名操作')).toBeVisible()
  view.rerender(<RenderHost {...props} invocation={{ id: 'unknown-renderer@1' }} />)
  expect(screen.getByText('可视化工具不可用')).toBeVisible()
  expect(screen.getByText('runtime.custom.path')).toBeVisible()
  await act(async () => { await i18n.changeLanguage('fr-FR') })
  expect(screen.getByText('Visualizer unavailable')).toBeVisible()
  expect(screen.getByText('runtime.custom.path')).toBeVisible()
})
