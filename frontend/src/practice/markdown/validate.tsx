import { renderToStaticMarkup } from 'react-dom/server'
import type ReactMarkdown from 'react-markdown'
import katex from 'katex'
import type { Diagnostic } from '../../crypto_graph'
import { Markdown, labMathSettings } from './Markdown'

export const validateLabMarkdown = (source: string, file = 'document.md'): { ok: boolean, diagnostics: readonly Diagnostic[] } => {
  const diagnostics: Diagnostic[] = []
  const validateMath = (node: ReactMarkdown.MarkdownAbstractSyntaxTree, inContainer = false): ReactMarkdown.MarkdownAbstractSyntaxTree => {
    if (node.type === 'math' || node.type === 'inlineMath') {
      try {
        // The page shows KaTeX error UI; validation must report that formula as invalid.
        katex.renderToString(node.value ?? '', { ...labMathSettings, displayMode: node.type === 'math', throwOnError: true })
      } catch (error) {
        const start = inContainer ? undefined : node.position?.start
        diagnostics.push({
          code: 'lab.invalid-math',
          message: error instanceof Error ? error.message : String(error),
          path: node.type,
          ...(start ? { span: { file, line: start.line, column: start.column } } : {}),
          details: { file },
        })
      }
    }
    // remark-containers sets hName to the node type and reparses children with unreliable positions.
    for (const child of node.children ?? []) validateMath(child, inContainer || node.data?.hName === node.type)
    return node
  }
  try {
    renderToStaticMarkup(<Markdown source={source} astPlugins={[(node) => validateMath(node)]} />)
  } catch (error) {
    diagnostics.push({ code: 'lab.render-error', message: error instanceof Error ? error.message : String(error), path: '', details: { file } })
  }
  return { ok: diagnostics.length === 0, diagnostics }
}
