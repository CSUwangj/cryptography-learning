import type { TFunction } from 'i18next'
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
  readonly bitFlips: Readonly<Record<string, { readonly input: string; readonly bit: number }>>
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

export const lessonDiagnosticCodes: ReadonlySet<string> = new Set([
  'lesson.execution-cancelled',
  'lesson.invalid-input',
  'lesson.invalid-step-reference',
  'lesson.comparison-input-unavailable',
  'lesson.missing-step-result',
  'lesson.missing-text',
  'operation-failed',
  'lesson.unknown-field',
  'lesson.unsupported-version',
  'lesson.visualizer-unavailable',
  'lesson.yaml-restriction',
  'lesson.yaml-syntax',
  'cipher.invalid-key',
  'cipher.invalid-transposition-rows',
  'cipher.invalid-affine-key',
  'cipher.invalid-substitution-key',
  'cipher.invalid-vigenere-key',
  'cipher.unmapped-symbol',
  'lesson.v2-feature-in-v1',
  'lesson.v1-feature-in-v2',
  'lesson.v2-unsupported',
  'lesson.invalid-overlay-kind',
  'lesson.overlay-without-schedule-binding',
  'overlay.not-round-key',
  'overlay.schedule-order-inconsistent',
  'overlay.duplicate-anchor',
  'overlay.unbound-round-key',
  'overlay.multiple-schedule-steps',
  'overlay.width-mismatch',
  'presentation.spn-role-required',
  'presentation.spn-round-required',
  'presentation.spn-order-unsupported',
  'presentation.spn-lineage-required',
  'lesson.unknown-constant',
  'lesson.invalid-constant-use',
  'lesson.unsafe-markdown',
  'table.entry-bits-out-of-range',
  'table.entry-out-of-range',
  'table.length-mismatch',
  'aes.invalid-key-word-index',
  'aes.key-word-out-of-range',
  'aes.invalid-rcon-round',
  'cipher.invalid-mapping',
  'cipher.transposition-short-input',
  'comparison.incompatible-structure',
  'comparison.incompatible-trace-level',
  'comparison.incompatible-value',
  'comparison.v2-unsupported',
  'execution.input-limit',
  'execution.invalid-input',
  'execution.invalid-limit',
  'execution.invalid-request',
  'execution.limit-exceeds-global',
  'execution.node-limit',
  'execution.timeout',
  'execution.worker-error',
  'graph.dynamic-loop',
  'graph.invalid-lineage',
  'graph.projection-empty-range',
  'graph.projection-invalid-format',
  'graph.projection-out-of-bounds',
  'graph.single-output-required',
  'graph.structural-mismatch',
  'graph.unbounded-repetition',
  'graph.unresolved-type',
  'operation.invalid-byte-width',
  'operation.invalid-nibble-width',
  'operation.invalid-permutation',
  'operation.invalid-s-box',
  'operation.rotate-word-out-of-bounds',
  'operation.substitute-bytes-range-out-of-bounds',
  'operation.substitute-nibbles-range-out-of-bounds',
  'operation.xor-constant-out-of-bounds',
  'operation.xor-words-out-of-bounds',
  'spn.invalid-permutation',
  'spn.invalid-round-count',
  'spn.invalid-s-box',
  'trace.unsupported-level',
  'duplicate-alphabet-mapping',
  'duplicate-alphabet-symbol',
  'duplicate-node-id',
  'graph-cycle',
  'incompatible-port-type',
  'invalid-alphabet-mapping',
  'invalid-alphabet-symbol',
  'invalid-execution-input',
  'invalid-parameter',
  'invalid-value',
  'missing-execution-input',
  'missing-input',
  'unknown-alphabet-symbol',
  'unknown-input-port',
  'unknown-operation',
  'unknown-output-port',
])

