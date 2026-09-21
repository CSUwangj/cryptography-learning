import { compileLesson, type LessonDocuments, type VisualizerCatalog } from './compiler'

export type LessonValidationReport = {
  readonly ok: boolean
  readonly diagnostics: readonly import('../crypto_graph').Diagnostic[]
}

export const validateLessonDocuments = (
  documents: LessonDocuments,
  catalog?: VisualizerCatalog,
): LessonValidationReport => {
  const compiled = compileLesson(documents, catalog)
  return compiled.ok ? { ok: true, diagnostics: [] } : { ok: false, diagnostics: compiled.diagnostics }
}
