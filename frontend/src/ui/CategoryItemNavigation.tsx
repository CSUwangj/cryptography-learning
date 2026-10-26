import React, { useEffect, useState } from 'react'
import { Breadcrumb, Button, H4, PopoverNext, PopupKind, Spinner } from '@blueprintjs/core'
import type { IconName } from '@blueprintjs/core'
import styled from '@emotion/styled'

export type CategoryItem = { readonly id: string; readonly name: string }
export type CategoryItemCategory = { readonly id: string; readonly name: string; readonly items: readonly CategoryItem[] }

export type CategoryItemNavigationProps = {
  className?: string
  dataAttribute: string
  ariaLabel: string
  categoriesLabel: string
  itemsLabel: string
  selectCategoryLabel: string
  loadingLabel: string
  errorLabel: string
  categories: readonly CategoryItemCategory[]
  currentCategoryId?: string
  currentItemId?: string
  breadcrumb: readonly string[]
  triggerIcon: IconName
  loading: boolean
  error: boolean
  action?: { readonly icon: IconName; readonly label: string; readonly onClick: () => void }
  onOpenChange?: (open: boolean) => void
  onItemSelect: (categoryId: string, itemId: string) => void
}

const Panel = styled.div`
  background: var(--app-surface); color: var(--app-text); box-sizing: border-box; display: grid;
  gap: 16px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); max-width: calc(100vw - 16px);
  min-width: min(32rem, calc(100vw - 16px)); padding: 16px;
  @media (max-width: 520px) { min-width: calc(100vw - 16px); }
`
const Column = styled.div` min-width: 0; `
const ColumnHeading = styled(H4)` margin: 0 0 8px; `
const NavigationButton = styled(Button)`
  && { color: var(--app-text); display: block; min-height: 36px; overflow-wrap: anywhere; text-align: left; width: 100%; }
`
const NavigationState = styled.div` align-items: center; display: flex; gap: 8px; min-height: 72px; `
const BreadcrumbTrail = styled.span` display: flex; min-width: 0; overflow: hidden; white-space: nowrap; `
const BreadcrumbSegment = styled.span` flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; `
const BreadcrumbSeparator = styled.span` flex: 0 0 auto; `
const Trigger = styled(Button)`
  && { flex: 1 1 auto; min-width: 0; overflow: hidden; width: 100%; .bp6-button-text { min-width: 0; overflow: hidden; } }
`
const TriggerContainer = styled.div`
  display: flex; flex: 1 1 0; min-width: 0;
  .bp6-popover-target { display: block; min-width: 0; width: 100%; }
`

export const CategoryItemNavigation: React.FC<CategoryItemNavigationProps> = (props) => {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>()
  const selectedCategory = props.categories.find(({ id }) => id === selectedCategoryId)

  useEffect(() => {
    if (isOpen) setSelectedCategoryId(props.currentCategoryId)
  }, [isOpen, props.currentCategoryId])

  const close = () => { setIsOpen(false); props.onOpenChange?.(false) }
  const content = (
    <Panel role="dialog" aria-label={props.ariaLabel}>
      <Column>
        <ColumnHeading>{props.categoriesLabel}</ColumnHeading>
        {props.loading ? (
          <NavigationState role="status" aria-busy="true" aria-label={props.loadingLabel}><Spinner size={20} />{props.loadingLabel}</NavigationState>
        ) : props.error ? (
          <NavigationState role="alert">{props.errorLabel}</NavigationState>
        ) : (
          props.categories.map((category) => (
            <NavigationButton key={category.id} active={category.id === selectedCategoryId} aria-pressed={category.id === selectedCategoryId} onClick={() => setSelectedCategoryId(category.id)} text={category.name} />
          ))
        )}
        {props.action ? (
          <NavigationButton icon={props.action.icon} onClick={() => { close(); props.action?.onClick() }} text={props.action.label} />
        ) : null}
      </Column>
      <Column>
        <ColumnHeading>{props.itemsLabel}</ColumnHeading>
        {selectedCategory ? selectedCategory.items.map((item) => (
          <NavigationButton key={item.id} active={item.id === props.currentItemId} aria-pressed={item.id === props.currentItemId} onClick={() => { close(); props.onItemSelect(selectedCategory.id, item.id) }} text={item.name} />
        )) : !props.loading && !props.error ? <NavigationState>{props.selectCategoryLabel}</NavigationState> : null}
      </Column>
    </Panel>
  )

  return (
    <TriggerContainer className={props.className} data-navigation-expanded={props.breadcrumb.length > 1 || undefined} {...{ [`data-${props.dataAttribute}-navigation`]: true }}>
      <PopoverNext content={content} isOpen={isOpen} onInteraction={(open) => { setIsOpen(open); props.onOpenChange?.(open) }} placement="bottom-start" popupKind={PopupKind.DIALOG} transitionDuration={0}>
        <Trigger minimal large icon={props.triggerIcon} aria-label={props.breadcrumb.join(' > ')} title={props.breadcrumb.join(' > ')}>
          <BreadcrumbTrail aria-hidden="true">
            {props.breadcrumb.map((segment, index) => <React.Fragment key={`${index}:${segment}`}>
              {index > 0 && <BreadcrumbSeparator>{' > '}</BreadcrumbSeparator>}
              <BreadcrumbSegment><Breadcrumb text={segment} current={index === props.breadcrumb.length - 1} /></BreadcrumbSegment>
            </React.Fragment>)}
          </BreadcrumbTrail>
        </Trigger>
      </PopoverNext>
    </TriggerContainer>
  )
}
