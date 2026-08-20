import React, { useState } from 'react'
import { useQuery } from '@apollo/client/react'
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
import { COMPLETION_PATTERN } from 'completion_board'
import { PracticesDocument } from '../transport/generated/graphql'
import type { PracticeMenuCategory } from './domain'
import { mapPracticeMenu } from './map'
import { LAB_PATTERN, labPath, type LabRouteParams } from './routes'

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

const CompletionButton = styled(NavigationButton)`
  && {
    border-top: 1px solid #d8dee6;
    margin-top: 8px;
    padding-top: 12px;
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

const breadcrumbFor = (
  pathname: string,
  categories: PracticeMenuCategory[],
  practiceLabel: string,
  completionLabel: string,
): { segments: string[]; hidesCategoryOnPhone: boolean } => {
  const labMatch = matchPath<LabRouteParams>(pathname, { exact: true, path: LAB_PATTERN })
  if (labMatch) {
    const { category: categoryId, lab: labId } = labMatch.params
    const category = categories.find(({ id }) => id === categoryId)
    const lab = category?.labs.find(({ id }) => id === labId)
    return {
      segments: [practiceLabel, category?.name ?? categoryId, lab?.name ?? labId],
      hidesCategoryOnPhone: true,
    }
  }

  if (matchPath(pathname, { exact: true, path: COMPLETION_PATTERN })) {
    return { segments: [practiceLabel, completionLabel], hidesCategoryOnPhone: false }
  }

  return { segments: [practiceLabel], hidesCategoryOnPhone: false }
}

type PracticeNavigationProps = {
  className?: string
}

export const PracticeNavigation: React.FC<PracticeNavigationProps> = ({ className }) => {
  const { t, i18n } = useTranslation()
  const history = useHistory()
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>()
  const isLabRoute = Boolean(matchPath(location.pathname, { exact: true, path: LAB_PATTERN }))
  const { data, error, loading } = useQuery(PracticesDocument, { skip: !isOpen && !isLabRoute })
  const categories = data ? mapPracticeMenu(data, i18n.language) : []
  const breadcrumb = breadcrumbFor(
    location.pathname,
    categories,
    t('nav.practice'),
    t('nav.completion'),
  )
  const breadcrumbLabel = breadcrumb.segments.join(' > ')

  const openLab = (categoryId: string, labId: string) => {
    setIsOpen(false)
    history.push(labPath({ category: categoryId, lab: labId }))
  }

  const openCompletion = () => {
    setIsOpen(false)
    history.push('/completion')
  }

  const selectedCategory = categories.find(({ id }) => id === selectedCategoryId)
  const categoryContent = loading ? (
    <NavigationState role="status" aria-busy="true" aria-label={t('practiceNavigation.loading')}>
      <Spinner size={20} />
      {t('practiceNavigation.loading')}
    </NavigationState>
  ) : error ? (
    <NavigationState role="alert">{t('practiceNavigation.error')}</NavigationState>
  ) : (
    categories.map((category) => (
      <NavigationButton
        key={category.id}
        active={category.id === selectedCategoryId}
        onClick={() => setSelectedCategoryId(category.id)}
        text={category.name}
      />
    ))
  )
  const labsContent = selectedCategory ? (
    selectedCategory.labs.map((lab) => (
      <NavigationButton
        key={lab.id}
        onClick={() => openLab(selectedCategory.id, lab.id)}
        text={lab.name}
      />
    ))
  ) : !loading && !error ? (
    <NavigationState>{t('practiceNavigation.selectCategory')}</NavigationState>
  ) : null
  const content = (
    <Panel role="dialog" aria-label={t('practiceNavigation.label')}>
      <Column>
        <ColumnHeading>{t('practiceNavigation.categories')}</ColumnHeading>
        {categoryContent}
        <CompletionButton
          icon={IconNames.TH}
          onClick={openCompletion}
          text={t('nav.completion')}
        />
      </Column>
      <Column>
        <ColumnHeading>{t('practiceNavigation.labs')}</ColumnHeading>
        {labsContent}
      </Column>
    </Panel>
  )

  return <TriggerContainer className={className}>
    <PopoverNext
      content={content}
      isOpen={isOpen}
      onInteraction={setIsOpen}
      placement="bottom-start"
      popupKind={PopupKind.DIALOG}
      transitionDuration={0}
    >
      <Trigger
        minimal
        large
        icon={IconNames.FLAG}
        aria-label={breadcrumbLabel}
      >
        <Breadcrumb aria-hidden="true">
          {breadcrumb.segments.map((segment, index) => (
            <React.Fragment key={`${index}:${segment}`}>
              {index > 0 && (
                <BreadcrumbSeparator $hiddenOnPhone={breadcrumb.hidesCategoryOnPhone && index === 1}>
                  {' > '}
                </BreadcrumbSeparator>
              )}
              <BreadcrumbSegment $hiddenOnPhone={breadcrumb.hidesCategoryOnPhone && index === 1}>
                {segment}
              </BreadcrumbSegment>
            </React.Fragment>
          ))}
        </Breadcrumb>
      </Trigger>
    </PopoverNext>
  </TriggerContainer>
}
