import type { CryptoValue, WorkerRequest } from '../crypto_graph'
import { equalCryptoValues, type CompiledLesson, type LessonValueReference, type Result } from './compiler'

export const deriveBitFlip = (source: CryptoValue, bit?: number): CryptoValue => {
  if (!('bytes' in source) || source.type.family !== 'bits') return source
  const bytes = source.bytes.slice()
  if (bit !== undefined) {
    const packedBit = bytes.length * 8 - source.type.size + bit
    bytes[Math.floor(packedBit / 8)] ^= 1 << (7 - packedBit % 8)
  }
  return { type: source.type, bytes }
}

export const prepareLessonComparison = (
  lesson: CompiledLesson,
  stepId: string,
  referenceValue: (reference: LessonValueReference, side: 'baseline' | 'changed') => CryptoValue | undefined,
  hasComparison: (stepId: string) => boolean,
): Result<Extract<WorkerRequest, { kind: 'compare' }>['payload']> => {
  const compare = lesson.steps.find((step) => step.id === stepId)?.visualizer?.compare
  const graph = compare && lesson.graphs[compare.graph]
  const failure = (code: string, message: string, path: string): Result<never> => ({
    ok: false, diagnostics: [{ code, message, path, details: {} }],
  })
  if (!compare || !graph) {
    return failure('lesson.visualizer-unavailable', 'Visualizer comparison is unavailable.', `steps.${stepId}.visualizer`)
  }
  const baseline: Record<string, CryptoValue> = {}
  const changed: Record<string, CryptoValue> = {}
  for (const [source, binding] of Object.entries(compare.bindings)) {
    const left = referenceValue(binding.baseline, 'baseline')
    const right = referenceValue(binding.changed, 'changed')
    if (!left || !right) {
      return failure('lesson.comparison-input-unavailable', 'Comparison input is unavailable.', `steps.${stepId}.visualizer.compare.bindings.${source}`)
    }
    baseline[`${source}.value`] = left
    changed[`${source}.value`] = right
  }
  const invalidAvalanche = () => failure('lesson.invalid-avalanche',
    'Change exactly one bit of a declared data source and keep every other independent input equal.', `steps.${stepId}.visualizer.compare`)
  if (compare.keyChange) {
    const independent = Object.keys(baseline).filter((source) => graph.graph.nodes.find((node) => `${node.id}.value` === source)?.role !== 'round-key')
    if (!hasComparison(compare.keyChange) || independent.some((source) => !equalCryptoValues(baseline[source], changed[source]))) {
      return invalidAvalanche()
    }
  } else if (compare.kind === 'avalanche' && graph.graph.schema === 2) {
    const differences = Object.keys(baseline).filter((source) => !equalCryptoValues(baseline[source], changed[source]))
    const source = differences[0]
    const left = baseline[source]
    const right = changed[source]
    const changedBits = left && right && 'bytes' in left && 'bytes' in right
      ? [...left.bytes].reduce((count, byte, index) => count + (byte ^ right.bytes[index]).toString(2).replaceAll('0', '').length, 0)
      : 0
    if (differences.length !== 1 || !compare.sources?.includes(source.slice(0, -'.value'.length)) || changedBits !== 1) {
      return invalidAvalanche()
    }
  }
  return {
    ok: true,
    value: {
      left: { graph: graph.graph, inputs: baseline, ...(lesson.limits ? { limits: lesson.limits } : {}) },
      right: { graph: graph.graph, inputs: changed, ...(lesson.limits ? { limits: lesson.limits } : {}) },
      ...(lesson.limits ? { limits: lesson.limits } : {}),
    },
  }
}