const cloneValue = (value: CryptoValue): CryptoValue => {
  if ('symbol' in value) return { type: { family: 'alphabet-symbol', mapping: value.type.mapping }, symbol: value.symbol }
  if (value.type.family === 'alphabet-text') {
    const text = value as { type: { mapping: string }; symbols: readonly string[] }
    return { type: { family: 'alphabet-text', mapping: text.type.mapping }, symbols: [...text.symbols] }
  }
  if (value.type.family === 'text') return { type: { family: 'text' }, symbols: [...(value as Extract<CryptoValue, { type: { family: 'text' } }>).symbols] }
  if (value.type.family === 'integer') return { type: { family: 'integer', signed: true, safe: true }, value: (value as { value: number }).value }
  if (value.type.family === 'alphabet-policy') return { type: { family: 'alphabet-policy' }, value: (value as { value: 'preserve' | 'strict' }).value }
  if (value.type.family === 'alphabet-direction') return { type: { family: 'alphabet-direction' }, value: (value as { value: 'encrypt' | 'decrypt' }).value }
  if ('words' in value) return { type: { family: 'words', size: value.type.size, wordSize: 8 }, words: value.words.slice() }
  const bytes = value as { type: { family: 'bits' | 'bytes'; size: number }; bytes: Uint8Array }
  return bytes.type.family === 'bits'
    ? { type: { family: 'bits', size: bytes.type.size }, bytes: bytes.bytes.slice() }
    : { type: { family: 'bytes', size: bytes.type.size }, bytes: bytes.bytes.slice() }
}

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
  private readonly bitFlips: Record<string, { input: string; bit: number }> = {}
  private index = 0
  private request = 0
  private generation = 0
  private graphGeneration = 0

  constructor(
    public lesson: CompiledLesson,
    public locale: string,
    private t: TFunction<'translations'>,
  ) {
    this.inputs = Object.fromEntries(Object.entries(lesson.inputs).map(([id, input]) => [id, cloneValue(input.default)]))
    for (const step of lesson.steps) if (step.bitFlip?.length) {
      this.bitFlips[step.id] = { input: step.bitFlip[0].input, bit: 0 }
    }
    this.refreshBitFlips()
  }

  state(): LessonSessionState {
    return {
      locale: this.locale,
      stepIndex: this.index,
      stepId: this.lesson.steps[this.index].id,
      bitFlips: Object.fromEntries(Object.entries(this.bitFlips).map(([id, value]) => [id, { ...value }])),
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

  updateDocuments(documents: LessonDocuments, requestedLocale: string, t: TFunction<'translations'>, catalog?: VisualizerCatalog): Result<void> {
    this.t = t
    const compiled = compileLesson(documents, catalog)
    if (!compiled.ok) return compiled
    if (compiled.value.id !== this.lesson.id) {
      return { ok: false, diagnostics: [diagnostic('lesson.invalid-input', this.t('learning.runtime.lessonMismatch', { lng: 'en-US' }), 'id')] }
    }
    const stepId = this.lesson.steps[this.index]?.id
    this.lesson = compiled.value
    this.locale = compiled.value.locales[requestedLocale] ? requestedLocale : compiled.value.defaultLocale
    this.index = Math.max(0, this.lesson.steps.findIndex((step) => step.id === stepId))
    this.graphGeneration += 1
    return { ok: true, value: undefined }
  }

  setInput(id: string, value: CryptoValue | string): Result<void> {
    const input = this.lesson.inputs[id]
    const decoded = input && (typeof value === 'string'
      ? decodeLessonValue(input.type, input.encoding, value)
      : JSON.stringify(input.type) === JSON.stringify(value.type)
        ? { ok: true as const, value: cloneValue(value) }
        : { ok: false as const, diagnostics: [diagnostic('lesson.invalid-input', this.t('learning.runtime.inputType', { lng: 'en-US' }), `inputs.${id}`)] })
    if (!decoded || !decoded.ok) {
      this.generation += 1
      this.worker.cancel()
      if (input) this.inputs[id] = value
      if (input) this.invalidateSnapshots(id)
      this.refreshBitFlips()
      const diagnostics = (decoded?.diagnostics ?? [diagnostic('lesson.invalid-input', this.t('learning.runtime.inputType', { lng: 'en-US' }), `inputs.${id}`)])
        .map((item) => this.lesson.id === 'transposition' && id === 'rows' && item.code === 'cipher.invalid-key'
          ? { ...item, code: 'cipher.invalid-transposition-rows', message: this.t('learning.runtime.cipher.invalid-transposition-rows', { lng: 'en-US' }), path: `inputs.${id}`, details: { ...item.details, minimum: 2, maximum: 12 } }
          : item)
      if (input) this.inputDiagnostics[id] = diagnostics[0]
      return { ok: false, diagnostics }
    }
    this.generation += 1
    this.worker.cancel()
    this.inputs[id] = decoded.value
    delete this.inputDiagnostics[id]
    this.invalidateSnapshots(id)
    this.refreshBitFlips()
    return { ok: true, value: undefined }
  }

  setBitFlip(stepId: string, input: string, bit: number): Result<void> {
    const option = this.lesson.steps.find((step) => step.id === stepId)?.bitFlip?.find((item) => item.input === input)
    const type = this.lesson.inputs[input]?.type
    if (!option || type?.family !== 'bits' || typeof type.size !== 'number' || !Number.isSafeInteger(bit) || bit < 0 || bit >= type.size
      || typeof this.inputs[input] === 'string') {
      return { ok: false, diagnostics: [diagnostic('lesson.invalid-input', this.t('learning.runtime.bitFlipSelection', { lng: 'en-US' }), `steps.${stepId}.bit_flip`)] }
    }
    this.generation += 1
    this.worker.cancel()
    this.bitFlips[stepId] = { input, bit }
    this.refreshBitFlips()
    return { ok: true, value: undefined }
  }

  private refreshBitFlips(): void {
    for (const step of this.lesson.steps) {
      const selection = this.bitFlips[step.id]
      if (!selection) continue
      for (const option of step.bitFlip ?? []) {
        const source = this.inputs[option.input]
        const changed = typeof source === 'string' ? source : cloneValue(source)
        if (typeof changed !== 'string' && 'bytes' in changed && changed.type.family === 'bits' && option.input === selection.input) {
          const packedBit = changed.bytes.length * 8 - changed.type.size + selection.bit
          changed.bytes[Math.floor(packedBit / 8)] ^= 1 << (7 - packedBit % 8)
        }
        this.inputs[option.changed] = changed
        this.invalidateSnapshots(option.changed)
      }
    }
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
        : (() => {
            const snapshot = this.snapshots.get(reference.step)
            const graph = this.lesson.steps.find((step) => step.id === reference.step)?.execute
              ? this.lesson.graphs[this.lesson.steps.find((step) => step.id === reference.step)!.execute!.graph]
              : undefined
            return snapshot?.outputs[graph?.outputAliases?.[reference.output] ?? reference.output]
          })()
    return value && typeof value !== 'string' ? value : undefined
  }

  private async executeComparison(stepId: string): Promise<Result<LessonSessionState>> {
    const compare = this.lesson.steps.find((step) => step.id === stepId)?.visualizer?.compare
    const graph = compare && this.lesson.graphs[compare.graph]
    if (!compare || !graph) {
      return { ok: false, diagnostics: [diagnostic('lesson.visualizer-unavailable', this.t('learning.runtime.lesson.visualizer-unavailable', { lng: 'en-US' }), `steps.${stepId}.visualizer`)] }
    }
    const baseline: Record<string, CryptoValue> = {}
    const changed: Record<string, CryptoValue> = {}
    for (const [source, binding] of Object.entries(compare.bindings)) {
      const left = this.referenceValue(binding.baseline)
      const right = this.referenceValue(binding.changed)
      if (!left || !right) {
        return { ok: false, diagnostics: [diagnostic('lesson.comparison-input-unavailable', this.t('learning.runtime.lesson.comparison-input-unavailable', { lng: 'en-US' }), `steps.${stepId}.visualizer.compare.bindings.${source}`)] }
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
      if (outcome) this.executionDiagnostics.set(stepId, outcome)
      return { ok: true, value: this.state() }
    }
    return { ok: false, diagnostics: [diagnostic('lesson.execution-cancelled', this.t('learning.runtime.lesson.execution-cancelled', { lng: 'en-US' }), `steps.${stepId}`)] }
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

  private awaitsExecution(step: CompiledLesson['steps'][number]): boolean {
    return step.execute !== undefined && !step.visualizer?.compare && !this.snapshots.has(step.id)
      && !this.acceptedDiagnostics.has(step.id) && !this.executionDiagnostics.has(step.id)
  }

  selectChoice(optionId: string): Result<LessonSessionState> {
    const step = this.lesson.steps[this.index]
    const check = step.check
    if (!check || check.kind !== 'choice') {
      return { ok: false, diagnostics: [diagnostic('lesson.invalid-input', this.t('learning.runtime.missingChoiceCheck', { lng: 'en-US' }), `steps.${step.id}.check`)] }
    }
    const option = check.options.find((item) => item.id === optionId)
    if (!option) {
      return { ok: false, diagnostics: [diagnostic('lesson.invalid-input', this.t('learning.runtime.invalidChoice', { lng: 'en-US' }), `steps.${step.id}.check.options`)] }
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
    if (this.awaitsExecution(step)) {
      const result = await this.next()
      return result.ok ? result.value : this.state()
    }
    return this.state()
  }

  async enter(): Promise<Result<LessonSessionState>> {
    const step = this.lesson.steps[this.index]
    if (step.visualizer?.compare && !this.comparisons.has(step.id)) return this.executeComparison(step.id)
    if (this.awaitsExecution(step)) return this.next()
    return { ok: true, value: this.state() }
  }

  async next(): Promise<Result<LessonSessionState>> {
    const current = this.lesson.steps[this.index]
    if (current.visualizer?.compare && !this.comparisons.has(current.id)) return this.executeComparison(current.id)
    const target = this.awaitsExecution(current)
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
        : (() => {
            const snapshot = this.snapshots.get(binding.step)
            const prior = this.lesson.steps.find((step) => step.id === binding.step)?.execute
            const priorGraph = prior ? this.lesson.graphs[prior.graph] : undefined
            return snapshot?.outputs[priorGraph?.outputAliases?.[binding.output] ?? binding.output]
          })()
      if (!value || typeof value === 'string') {
        const inputDiagnostic = 'input' in binding ? this.inputDiagnostics[binding.input] : undefined
        this.executionDiagnostics.set(step.id, inputDiagnostic ??
          diagnostic('lesson.missing-step-result', this.t('learning.runtime.lesson.missing-step-result', { lng: 'en-US' }), `steps.${step.id}`))
        return { ok: true, value: this.state() }
      }
      inputs[targetPort] = cloneValue(value)
    }
    const requestId = `${step.id}-${++this.request}`
    const generation = this.generation
    const response = await this.worker.execute({
      requestId,
      kind: 'execute',
      payload: {
        graph: graph.graph,
        compiledGraphId: `${this.graphGeneration}:${step.execute.graph}`,
        inputs,
        ...(this.lesson.limits ? { limits: this.lesson.limits } : {}),
      },
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
        diagnostics.set(step.id, outcome)
      }
      return { ok: true, value: this.state() }
    }
    return { ok: false, diagnostics: [diagnostic('lesson.execution-cancelled', this.t('learning.runtime.lesson.execution-cancelled', { lng: 'en-US' }), `steps.${step.id}`)] }
  }

  dispose(): void {
    this.worker.dispose()
  }
}

export const createBrowserLessonSession = (
  documents: LessonDocuments,
  requestedLocale: string,
  t: TFunction<'translations'>,
  catalog?: VisualizerCatalog,
): Result<BrowserLessonSession> => {
  const compiled = compileLesson(documents, catalog)
  if (!compiled.ok) return compiled
  const locale = compiled.value.locales[requestedLocale] ? requestedLocale : compiled.value.defaultLocale
  return { ok: true, value: new BrowserLessonSession(compiled.value, locale, t) }
}
