import type { Diagnostic, SourceOrigin } from '../crypto_graph'

const rawHtml = /<\/?[a-z!][^>]*>/i
const forbiddenElement = /<\s*\/?\s*(?:script|iframe)\b/i
const markdownUrl = /!?\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g
const referenceUrl = /^\s*\[[^\]]+]:\s*(\S+)/gm

const diagnostic = (message: string, path: string, span?: SourceOrigin): Diagnostic => ({
  code: 'lesson.unsafe-markdown',
  message,
  path,
  ...(span ? { span } : {}),
  details: {},
})

const localAsset = (url: string): boolean =>
  url.startsWith('assets/')
  && !url.includes('?')
  && !url.includes('#')
  && url.slice('assets/'.length).split('/').every((part) => part && part !== '.' && part !== '..')

const allowedUrl = (url: string): boolean =>
  url.startsWith('#') || localAsset(url) || /^https:\/\/[^/\s]+(?:\/[^\s]*)?$/i.test(url)

/** Validate the authored Markdown subset before it reaches a renderer. */
export const validateLessonMarkdown = (
  source: string,
  path: string,
  span?: SourceOrigin,
): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = []
  const prose = source.replace(/```[\s\S]*?```|`[^`]*`/g, '')
  if (rawHtml.test(prose) || forbiddenElement.test(prose)) {
    diagnostics.push(diagnostic('Raw HTML is not supported in Lesson prose.', path, span))
  }
  for (const match of [...prose.matchAll(markdownUrl), ...prose.matchAll(referenceUrl)]) {
    const url = match[1].replace(/^<|>$/g, '')
    if (!allowedUrl(url)) diagnostics.push(diagnostic('Lesson links and assets must use HTTPS, an anchor, or assets/.', path, span))
  }
  return diagnostics
}

/** Convert a validated contained asset path into its server route. */
export const lessonAssetUrl = (lessonId: string, url: string): string =>
  localAsset(url)
    ? `/learning-assets/${encodeURIComponent(lessonId)}/${url.slice('assets/'.length).split('/').map(encodeURIComponent).join('/')}`
    : url

export const rewriteLessonAssets = (source: string, lessonId: string): string =>
  source
    .replace(/(!?\[[^\]]*]\()\<?assets\/([^)\s>]+)>?(?=(?:\s+["'][^"']*["'])?\))/g, (_, start: string, path: string) =>
      `${start}${lessonAssetUrl(lessonId, `assets/${path}`)}`)
    .replace(/^(\s*\[[^\]]+]:\s*)<?assets\/([^\s>]+)>?/gm, (_, start: string, path: string) =>
      `${start}${lessonAssetUrl(lessonId, `assets/${path}`)}`)
