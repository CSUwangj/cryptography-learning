import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from './Markdown'
import { validateLabMarkdown } from './validate'

describe('Lab Markdown validation', () => {
  it('rejects a recognized invalid formula inside a collapsed callout', () => {
    const source = '::: warning Check\n\n$\\unknowncommand{x}$\n\n:::\n'
    expect(renderToStaticMarkup(<Markdown source={source} />)).not.toContain('katex-error')
    expect(validateLabMarkdown(source)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'lab.invalid-math' }],
    })
  })

  it('accepts current prose, math, callouts, HTML and link tolerance', () => {
    const source = '# Lab\n\n$x$ and $x\n\n$$\nx^2 + y^2\n$$\n\n'
      + '<script>escaped text</script>\n\n[HTTP](http://example.test) [Relative](../notes.md)\n\n'
      + '```python\nprint("Lab")\n```\n\n'
      + ['none', 'primary', 'success', 'warning', 'danger'].map((intent) => `::: ${intent} Title\n\n$\\frac{1}{2}$\n\n:::\n`).join('\n')
    expect(validateLabMarkdown(source)).toEqual({ ok: true, diagnostics: [] })
  })

  it('reports parser positions for invalid inline and block formulas', () => {
    expect(validateLabMarkdown('Text $\\unknowncommand{x}$\n\n$$\n\\frac{\n$$', 'lab.md')).toMatchObject({
      ok: false,
      diagnostics: [
        { code: 'lab.invalid-math', span: { file: 'lab.md', line: 1, column: 6 } },
        { code: 'lab.invalid-math', span: { file: 'lab.md', line: 3, column: 1 } },
      ],
    })
  })

  it.each([
    ['callout', '::: warning Check\n\n$\\unknowncommand{x}$\n\n:::\n\nText $\\unknowncommand{x}$', 'inlineMath', 7],
    ['nested callout', '::: warning Outer\n\n::: success Inner\n\n$$\n\\frac{\n$$\n\n:::\n\n:::\n\nText $\\unknowncommand{x}$', 'math', 13],
  ] as const)('omits unreliable positions inside a %s and retains following source spans', (_name, source, kind, line) => {
    const report = validateLabMarkdown(source, 'lab.md')
    expect(report).toMatchObject({
      ok: false,
      diagnostics: [
        { code: 'lab.invalid-math', path: kind, details: { file: 'lab.md' } },
        { code: 'lab.invalid-math', span: { file: 'lab.md', line, column: 6 } },
      ],
    })
    expect(report.diagnostics[0].span).toBeUndefined()
  })

  it.each([
    '::: warning Title\nUnclosed callout\n',
    '::: unsupported Title\nContent\n:::\n',
  ])('reports an actual parser or renderer exception for %j', (source) => {
    expect(() => renderToStaticMarkup(<Markdown source={source} />)).toThrow()
    const report = validateLabMarkdown(source, 'broken.md')
    expect(report).toMatchObject({ ok: false, diagnostics: [{ code: 'lab.render-error', details: { file: 'broken.md' } }] })
    expect(report.diagnostics[0].message).not.toBe('')
    expect(report.diagnostics[0].span).toBeUndefined()
  })
})
