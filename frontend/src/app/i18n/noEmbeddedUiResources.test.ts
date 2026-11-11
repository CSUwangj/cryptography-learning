// @vitest-environment node
import { globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { isMap, parseDocument } from 'yaml'

const locale = /^(?:en(?:-US)?|zh(?:-CN)?|enUS|zhCN)$/
const languageField = /^(?:language|resolvedLanguage|locale|lng)$/

function embeddedResources(source: string, filename = 'example.tsx'): string[] {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const jsonImports = new Set(file.statements.flatMap((node) =>
    ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text.endsWith('.json') && node.importClause?.name
      ? [node.importClause.name.text] : []))
  const yamlImports = new Set(file.statements.flatMap((node) =>
    ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && /\.ya?ml\?raw$/.test(node.moduleSpecifier.text) && node.importClause?.name
      ? [node.importClause.name.text] : []))
  const errors: string[] = []
  const name = (node: ts.Node): string => ts.isIdentifier(node) || ts.isStringLiteralLike(node)
    ? node.text : ts.isComputedPropertyName(node) ? name(node.expression) : ''
  const unwrap = (node: ts.Node): ts.Node => ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    || ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node
  const text = (node: ts.Node): string | undefined => ts.isStringLiteralLike(node)
    ? node.text : ts.isTemplateExpression(node)
      ? node.head.text + node.templateSpans.map((span) => '${value}' + span.literal.text).join('') : undefined
  const declarations = new Map<string, ts.Node[]>()
  const collect = (node: ts.Node) => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) && ts.isIdentifier(node.name)) {
      declarations.set(node.name.text, [...(declarations.get(node.name.text) ?? []), node])
    }
    ts.forEachChild(node, collect)
  }
  collect(file)
  const staticText = (value: ts.Node, seen = new Set<ts.Node>()): string | undefined => {
    const node = unwrap(value)
    if (seen.has(node)) return undefined
    const visited = new Set([...seen, node])
    if (ts.isStringLiteralLike(node)) return node.text
    if (ts.isIdentifier(node)) {
      const matches = declarations.get(node.text) ?? []
      const declaration = matches.length === 1 ? matches[0] : undefined
      return declaration && ts.isVariableDeclaration(declaration) && declaration.initializer
        && ts.isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & ts.NodeFlags.Const)
        ? staticText(declaration.initializer, visited) : undefined
    }
    if (ts.isTemplateExpression(node)) {
      let result = node.head.text
      for (const span of node.templateSpans) {
        const fragment = staticText(span.expression, visited)
        if (fragment === undefined) return undefined
        result += fragment + span.literal.text
      }
      return result
    }
    return undefined
  }
  const yamlHasKeys = (value: string | undefined, keys: string[]): boolean => {
    if (value === undefined) return false
    const document = parseDocument(value)
    const contents = document.contents
    return document.errors.length === 0 && isMap(contents) && keys.every((key) => contents.has(key))
  }
  const staticLessonLocale = (node: ts.PropertyAssignment): boolean => {
    const locales = node.parent.parent
    if (!ts.isPropertyAssignment(locales) || name(locales.name) !== 'locales'
      || !ts.isObjectLiteralExpression(locales.parent) || !ts.isObjectLiteralExpression(locales.initializer)) return false
    const documents = locales.parent
    if (documents.properties.some((property) => !ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property))) return false
    const lesson = documents.properties.find((property) => (ts.isPropertyAssignment(property)
      || ts.isShorthandPropertyAssignment(property)) && name(property.name) === 'lesson')
    const lessonText = lesson && (ts.isPropertyAssignment(lesson) ? staticText(lesson.initializer)
      : ts.isShorthandPropertyAssignment(lesson) ? staticText(lesson.name) : undefined)
    if (!yamlHasKeys(lessonText, ['version'])) return false
    const translations = locales.initializer
    return ['en-US', 'zh-CN'].every((language) => translations.properties.some((property) => {
      if (!ts.isPropertyAssignment(property) || name(property.name) !== language) return false
      return yamlHasKeys(staticText(property.initializer), ['title', 'texts'])
    })) && translations.properties.every((property) => ts.isPropertyAssignment(property)
      && staticText(property.initializer) !== undefined)
  }
  const yamlReference = (node: ts.Node): boolean => {
    node = unwrap(node)
    return ts.isIdentifier(node) && yamlImports.has(node.text)
  }
  const lessonLocaleReference = (node: ts.PropertyAssignment): boolean => {
    const locales = node.parent.parent
    return yamlReference(node.initializer) && ts.isPropertyAssignment(locales) && name(locales.name) === 'locales'
      && ts.isObjectLiteralExpression(locales.parent) && locales.parent.properties.some((property) =>
      ts.isPropertyAssignment(property) ? name(property.name) === 'lesson'
        : ts.isShorthandPropertyAssignment(property) && property.name.text === 'lesson')
  }
  const jsonReference = (node: ts.Node): boolean => {
    node = unwrap(node)
    return ts.isIdentifier(node) ? jsonImports.has(node.text)
      : ts.isObjectLiteralExpression(node) && node.properties.every((property) =>
        ts.isPropertyAssignment(property) ? jsonReference(property.initializer)
          : ts.isShorthandPropertyAssignment(property) && jsonImports.has(property.name.text))
  }
  const inlineText = (node: ts.Node): boolean => {
    const value = text(node)
    if (value !== undefined) return !!value.trim() && !locale.test(value)
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
    errors.push(`${filename}:${line + 1}:${character + 1}: ${message}; move UI copy to locales JSON or Lesson copy to external JSON/YAML`)
  }
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && locale.test(name(node.name))) {
      // Only complete static Lesson fixtures may keep their authored locales inline.
      if (!jsonReference(node.initializer) && !lessonLocaleReference(node) && !staticLessonLocale(node)) {
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

it('rejects static inline locales attached to a generated Lesson', () => {
  const source = "const documents = { lesson: buildLesson(), locales: { 'en-US': `title: Demo\ntexts: {}`, 'zh-CN': `title: 示例\ntexts: {}` } }"
  expect(embeddedResources(source)).toHaveLength(2)
})

it('allows a complete static fixture with a shorthand Lesson built from fixed fragments', () => {
  const source = "const nodes = `[]`; const lesson = `version: 2\nnodes: ${nodes}`; const documents = { lesson, locales: { 'en-US': `title: Demo\ntexts: {}`, 'zh-CN': `title: 示例\ntexts: {}` } }"
  expect(embeddedResources(source)).toEqual([])
})

it.each([
  ['id: demo\nversion: 2\nsteps: []', 'texts: {}\ntitle: Demo', 'texts: {}\ntitle: 示例'],
  ['# Lesson\nversion: 2\nsteps: []', '# English\ntitle: Demo\ntexts: {}', '# Chinese\ntitle: 示例\ntexts: {}'],
  ['{steps: [], version: 2}', '{texts: {}, title: Demo}', '{texts: {}, title: 示例}'],
])('allows static Lesson fixtures regardless of YAML key order or style: %s', (lesson, english, chinese) => {
  const source = `const documents = { lesson: ${JSON.stringify(lesson)}, locales: { 'en-US': ${JSON.stringify(english)}, 'zh-CN': ${JSON.stringify(chinese)} } }`
  expect(embeddedResources(source)).toEqual([])
})

it.each([
  "const lesson = buildLesson(); const documents = { lesson, locales: { 'en-US': `title: Demo\ntexts: {}`, 'zh-CN': `title: 示例\ntexts: {}` } }",
  "const documents = { lesson: `nested: {version: 2}`, locales: { 'en-US': `title: Demo\ntexts: {}`, 'zh-CN': `title: 示例\ntexts: {}` } }",
  "const documents = { lesson: `version: [`, locales: { 'en-US': `title: Demo\ntexts: {}`, 'zh-CN': `title: 示例\ntexts: {}` } }",
  "const documents = { lesson: `version: 2\nsteps: []`, locales: { 'en-US': `nested: {title: Demo, texts: {}}`, 'zh-CN': `title: 示例\ntexts: {}` } }",
  "const lesson = buildLesson(); const documents = { lesson, locales: { 'en-US': `title: Demo ${variant}\ntexts: {}`, 'zh-CN': `title: 示例 ${variant}\ntexts: {}` } }",
  "const documents = { lesson: buildLesson(), locales: { 'en-US': `title: Demo ${variant}\ntexts: {}`, 'zh-CN': `title: 示例 ${variant}\ntexts: {}` } }",
  "const documents = { ...original, locales: { 'en-US': `title: Demo\ntexts: {}`, 'zh-CN': `title: 示例\ntexts: {}` } }",
  "const documents = { 'en-US': `title: Demo\ntexts: {}`, 'zh-CN': `title: 示例\ntexts: {}` }",
  "const documents = { lesson: `version: 2\nsteps: []`, locales: { 'en-US': `title: Demo\ntexts: {}` } }",
  "let nodes = `[]`; const documents = { lesson: `version: 2\nnodes: ${nodes}`, locales: { 'en-US': `title: Demo\ntexts: {}`, 'zh-CN': `title: 示例\ntexts: {}` } }",
  "const nodes = `[]`; function make(nodes) { return { lesson: `version: 2\nnodes: ${nodes}`, locales: { 'en-US': `title: Demo\ntexts: {}`, 'zh-CN': `title: 示例\ntexts: {}` } } }",
])('rejects generated, modified or incomplete inline Lesson resources: %s', (source) => {
  expect(embeddedResources(source)).not.toEqual([])
})

it.each([
  "const documents = { lesson: `version: 2\nsteps: []`, locales: { 'en-US': `title: Demo\ntexts: {}`, 'zh-CN': `title: 示例\ntexts: {}` } }",
  "const nodes = `[]`; const fixed = nodes; const documents = { lesson: `version: 2\nnodes: ${fixed}`, locales: { 'en-US': `title: Demo\ntexts: {}`, 'zh-CN': `title: 示例\ntexts: {}` } }",
  `import en from './en-US.json' with { type: 'json' }; import zh from './zh-CN.json' with { type: 'json' };
   const documents = { lesson: buildLesson(), locales: { 'en-US': en, 'zh-CN': zh } }`,
  `import en from './en-US.yaml?raw'; import zh from './zh-CN.yaml?raw';
   const documents = { lesson: buildLesson(), locales: { 'en-US': en, 'zh-CN': zh } }`,
])('allows complete static fixtures, fixed fragments and external Lesson resources: %s', (source) => {
  expect(embeddedResources(source)).toEqual([])
})

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
  `import copy from './en-US.yaml?raw'; const resources = { 'en-US': copy }`,
  `import lesson from './lesson.yaml?raw'; import copy from './en-US.yaml?raw';
   i18n.init({ resources: { 'en-US': copy } })`,
  `import lesson from './lesson.yaml?raw'; import en from './en-US.yaml?raw';
   const documents = { lesson, locales: { 'en-US': en, 'zh-CN': { title: '运行' } } }`,
  `import lesson from './lesson.yaml?raw'; import en from './en-US.ts';
   const documents = { lesson, locales: { 'en-US': en } }`,
])('rejects embedded resources even in a prototype fixture: %s', (source) => {
  expect(embeddedResources(source, 'demos/previewFixture.ts')).not.toEqual([])
})

it.each([
  `import en from './en-US/demos.json'; import zh from './zh-CN/demos.json';
   i18n.init({ resources: { 'en-US': { demos: en }, 'zh-CN': { demos: zh } } })`,
  `const selected = locale === 'zh-CN' ? 'zh-CN' : 'en-US'`,
  `const title = locale === 'zh-CN' ? t('title') : input`,
  `import lesson from './lesson.yaml?raw'; import en from './en-US.yaml?raw'; import zh from './zh-CN.yaml?raw';
   const documents = { lesson, locales: { 'en-US': en, 'zh-CN': zh } }`,
  `import lesson from './lesson.yml?raw'; import en from './en-US.yml?raw';
   const documents = { lesson: lesson, locales: { 'en-US': (en as string) } }`,
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
