import {
  CryptoGraphWorkerClient,
  type AvalancheComparison,
  type CryptoValue,
  type Diagnostic,
  type WorkerExecutionSnapshot,
} from '../crypto_graph'
import { compileLesson, decodeLessonValue, equalCryptoValues, type CompiledLesson, type LessonDocuments, type LessonValueReference, type Result, type VisualizerCatalog } from './compiler'

export type LessonCheckResult =
  | { readonly kind: 'equal'; readonly matched: boolean; readonly feedback: string }
  | { readonly kind: 'choice'; readonly selected: string; readonly correct: boolean; readonly feedback: string }

export type LessonSessionState = {
  readonly locale: string
  readonly stepIndex: number
  readonly stepId: string
  readonly inputs: Readonly<Record<string, CryptoValue | string>>
  readonly inputDiagnostics: Readonly<Record<string, Diagnostic>>
  readonly snapshots: Readonly<Record<string, WorkerExecutionSnapshot>>
  readonly comparisons: Readonly<Record<string, AvalancheComparison>>
  readonly executionIdentities: Readonly<Record<string, string>>
  readonly checkResults: Readonly<Record<string, LessonCheckResult>>
  readonly acceptedDiagnostics: Readonly<Record<string, Diagnostic>>
  readonly executionDiagnostics: Readonly<Record<string, Diagnostic>>
}

const diagnostic = (code: string, message: string, path: string): Diagnostic => ({ code, message, path, details: {} })

const localized = (value: Diagnostic, locale: string): Diagnostic => ({
  ...value,
  message: locale === 'zh-CN'
    ? ({
        'lesson.execution-cancelled': '课程执行已取消。',
        'lesson.invalid-input': '输入不符合声明的类型和编码。',
        'lesson.invalid-step-reference': '课程步骤引用无效。',
        'lesson.comparison-input-unavailable': '比较输入不可用。',
        'lesson.missing-step-result': '引用的步骤结果不可用。',
        'lesson.missing-text': '语言文件缺少引用的文本。',
        'operation-failed': '操作执行失败。',
        'lesson.unknown-field': '包含不支持的字段。',
        'lesson.unsupported-version': '不支持的课程版本。',
        'lesson.visualizer-unavailable': '可视化比较不可用。',
        'lesson.yaml-restriction': 'YAML 使用了不支持的功能。',
        'lesson.yaml-syntax': 'YAML 文档无效。',
      }[value.code] ?? '课程验证失败。')
    : value.message,
})

const cloneValue = (value: CryptoValue): CryptoValue =>
  'symbol' in value
    ? { type: { family: 'alphabet-symbol', mapping: value.type.mapping }, symbol: value.symbol }
    : 'words' in value
      ? { type: { family: 'words', size: value.type.size, wordSize: 8 }, words: value.words.slice() }
      : value.type.family === 'bits'
        ? { type: { family: 'bits', size: value.type.size }, bytes: value.bytes.slice() }
        : { type: { family: 'bytes', size: value.type.size }, bytes: value.bytes.slice() }

export class BrowserLessonSession {
  private readonly inputs: Record<string, CryptoValue | string>
  private readonly inputDiagnostics: Record<string, Diagnostic> = {}
  private readonly snapshots = new Map<string, WorkerExecutionSnapshot>()
  private readonly comparisons = new Map<string, AvalancheComparison>()
  private readonly executionIdentities = new Map<string, string>()
  private readonly checkResults = new Map<string, LessonCheckResult>()
  private readonly acceptedDiagnostics = new Map<string, Diagnostic>()
  private readonly executionDiagnostics = new Map<string, Diagnostic>()
  private readonly worker = new CryptoGraphWorkerClient()
  private index = 0
  private request = 0
  private generation = 0

  constructor(
    public lesson: CompiledLesson,
    public locale: string,
  ) {
    this.inputs = Object.fromEntries(Object.entries(lesson.inputs).map(([id, input]) => [id, cloneValue(input.default)]))
  }

