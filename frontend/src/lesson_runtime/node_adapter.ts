import { executeWorkerRequest, maxWorkerLimits, type AvalancheComparison, type CryptoValue, type Diagnostic, type WorkerExecutionSnapshot } from '../crypto_graph'
import { compileLesson, equalCryptoValues, type CompiledLesson, type LessonDocuments, type LessonNotice, type LessonValueReference, type VisualizerCatalog } from './compiler'
import { deriveBitFlip, prepareLessonComparison } from './execution'

export type LessonDryRunStep = {
  readonly id: string
  readonly execution?: 'accepted-error'
  readonly diagnostics?: readonly Diagnostic[]
  readonly check?: { readonly kind: 'equal', readonly matched: boolean } | { readonly kind: 'choice' }
}

export type LessonDryRun = {
  readonly steps: readonly LessonDryRunStep[]
}

export type LessonValidationReport = {
  readonly ok: boolean
  readonly diagnostics: readonly Diagnostic[]
  readonly notices: readonly LessonNotice[]
  readonly dryRun?: LessonDryRun
}

const diagnostic = (code: string, message: string, path: string): Diagnostic => ({ code, message, path, details: {} })

const dryRun = (lesson: CompiledLesson): { ok: true, value: LessonDryRun } | { ok: false, diagnostics: readonly Diagnostic[] } => {
  const snapshots = new Map<string, WorkerExecutionSnapshot>()
  const comparisons = new Map<string, AvalancheComparison>()
  const inputs = Object.fromEntries(Object.entries(lesson.inputs).map(([id, input]) => [id, input.default]))
  for (const step of lesson.steps) for (const [index, option] of (step.bitFlip ?? []).entries()) {
    inputs[option.changed] = deriveBitFlip(inputs[option.input], index === 0 ? 0 : undefined)
  }
  const steps: LessonDryRunStep[] = []
  const snapshotValue = (stepId: string, output: string, side?: 'baseline' | 'changed'): CryptoValue | undefined => {
    const step = lesson.steps.find((candidate) => candidate.id === stepId)
    const snapshot = side && step?.visualizer?.compare ? comparisons.get(stepId)?.executions[side] : snapshots.get(stepId)
    const graphId = step?.visualizer?.compare?.graph ?? step?.execute?.graph
    const graph = graphId ? lesson.graphs[graphId] : undefined
    return snapshot?.outputs[graph?.outputAliases?.[output] ?? output]
  }
  const referenceValue = (reference: LessonValueReference, side?: 'baseline' | 'changed'): CryptoValue | undefined => {
    const value = 'input' in reference
      ? inputs[reference.input]
      : 'constant' in reference
        ? lesson.constants[reference.constant]
        : snapshotValue(reference.step, reference.output, side)
    return value
  }
  for (const step of lesson.steps) {
    let execution: LessonDryRunStep['execution']
    let acceptedDiagnostics: readonly Diagnostic[] | undefined
    if (step.visualizer?.compare) {
      const prepared = prepareLessonComparison(lesson, step.id, referenceValue, (id) => comparisons.has(id))
      if (!prepared.ok) return prepared
      const startedAt = performance.now()
      const response = executeWorkerRequest({ requestId: `dry-run-${step.id}`, kind: 'compare', payload: prepared.value })
      if (performance.now() - startedAt > (lesson.limits?.timeoutMs ?? maxWorkerLimits.timeoutMs)) {
        return { ok: false, diagnostics: [diagnostic('execution.timeout', 'Worker execution timed out.', `steps.${step.id}.visualizer.compare`)] }
      }
      if (response.kind === 'comparison') comparisons.set(step.id, response.comparison)
      else if (response.kind === 'diagnostic') return { ok: false, diagnostics: response.diagnostics }
      else return { ok: false, diagnostics: [diagnostic('lesson.invalid-input', 'Dry-run comparison was cancelled.', `steps.${step.id}.visualizer.compare`)] }
    } else if (step.execute) {
      const inputs: Record<string, CryptoValue> = {}
      for (const [port, reference] of Object.entries(step.execute.bindings)) {
        const value = referenceValue(reference)
        if (!value) return { ok: false, diagnostics: [diagnostic('lesson.missing-step-result', 'Dry-run input is unavailable.', `steps.${step.id}.execute.bindings.${port}`)] }
        inputs[port] = value
      }
      const startedAt = performance.now()
      const response = executeWorkerRequest({
        requestId: `dry-run-${step.id}`,
        kind: 'execute',
        payload: {
          graph: lesson.graphs[step.execute.graph].graph,
          inputs,
          ...(lesson.limits ? { limits: lesson.limits } : {}),
        },
      })
      if (performance.now() - startedAt > (lesson.limits?.timeoutMs ?? maxWorkerLimits.timeoutMs)) {
        return { ok: false, diagnostics: [diagnostic('execution.timeout', 'Worker execution timed out.', `steps.${step.id}.execute`)] }
      }
      if (response.kind === 'diagnostic') {
        if (response.diagnostics.length > 0 && response.diagnostics.every((item) => step.acceptedErrorCodes?.includes(item.code))) {
          execution = 'accepted-error'
          acceptedDiagnostics = response.diagnostics
        } else return { ok: false, diagnostics: response.diagnostics }
      } else if (response.kind === 'snapshot') snapshots.set(step.id, response.snapshot)
      else return { ok: false, diagnostics: [diagnostic('lesson.invalid-input', 'Dry-run execution was cancelled.', `steps.${step.id}.execute`)] }
    }
    if (execution === 'accepted-error') {
      steps.push({ id: step.id, execution, diagnostics: acceptedDiagnostics })
      continue
    }
    const check = step.check?.kind === 'equal'
      ? (() => {
        const actual = referenceValue(step.check.actual)
        const expected = referenceValue(step.check.expected)
        return actual && expected ? { kind: 'equal' as const, matched: equalCryptoValues(actual, expected) } : undefined
      })()
      : step.check?.kind === 'choice' ? { kind: 'choice' as const } : undefined
    if (step.check?.kind === 'equal' && !check) {
      return { ok: false, diagnostics: [diagnostic('lesson.missing-step-result', 'Dry-run check value is unavailable.', `steps.${step.id}.check`)] }
    }
    steps.push({ id: step.id, ...(execution ? { execution } : {}), ...(check ? { check } : {}) })
  }
  return { ok: true, value: { steps } }
}

export const validateLessonDocuments = (
  documents: LessonDocuments,
  catalog?: VisualizerCatalog,
): LessonValidationReport => {
  const compiled = compileLesson(documents, catalog)
  if (!compiled.ok) return { ok: false, diagnostics: compiled.diagnostics, notices: [] }
  const result = dryRun(compiled.value)
  return result.ok
    ? { ok: true, diagnostics: [], notices: compiled.value.notices, dryRun: result.value }
    : { ok: false, diagnostics: result.diagnostics, notices: compiled.value.notices }
}
