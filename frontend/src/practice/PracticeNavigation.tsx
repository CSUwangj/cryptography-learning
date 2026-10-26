import React, { useState } from 'react'
import { useQuery } from '@apollo/client/react'
import { useTranslation } from 'react-i18next'
import { matchPath, useHistory, useLocation } from 'react-router-dom'
import { COMPLETION_PATTERN } from 'completion_board'
import { applicationIcons, CategoryItemNavigation } from 'ui'
import { PracticesDocument } from '../transport/generated/graphql'
import type { PracticeMenuCategory } from './domain'
import { mapPracticeMenu } from './map'
import { LAB_PATTERN, labPath, type LabRouteParams } from './routes'

const breadcrumbFor = (
  pathname: string,
  categories: PracticeMenuCategory[],
  practiceLabel: string,
  completionLabel: string,
): string[] => {
  const labMatch = matchPath<LabRouteParams>(pathname, { exact: true, path: LAB_PATTERN })
  if (labMatch) {
    const { category: categoryId, lab: labId } = labMatch.params
    const category = categories.find(({ id }) => id === categoryId)
    const lab = category?.labs.find(({ id }) => id === labId)
    return [practiceLabel, category?.name ?? categoryId, lab?.name ?? labId]
  }
  if (matchPath(pathname, { exact: true, path: COMPLETION_PATTERN })) return [practiceLabel, completionLabel]
  return [practiceLabel]
}

type PracticeNavigationProps = { className?: string }

export const PracticeNavigation: React.FC<PracticeNavigationProps> = ({ className }) => {
  const { t, i18n } = useTranslation()
  const history = useHistory()
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const labMatch = matchPath<LabRouteParams>(location.pathname, { exact: true, path: LAB_PATTERN })
  const { data, error, loading } = useQuery(PracticesDocument, { skip: !isOpen && !labMatch })
  const categories = data ? mapPracticeMenu(data, i18n.language) : []
  const currentCategory = labMatch ? categories.find(({ id }) => id === labMatch.params.category) : undefined
  const breadcrumb = breadcrumbFor(location.pathname, categories, t('nav.practice'), t('nav.completion'))
  const categoryItems = categories.map((category) => ({ id: category.id, name: category.name, items: category.labs }))

  return <CategoryItemNavigation
    className={className}
    dataAttribute="practice"
    ariaLabel={t('practiceNavigation.label')}
    categoriesLabel={t('practiceNavigation.categories')}
    itemsLabel={t('practiceNavigation.labs')}
    selectCategoryLabel={t('practiceNavigation.selectCategory')}
    loadingLabel={t('practiceNavigation.loading')}
    errorLabel={t('practiceNavigation.error')}
    categories={categoryItems}
    currentCategoryId={currentCategory?.id}
    currentItemId={labMatch?.params.lab}
    breadcrumb={breadcrumb}
    triggerIcon={applicationIcons.navigation.practice}
    loading={loading}
    error={error !== undefined}
    action={{ icon: applicationIcons.action.completionRecords, label: t('nav.completion'), onClick: () => history.push('/completion') }}
    onOpenChange={setIsOpen}
    onItemSelect={(categoryId, itemId) => history.push(labPath({ category: categoryId, lab: itemId }))}
  />
}