  state(): LessonSessionState {
    return {
      locale: this.locale,
      stepIndex: this.index,
      stepId: this.lesson.steps[this.index].id,
      inputs: Object.fromEntries(Object.entries(this.inputs).map(([id, value]) => [id, typeof value === 'string' ? value : cloneValue(value)])),
      inputDiagnostics: { ...this.inputDiagnostics },
      snapshots: Object.fromEntries(this.snapshots),
      comparisons: Object.fromEntries(this.comparisons),
      executionIdentities: Object.fromEntries(this.executionIdentities),
      checkResults: Object.fromEntries(this.checkResults),
      acceptedDiagnostics: Object.fromEntries(this.acceptedDiagnostics),
      executionDiagnostics: Object.fromEntries(this.executionDiagnostics),
    }
  }

  updateDocuments(documents: LessonDocuments, requestedLocale: string, catalog?: VisualizerCatalog): Result<void> {
    const compiled = compileLesson(documents, catalog)
    if (!compiled.ok) return { ok: false, diagnostics: compiled.diagnostics.map((item) => localized(item, requestedLocale)) }
    if (compiled.value.id !== this.lesson.id) {
      return { ok: false, diagnostics: [localized(diagnostic('lesson.invalid-input', 'Loaded Lesson does not match the current Lesson.', 'id'), requestedLocale)] }
    }
    const stepId = this.lesson.steps[this.index]?.id
    this.lesson = compiled.value
    this.locale = compiled.value.locales[requestedLocale] ? requestedLocale : compiled.value.defaultLocale
    this.index = Math.max(0, this.lesson.steps.findIndex((step) => step.id === stepId))
    return { ok: true, value: undefined }
  }

  setInput(id: string, value: CryptoValue | string): Result<void> {
    const input = this.lesson.inputs[id]
    const decoded = input && (typeof value === 'string'
      ? decodeLessonValue(input.type, input.encoding, value)
      : JSON.stringify(input.type) === JSON.stringify(value.type)
        ? { ok: true as const, value: cloneValue(value) }
        : { ok: false as const, diagnostics: [diagnostic('lesson.invalid-input', 'Input does not match its declared type.', `inputs.${id}`)] })
    if (!decoded || !decoded.ok) {
      this.generation += 1
      this.worker.cancel()
      if (input) this.inputs[id] = value
      if (input) this.invalidateSnapshots(id)
      const diagnostics = (decoded?.diagnostics ?? [diagnostic('lesson.invalid-input', 'Input does not match its declared type.', `inputs.${id}`)])
        .map((item) => localized(item, this.locale))
      if (input) this.inputDiagnostics[id] = diagnostics[0]
      return { ok: false, diagnostics }
    }
    this.generation += 1
    this.worker.cancel()
    this.inputs[id] = decoded.value
    delete this.inputDiagnostics[id]
    this.invalidateSnapshots(id)
    return { ok: true, value: undefined }
  }

  private invalidateSnapshots(input: string): void {
    const affected = new Set<string>()
    for (const step of this.lesson.steps) {
      if (!step.execute) continue
      if (Object.values(step.execute.bindings).some((binding) =>
        ('input' in binding && binding.input === input) || ('step' in binding && affected.has(binding.step))
      )) affected.add(step.id)
    }
    for (const step of affected) {
      this.snapshots.delete(step)
      this.executionIdentities.delete(step)
      this.checkResults.delete(step)
      this.acceptedDiagnostics.delete(step)
      this.executionDiagnostics.delete(step)
    }
    for (const step of this.lesson.steps) if (step.visualizer?.compare) {
      this.comparisons.delete(step.id)
      this.executionIdentities.delete(step.id)
    }
    this.checkResults.clear()
  }

  private referenceValue(reference: LessonValueReference): CryptoValue | undefined {
    const value = 'input' in reference
      ? this.inputs[reference.input]
      : 'constant' in reference
        ? this.lesson.constants[reference.constant]
        : this.snapshots.get(reference.step)?.outputs[reference.output]
    return value && typeof value !== 'string' ? value : undefined
  }

