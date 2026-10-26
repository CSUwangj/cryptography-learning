import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { matchPath, useHistory, useLocation } from 'react-router-dom'
import { applicationIcons, CategoryItemNavigation } from 'ui'
import { useLearningCatalog } from './data'
import type { LearningCategory } from './domain'

const LESSON_PATTERN = '/learning/:lessonId'

const categoryName = (category: LearningCategory, language: string): string =>
  category.names.find(({ language: itemLanguage }) => itemLanguage === language)?.text
    ?? category.names.find(({ language: itemLanguage }) => itemLanguage === 'en-US')?.text
    ?? category.id

const lessonName = (lesson: LearningCategory['lessons'][number], unavailable: string): string =>
  lesson.title?.trim() || `${unavailable} (${lesson.id})`

type LearningNavigationProps = { className?: string }

export const LearningNavigation: React.FC<LearningNavigationProps> = ({ className }) => {
  const { t, i18n } = useTranslation()
  const history = useHistory()
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const lessonId = matchPath<{ lessonId: string }>(location.pathname, { exact: true, path: LESSON_PATTERN })?.params.lessonId
  const catalog = useLearningCatalog(!isOpen && lessonId === undefined)
  const categories = catalog.categories ?? []
  const currentCategory = categories.find((category) => category.lessons.some((lesson) => lesson.id === lessonId))
  const currentLesson = currentCategory?.lessons.find((lesson) => lesson.id === lessonId)
  const unavailable = t('learning.titleUnavailable')
  const categoryItems = categories.map((category) => ({
    id: category.id,
    name: categoryName(category, i18n.language),
    items: category.lessons.map((lesson) => ({ id: lesson.id, name: lessonName(lesson, unavailable) })),
  }))
  const breadcrumb = [t('nav.learning'), currentCategory && categoryName(currentCategory, i18n.language), currentLesson && lessonName(currentLesson, unavailable)].filter(Boolean) as string[]

  return <CategoryItemNavigation
    className={className}
    dataAttribute="learning"
    ariaLabel={t('learningNavigation.label')}
    categoriesLabel={t('learningNavigation.categories')}
    itemsLabel={t('learningNavigation.lessons')}
    selectCategoryLabel={t('learningNavigation.selectCategory')}
    loadingLabel={t('learningNavigation.loading')}
    errorLabel={t('learningNavigation.error')}
    categories={categoryItems}
    currentCategoryId={currentCategory?.id}
    currentItemId={lessonId}
    breadcrumb={breadcrumb}
    triggerIcon={applicationIcons.navigation.learning}
    loading={catalog.loading}
    error={catalog.error !== undefined}
    action={{ icon: applicationIcons.action.learningCatalog, label: t('learning.title'), onClick: () => history.push('/learning') }}
    onOpenChange={setIsOpen}
    onItemSelect={(_, id) => history.push(`/learning/${id}`)}
  />
}
