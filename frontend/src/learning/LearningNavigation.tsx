import React, { useEffect, useState } from 'react'
import {
  Button,
  H4,
  PopoverNext,
  PopupKind,
  Spinner,
} from '@blueprintjs/core'
import { IconNames } from '@blueprintjs/icons'
import styled from '@emotion/styled'
import { useTranslation } from 'react-i18next'
import { matchPath, useHistory, useLocation } from 'react-router-dom'
import { useLearningCatalog } from './data'
import type { LearningCategory } from './domain'

const LESSON_PATTERN = '/learning/:lessonId'

const Panel = styled.div`
  background: #fff;
  box-sizing: border-box;
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  max-width: calc(100vw - 16px);
  min-width: min(32rem, calc(100vw - 16px));
  padding: 16px;

  @media (max-width: 520px) {
    min-width: calc(100vw - 16px);
  }
`

const Column = styled.div`
  min-width: 0;
`

const ColumnHeading = styled(H4)`
  margin: 0 0 8px;
`

const NavigationButton = styled(Button)`
  && {
    display: block;
    min-height: 36px;
    overflow-wrap: anywhere;
    text-align: left;
    width: 100%;
  }
`

const NavigationState = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  min-height: 72px;
`

const Breadcrumb = styled.span`
  display: flex;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
`

const BreadcrumbSegment = styled.span<{ $hiddenOnPhone?: boolean }>`
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;

  @media (max-width: 520px) {
    display: ${({ $hiddenOnPhone }) => $hiddenOnPhone ? 'none' : 'inline'};
  }
`

const BreadcrumbSeparator = styled.span<{ $hiddenOnPhone?: boolean }>`
  flex: 0 0 auto;

  @media (max-width: 520px) {
    display: ${({ $hiddenOnPhone }) => $hiddenOnPhone ? 'none' : 'inline'};
  }
`

const Trigger = styled(Button)`
  && {
    min-width: 0;
    overflow: hidden;
    width: 100%;

    .bp6-button-text {
      min-width: 0;
      overflow: hidden;
    }
  }
`

const TriggerContainer = styled.div`
  display: flex;
  flex: 1 1 auto;
  min-width: 0;

  .bp6-popover-target {
    display: block;
    min-width: 0;
    width: 100%;
  }
`

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
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>()
  const lessonId = matchPath<{ lessonId: string }>(location.pathname, { exact: true, path: LESSON_PATTERN })?.params.lessonId
  const catalog = useLearningCatalog(!isOpen && lessonId === undefined)
  const categories = catalog.categories ?? []
  const currentCategory = categories.find((category) => category.lessons.some((lesson) => lesson.id === lessonId))
  const currentLesson = currentCategory?.lessons.find((lesson) => lesson.id === lessonId)
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId)
  const unavailable = t('learning.titleUnavailable')
  const segments = [t('nav.learning'), currentCategory && categoryName(currentCategory, i18n.language), currentLesson && lessonName(currentLesson, unavailable)].filter(Boolean) as string[]
  const breadcrumbLabel = segments.join(' > ')

  useEffect(() => {
    if (isOpen) setSelectedCategoryId(currentCategory?.id)
  }, [currentCategory?.id, isOpen])

  const openLesson = (id: string) => {
    setIsOpen(false)
    history.push(`/learning/${id}`)
  }

  const categoryContent = catalog.loading ? (
    <NavigationState role="status" aria-busy="true" aria-label={t('learningNavigation.loading')}>
      <Spinner size={20} />
      {t('learningNavigation.loading')}
    </NavigationState>
  ) : catalog.error ? (
    <NavigationState role="alert">{t('learningNavigation.error')}</NavigationState>
  ) : (
    categories.map((category) => (
      <NavigationButton
        key={category.id}
        active={category.id === selectedCategoryId}
        onClick={() => setSelectedCategoryId(category.id)}
        text={categoryName(category, i18n.language)}
      />
    ))
  )
  const lessonsContent = selectedCategory ? (
    selectedCategory.lessons.map((lesson) => (
      <NavigationButton
        key={lesson.id}
        active={lesson.id === lessonId}
        onClick={() => openLesson(lesson.id)}
        text={lessonName(lesson, unavailable)}
      />
    ))
  ) : !catalog.loading && !catalog.error ? (
    <NavigationState>{t('learningNavigation.selectCategory')}</NavigationState>
  ) : null
  const content = (
    <Panel role="dialog" aria-label={t('learningNavigation.label')}>
      <Column>
        <ColumnHeading>{t('learningNavigation.categories')}</ColumnHeading>
        {categoryContent}
        <NavigationButton icon={IconNames.TH} onClick={() => { setIsOpen(false); history.push('/learning') }} text={t('learning.title')} />
      </Column>
      <Column>
        <ColumnHeading>{t('learningNavigation.lessons')}</ColumnHeading>
        {lessonsContent}
      </Column>
    </Panel>
  )

  return <TriggerContainer className={className} data-learning-navigation>
    <PopoverNext
      content={content}
      isOpen={isOpen}
      onInteraction={setIsOpen}
      placement="bottom-start"
      popupKind={PopupKind.DIALOG}
      transitionDuration={0}
    >
      <Trigger minimal large icon={IconNames.SEARCH} aria-label={breadcrumbLabel} title={breadcrumbLabel}>
        <Breadcrumb aria-hidden="true">
          {segments.map((segment, index) => (
            <React.Fragment key={`${index}:${segment}`}>
              {index > 0 && <BreadcrumbSeparator $hiddenOnPhone={currentCategory !== undefined && index === 1}>{' > '}</BreadcrumbSeparator>}
              <BreadcrumbSegment $hiddenOnPhone={currentCategory !== undefined && index === 1}>{segment}</BreadcrumbSegment>
            </React.Fragment>
          ))}
        </Breadcrumb>
      </Trigger>
    </PopoverNext>
  </TriggerContainer>
}