  private async executeComparison(stepId: string): Promise<Result<LessonSessionState>> {
    const compare = this.lesson.steps.find((step) => step.id === stepId)?.visualizer?.compare
    const graph = compare && this.lesson.graphs[compare.graph]
    if (!compare || !graph) {
      return { ok: false, diagnostics: [localized(diagnostic('lesson.visualizer-unavailable', 'Visualizer comparison is unavailable.', `steps.${stepId}.visualizer`), this.locale)] }
    }
    const baseline: Record<string, CryptoValue> = {}
    const changed: Record<string, CryptoValue> = {}
    for (const [source, binding] of Object.entries(compare.bindings)) {
      const left = this.referenceValue(binding.baseline)
      const right = this.referenceValue(binding.changed)
      if (!left || !right) {
        return { ok: false, diagnostics: [localized(
          diagnostic('lesson.comparison-input-unavailable', 'Comparison input is unavailable.', `steps.${stepId}.visualizer.compare.bindings.${source}`),
          this.locale,
        )] }
      }
      baseline[`${source}.value`] = cloneValue(left)
      changed[`${source}.value`] = cloneValue(right)
    }
    const requestId = `${stepId}-${++this.request}`
    const generation = this.generation
    const response = await this.worker.execute({
      requestId,
      kind: 'compare',
      payload: {
        left: { graph: graph.graph, inputs: baseline, ...(this.lesson.limits ? { limits: this.lesson.limits } : {}) },
        right: { graph: graph.graph, inputs: changed, ...(this.lesson.limits ? { limits: this.lesson.limits } : {}) },
        ...(this.lesson.limits ? { limits: this.lesson.limits } : {}),
      },
    }).result
    if (response.kind === 'comparison' && this.index === this.lesson.steps.findIndex((step) => step.id === stepId)
      && generation === this.generation && requestId === `${stepId}-${this.request}`) {
      this.comparisons.set(stepId, response.comparison)
      this.executionIdentities.set(stepId, requestId)
      return { ok: true, value: this.state() }
    }
    if (response.kind === 'diagnostic') {
      const outcome = response.diagnostics[0]
      if (outcome) this.executionDiagnostics.set(stepId, localized(outcome, this.locale))
      return { ok: true, value: this.state() }
    }
    return { ok: false, diagnostics: [localized(diagnostic('lesson.execution-cancelled', 'Lesson execution was cancelled.', `steps.${stepId}`), this.locale)] }
  }

  private evaluateCheck(stepId: string): void {
    const check = this.lesson.steps.find((step) => step.id === stepId)?.check
    if (!check || check.kind !== 'equal') return
    const actual = this.referenceValue(check.actual)
    const expected = this.referenceValue(check.expected)
    if (!actual || !expected) return
    const matched = equalCryptoValues(actual, expected)
    this.checkResults.set(stepId, { kind: 'equal', matched, feedback: matched ? check.feedback.match : check.feedback.mismatch })
  }

  selectChoice(optionId: string): Result<LessonSessionState> {
    const step = this.lesson.steps[this.index]
    const check = step.check
    if (!check || check.kind !== 'choice') {
      return { ok: false, diagnostics: [localized(diagnostic('lesson.invalid-input', 'Current Step has no choice check.', `steps.${step.id}.check`), this.locale)] }
    }
    const option = check.options.find((item) => item.id === optionId)
    if (!option) {
      return { ok: false, diagnostics: [localized(diagnostic('lesson.invalid-input', 'Choice option is invalid.', `steps.${step.id}.check.options`), this.locale)] }
    }
    this.checkResults.set(step.id, { kind: 'choice', selected: option.id, correct: option.id === check.correct, feedback: option.feedback })
    return { ok: true, value: this.state() }
  }

  async previous(): Promise<LessonSessionState> {
    this.generation += 1
    this.worker.cancel()
    this.index = Math.max(0, this.index - 1)
    const step = this.lesson.steps[this.index]
    if (step.visualizer?.compare) {
      const result = await this.executeComparison(step.id)
      return result.ok ? result.value : this.state()
    }
    if (step.visualizer && !this.snapshots.has(step.id)) {
      const result = await this.next()
      return result.ok ? result.value : this.state()
    }
    return this.state()
  }

