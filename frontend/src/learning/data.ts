import { type ApolloClient } from '@apollo/client'
import { useQuery } from '@apollo/client/react'
import {
  LearningCatalogDocument,
  LessonDocumentsDocument,
} from 'transport/generated/graphql'
import type { LearningCategory, LessonDocuments } from './domain'

const mapCategory = (category: {
  id: string
  name: readonly { lang: string; text: string }[]
  lessons: readonly { id: string }[]
}): LearningCategory => ({
  id: category.id,
  names: category.name.map((name) => ({ language: name.lang, text: name.text })),
  lessons: category.lessons.map((lesson) => ({ id: lesson.id })),
})

export const useLearningCatalog = () => {
  const query = useQuery(LearningCatalogDocument)
  return {
    loading: query.loading,
    error: query.error,
    categories: query.data?.learning.lessonCategories.map(mapCategory),
  }
}

export const loadLessonDocuments = async (
  client: ApolloClient,
  lessonId: string,
  language: string,
): Promise<LessonDocuments | undefined> => {
  const result = await client.query({
    query: LessonDocumentsDocument,
    variables: { lessonId, language },
    fetchPolicy: 'network-only',
  })
  const documents = result.data?.lessonDocuments
  return documents && { lesson: documents.lesson, locale: documents.locale }
}
