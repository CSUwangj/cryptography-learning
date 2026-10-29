// @vitest-environment node
import { globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

const locale = /^(?:en(?:-US)?|zh(?:-CN)?|enUS|zhCN)$/
const languageField = /^(?:language|resolvedLanguage|locale|lng)$/

function embeddedResources(source: string, filename = 'example.tsx'): string[] {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const jsonImports = new Set(file.statements.flatMap((node) =>
    ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text.endsWith('.json') && node.importClause?.name
      ? [node.importClause.name.text] : []))
  const errors: string[] = []
  const name = (node: ts.Node): string => ts.isIdentifier(node) || ts.isStringLiteralLike(node)
    ? node.text : ts.isComputedPropertyName(node) ? name(node.expression) : ''
  const unwrap = (node: ts.Node): ts.Node => ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    || ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node
  const text = (node: ts.Node): string | undefined => ts.isStringLiteralLike(node)
    ? node.text : ts.isTemplateExpression(node)
      ? node.head.text + node.templateSpans.map((span) => '${value}' + span.literal.text).join('') : undefined
  const lessonDocument = (value: string): boolean => /^title:/.test(value) && /\ntexts:/.test(value)
  const jsonReference = (node: ts.Node): boolean => {
    node = unwrap(node)
    return ts.isIdentifier(node) ? jsonImports.has(node.text)
      : ts.isObjectLiteralExpression(node) && node.properties.every((property) =>
        ts.isPropertyAssignment(property) ? jsonReference(property.initializer)
          : ts.isShorthandPropertyAssignment(property) && jsonImports.has(property.name.text))
  }
  const inlineText = (node: ts.Node): boolean => {
    const value = text(node)
    if (value !== undefined) return !!value.trim() && !locale.test(value) && !lessonDocument(value)
    // Translation keys and runtime arguments are not rendered literal copy.
    if (ts.isCallExpression(node)) return false
    if (ts.isPropertyAssignment(node)) return inlineText(node.initializer)
    return ts.forEachChild(node, (child) => inlineText(child) || undefined) === true
  }
  const languageCondition = (node: ts.Node): boolean =>
    (ts.isStringLiteralLike(node) && locale.test(node.text))
    || (ts.isIdentifier(node) && languageField.test(node.text))
    || ts.forEachChild(node, (child) => languageCondition(child) || undefined) === true
  const report = (node: ts.Node, message: string) => {
    const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file))
    errors.push(`${filename}:${line + 1}:${character + 1}: ${message}; move UI copy to locales JSON`)
  }
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && locale.test(name(node.name))) {
      const value = text(unwrap(node.initializer))
      // Authored Lesson YAML has its own locale contract; filenames are not exemptions.
      if (!jsonReference(node.initializer) && !(value !== undefined && lessonDocument(value))) {
        report(node, 'Embedded locale dictionary')
      }
    }
    if (ts.isConditionalExpression(node) && languageCondition(node.condition)
      && (inlineText(node.whenTrue) || inlineText(node.whenFalse))) {
      report(node, 'Language-dependent literal copy')
    }
    if (ts.isIfStatement(node) && languageCondition(node.expression)
      && (inlineText(node.thenStatement) || (node.elseStatement && inlineText(node.elseStatement)))) {
      report(node, 'Language-dependent literal copy')
    }
    if (ts.isSwitchStatement(node) && languageCondition(node.expression)
      && node.caseBlock.clauses.some((clause) => clause.statements.some(inlineText))) {
      report(node, 'Language-dependent literal copy')
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return errors
}

it.each([
  `const copy = { 'en-US': { title: 'Run' }, 'zh-CN': { title: '运行' } }`,
  `const copy = { title: { en: 'Run', zh: '运行' } }`,
  `const copy = { ['zh-CN']: { title: '运行' } } as const`,
  `const chinese = { title: '运行' }; const copy = { 'zh-CN': chinese }`,
  `i18n.init({ resources: { 'en-US': { translations: { title: 'Run' } } } })`,
  `const title = locale === 'zh-CN' ? '运行' : 'Run'`,
  "const title = language.startsWith('zh') ? `运行 ${count}` : 'Run'",
  `function title() { if (i18n.language === 'zh-CN') return '运行'; return 'Run' }`,
  `function title(locale) { switch (locale) { case 'zh-CN': return '运行'; default: return 'Run' } }`,
])('rejects embedded resources even in a prototype fixture: %s', (source) => {
  expect(embeddedResources(source, 'demos/previewFixture.ts')).not.toEqual([])
})

it.each([
  `import en from './en-US/demos.json'; import zh from './zh-CN/demos.json';
   i18n.init({ resources: { 'en-US': { demos: en }, 'zh-CN': { demos: zh } } })`,
  `const selected = locale === 'zh-CN' ? 'zh-CN' : 'en-US'`,
  `const title = locale === 'zh-CN' ? t('title') : input`,
  "const documents = { 'en-US': 'title: Demo\\ntexts: {}', 'zh-CN': `title: 示例\ntexts: {}` }",
  `const categories = [{ id: 'foundations', lessons: [{ id: 'xor' }] }]`,
  `const warning = { code: 'external.failure', message: rawMessage, path: 'inputs' }`,
])('allows JSON registration, language identifiers and authored data: %s', (source) => {
  expect(embeddedResources(source)).toEqual([])
})

it('keeps production and runnable-demo UI resources out of TS/TSX', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const files = globSync(['src/**/*.ts', 'src/**/*.tsx', 'demos/**/*.ts', 'demos/**/*.tsx'], {
    cwd: root,
    exclude: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts'],
  }).sort()
  expect(files.length).toBeGreaterThan(0)
  const violations = files.flatMap((filename) => embeddedResources(readFileSync(join(root, filename), 'utf8'), filename))
  expect(violations, violations.join('\n')).toEqual([])
})