  async enter(): Promise<Result<LessonSessionState>> {
    const step = this.lesson.steps[this.index]
    if (step.visualizer?.compare && !this.comparisons.has(step.id)) return this.executeComparison(step.id)
    if (step.visualizer && !this.snapshots.has(step.id)) return this.next()
    return { ok: true, value: this.state() }
  }

  async next(): Promise<Result<LessonSessionState>> {
    const current = this.lesson.steps[this.index]
    if (current.visualizer?.compare && !this.comparisons.has(current.id)) return this.executeComparison(current.id)
    const target = current.visualizer && !current.visualizer.compare && !this.snapshots.has(current.id)
      ? this.index
      : Math.min(this.lesson.steps.length - 1, this.index + 1)
    if (target !== this.index) {
      this.generation += 1
      this.worker.cancel()
    }
    this.index = target
    const step = this.lesson.steps[target]
    if (step.visualizer?.compare) return this.executeComparison(step.id)
    if (!step.execute) {
      this.evaluateCheck(step.id)
      return { ok: true, value: this.state() }
    }
    if (this.snapshots.has(step.id)) {
      this.evaluateCheck(step.id)
      return { ok: true, value: this.state() }
    }
    this.acceptedDiagnostics.delete(step.id)
    this.executionDiagnostics.delete(step.id)
    const graph = this.lesson.graphs[step.execute.graph]
    const inputs: Record<string, CryptoValue> = {}
    for (const [targetPort, binding] of Object.entries(step.execute.bindings)) {
      const value = 'input' in binding
        ? this.inputs[binding.input]
        : 'constant' in binding
          ? this.lesson.constants[binding.constant]
          : this.snapshots.get(binding.step)?.outputs[binding.output]
      if (!value || typeof value === 'string') {
        const inputDiagnostic = 'input' in binding ? this.inputDiagnostics[binding.input] : undefined
        return {
          ok: false,
          diagnostics: [inputDiagnostic ?? localized(
            diagnostic('lesson.missing-step-result', 'Referenced Step result is unavailable.', `steps.${step.id}`),
            this.locale,
          )],
        }
      }
      inputs[targetPort] = cloneValue(value)
    }
    const requestId = `${step.id}-${++this.request}`
    const generation = this.generation
    const response = await this.worker.execute({
      requestId,
      kind: 'execute',
      payload: { graph: graph.graph, inputs, ...(this.lesson.limits ? { limits: this.lesson.limits } : {}) },
    }).result
    if (response.kind === 'snapshot' && this.index === target && generation === this.generation && requestId === `${step.id}-${this.request}`) {
      this.snapshots.set(step.id, response.snapshot)
      this.executionIdentities.set(step.id, requestId)
      this.evaluateCheck(step.id)
      return { ok: true, value: this.state() }
    }
    if (response.kind === 'diagnostic') {
      const outcome = response.diagnostics[0]
      if (outcome) {
        const diagnostics = step.acceptedErrorCodes?.includes(outcome.code)
          ? this.acceptedDiagnostics
          : this.executionDiagnostics
        diagnostics.set(step.id, localized(outcome, this.locale))
      }
      return { ok: true, value: this.state() }
    }
    return { ok: false, diagnostics: [localized(diagnostic('lesson.execution-cancelled', 'Lesson execution was cancelled.', `steps.${step.id}`), this.locale)] }
  }

  dispose(): void {
    this.worker.dispose()
  }
}

export const createBrowserLessonSession = (
  documents: LessonDocuments,
  requestedLocale: string,
  catalog?: VisualizerCatalog,
): Result<BrowserLessonSession> => {
  const compiled = compileLesson(documents, catalog)
  if (!compiled.ok) return { ok: false, diagnostics: compiled.diagnostics.map((item) => localized(item, requestedLocale)) }
  const locale = compiled.value.locales[requestedLocale] ? requestedLocale : compiled.value.defaultLocale
  return { ok: true, value: new BrowserLessonSession(compiled.value, locale) }
}
