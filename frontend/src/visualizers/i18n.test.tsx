import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { bits, type WorkerExecutionSnapshot } from 'crypto_graph'
import i18n from '../app/i18n'
import { RenderHost } from './RenderHost'
import { executionTracePresentation } from './ExecutionTrace'
import { teachingSpnPresentation } from './TeachingSpn'

afterEach(async () => { await i18n.changeLanguage('en-US') })

it('preserves unknown runtime path tokens, including object property names', () => {
  const execution: WorkerExecutionSnapshot = {
    outputs: {},
    trace: [{ path: 'constructor/runtime.custom.path', level: 'detail', value: bits(8, new Uint8Array([18])) }],
    traceStatus: { truncated: false, retained: 1, dropped: 0 },
  }
  const presentation = teachingSpnPresentation(execution, i18n.getFixedT('zh-CN', 'visualizers'), 'runtime-path')
  expect(presentation.sections[0].rows[0].label).toBe('constructor/runtime.custom.path')
  expect(presentation.sections[0].rows[0].cells[1].value).toBe('constructor/runtime.custom.path: 0x12')
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
