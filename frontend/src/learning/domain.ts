export type LearningCategory = {
  readonly id: string
  readonly names: readonly { readonly language: string; readonly text: string }[]
  readonly lessons: readonly { readonly id: string }[]
}

export type LessonDocuments = {
  readonly lesson: string
  readonly locale: string | null
}
