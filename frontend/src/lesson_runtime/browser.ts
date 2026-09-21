import {
  CryptoGraphWorkerClient,
  type CryptoValue,
  type Diagnostic,
  type WorkerExecutionSnapshot,
} from '../crypto_graph'
import { compileLesson, decodeLessonValue, type CompiledLesson, type LessonDocuments, type Result, type VisualizerCatalog } from './compiler'

export type LessonSessionState = {
  readonly locale: string
  readonly stepIndex: number
  readonly stepId: string
  readonly inputs: Readonly<Record<string, CryptoValue | string>>
  readonly inputDiagnostics: Readonly<Record<string, Diagnostic>>
  readonly snapshots: Readonly<Record<string, WorkerExecutionSnapshot>>
}

const diagnostic = (code: string, message: string, path: string): Diagnostic => ({ code, message, path, details: {} })

const localized = (value: Diagnostic, locale: string): Diagnostic => ({
  ...value,
  message: locale === 'zh-CN'
    ? ({
        'lesson.execution-cancelled': '课程执行已取消。',
        'lesson.invalid-input': '输入不符合声明的类型和编码。',
        'lesson.invalid-step-reference': '课程步骤引用无效。',
        'lesson.missing-step-result': '引用的步骤结果不可用。',
        'lesson.missing-text': '语言文件缺少引用的文本。',
        'lesson.unknown-field': '包含不支持的字段。',
        'lesson.unsupported-version': '不支持的课程版本。',
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
  private readonly worker = new CryptoGraphWorkerClient()
  private index = 0
  private request = 0
  private generation = 0

  constructor(
    readonly lesson: CompiledLesson,
    readonly locale: string,
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
    }
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
    for (const step of affected) this.snapshots.delete(step)
  }

  previous(): LessonSessionState {
    this.generation += 1
    this.worker.cancel()
    this.index = Math.max(0, this.index - 1)
    return this.state()
  }

  async next(): Promise<Result<LessonSessionState>> {
    const target = Math.min(this.lesson.steps.length - 1, this.index + 1)
    if (target !== this.index) {
      this.generation += 1
      this.worker.cancel()
    }
    this.index = target
    const step = this.lesson.steps[target]
    if (!step.execute) return { ok: true, value: this.state() }
    if (this.snapshots.has(step.id)) return { ok: true, value: this.state() }
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
      return { ok: true, value: this.state() }
    }
    if (response.kind === 'diagnostic') return { ok: false, diagnostics: response.diagnostics.map((item) => localized(item, this.locale)) }
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
