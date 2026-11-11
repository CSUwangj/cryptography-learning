import { stringify } from 'yaml'
import type { LessonDocuments } from '../src/lesson_runtime'

export function serializeLessonLocales<T>(
  locales: Readonly<Record<string, T>>,
  serialize: (copy: T, language: string) => string = (copy) => stringify(copy),
): LessonDocuments['locales'] {
  return Object.fromEntries(Object.entries(locales).map(([language, copy]) => [language, serialize(copy, language)]))
}
