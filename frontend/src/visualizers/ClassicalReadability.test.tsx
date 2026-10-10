import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { alphabetDirection, alphabetPolicy, compile, integer, text, type AuthoredGraph } from '../crypto_graph'
import { ClassicalCipherRenderer, classicalCipherPositions } from './ClassicalCipher'
import { executionTracePresentation } from './ExecutionTrace'
import { alphabetText } from '../crypto_graph'

describe('classical visualization readability', () => {
  it('keeps the symbol pair outside a vertical reel and settles on the target without reduced-motion animation', () => {
    const mapping = { id: 'latin', symbols: [...'abcdefghijklmnopqrstuvwxyz'] }
    render(<ClassicalCipherRenderer mapping={mapping} policy={alphabetPolicy('preserve')} policyLabel="Preserve"
      positions={classicalCipherPositions(alphabetText(mapping, 'z!'), alphabetText(mapping, 'c!'), mapping)} locale="en-US" reducedMotion motionDirection={1} />)
    const viewport = screen.getByLabelText('z moves 25 2')
    expect(viewport).toHaveStyle({ overflow: 'hidden', height: '2rem' })
    expect(viewport.firstElementChild).toHaveStyle({ flexDirection: 'column', transform: 'translateY(-6rem)', transition: 'none' })
    expect(viewport.firstElementChild?.textContent).toBe('zabc')
    expect(within(viewport).getByText('c')).toHaveAttribute('aria-current', 'true')
    expect(viewport.contains(screen.getByText('z → c'))).toBe(false)
    expect(screen.getByText('! → !')).toBeVisible()
    expect(screen.getByText('Unmapped')).toBeVisible()
  })

  it.each([
    { input: 'z', output: 'c', direction: 1 as const, symbols: 'zabc', transform: 'translateY(-6rem)' },
    { input: 'c', output: 'z', direction: -1 as const, symbols: 'zabc', transform: 'translateY(0rem)' },
    { input: 'b', output: 'a', direction: 1 as const, symbols: 'bcdefghijklmnopqrstuvwxyza', transform: 'translateY(-50rem)' },
    { input: 'z', output: 'z', direction: 1 as const, symbols: 'z', transform: 'translateY(0rem)' },
  ])('follows the signed modular path $input → $output ($direction)', ({ input, output, direction, symbols, transform }) => {
    const mapping = { id: 'latin', symbols: [...'abcdefghijklmnopqrstuvwxyz'] }
    const positions = classicalCipherPositions(alphabetText(mapping, input), alphabetText(mapping, output), mapping)
    const rendered = render(<ClassicalCipherRenderer mapping={mapping} policy={alphabetPolicy('preserve')} policyLabel="Preserve"
      positions={positions} locale="en-US" reducedMotion motionDirection={direction} />)
    const viewport = rendered.getByLabelText(`${input} moves ${positions[0].sourcePosition} ${positions[0].targetPosition}`)
    expect(viewport.firstElementChild?.textContent).toBe(symbols)
    expect(viewport.firstElementChild).toHaveStyle({ transform, transition: 'none' })
    expect(within(viewport).getByText(output)).toHaveAttribute('aria-current', 'true')
  })

  it.each(['en-US', 'zh-CN'])('makes preserved spaces visible in %s without changing the symbols', (locale) => {
    const mapping = { id: 'latin', symbols: [...'ABC'] }
    const positions = classicalCipherPositions(alphabetText(mapping, 'A B'), alphabetText(mapping, 'B C'), mapping)
    render(<ClassicalCipherRenderer mapping={mapping} policy={alphabetPolicy('preserve')} policyLabel="Preserve"
      positions={positions} locale={locale} reducedMotion />)
    const pair = screen.getByText(locale === 'zh-CN' ? '[空格] → [空格]' : '[space] → [space]')
    expect(pair).toBeVisible()
    expect(within(pair.parentElement!).getByText(locale === 'zh-CN' ? '未映射' : 'Unmapped')).toBeVisible()
    expect(positions[1]).toEqual({ input: ' ', output: ' ', mapped: false })
  })

  it.each(['encrypt', 'decrypt'] as const)('labels actual input positions and read order for %s, including duplicate Unicode and empty cells', (direction) => {
    const graph: AuthoredGraph = {
      nodes: [
        { id: 'text', operation: 'core.source@1', parameters: { type: { family: 'text' } } },
        { id: 'rows', operation: 'core.source@1', parameters: { type: { family: 'integer', signed: true, safe: true } } },
        { id: 'direction', operation: 'core.source@1', parameters: { type: { family: 'alphabet-direction' } } },
        { id: 'cipher', operation: 'classical.transposition@1', inputs: { text: { node: 'text', port: 'value' }, rows: { node: 'rows', port: 'value' }, direction: { node: 'direction', port: 'value' } } },
      ], outputs: [{ node: 'cipher', port: 'text' }], traceLevel: 'detail',
    }
    const compiled = compile(graph)
    if (!compiled.ok) throw new Error('Compilation failed')
    const result = compiled.value.execute({ 'text.value': text(direction === 'encrypt' ? '😀 😀BC' : '😀B C😀'), 'rows.value': integer(3), 'direction.value': alphabetDirection(direction) })
    if (!result.ok) throw new Error('Execution failed')
    const event = result.value.trace.find((event) => 'operation' in event && event.operation?.grid)
    if (!event || !('operation' in event) || !event.operation?.grid) throw new Error('Missing grid')
    expect(event.operation.grid.inputPositions).toEqual(direction === 'encrypt' ? [[0, 3], [1, 4], [2, null]] : [[0, 1], [2, 3], [4, null]])
    for (const locale of ['en-US', 'zh-CN']) {
      const presentation = executionTracePresentation({ ...result.value, traceStatus: { truncated: false, retained: result.value.trace.length, dropped: 0 } }, locale, 'test')
      const section = presentation.sections[0]
      if (!('rows' in section)) throw new Error('Missing rows')
      const rendered = render(<>{section.rows.find((row) => row.detail)?.detail}</>)
      expect(screen.getByRole('cell', { name: '0:😀' })).toBeVisible()
      expect(screen.getByRole('cell', { name: locale === 'en-US' ? 'Empty cell' : '空单元格' })).toBeVisible()
      expect(screen.getByText(direction === 'encrypt'
        ? `${locale === 'en-US' ? 'Read order' : '读取顺序'}: 0:😀 → 3:B → 1:${locale === 'en-US' ? '[space]' : '[空格]'} → 4:C → 2:😀`
        : `${locale === 'en-US' ? 'Read order' : '读取顺序'}: 0:😀 → 2:${locale === 'en-US' ? '[space]' : '[空格]'} → 4:😀 → 1:B → 3:C`)).toBeVisible()
      rendered.unmount()
    }
  })
})
