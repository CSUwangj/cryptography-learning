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
import { useHistory } from 'react-router-dom'
import { PracticesDocument } from '../transport/generated/graphql'
import { mapPracticeMenu } from './map'
import { labPath } from './routes'

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

export const PracticeNavigation: React.FC = () => {
  const { t, i18n } = useTranslation()
  const history = useHistory()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>()
  const { data, error, loading } = useQuery(PracticesDocument, { skip: !isOpen })
  const categories = data ? mapPracticeMenu(data, i18n.language) : []

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

  return (
    <PopoverNext
      content={content}
      isOpen={isOpen}
      onInteraction={setIsOpen}
      placement="bottom-start"
      popupKind={PopupKind.DIALOG}
      transitionDuration={0}
    >
      <Button
        minimal
        large
        icon={IconNames.FLAG}
        text={t('nav.practice')}
        aria-label={t('nav.practice')}
      />
    </PopoverNext>
  )
}
