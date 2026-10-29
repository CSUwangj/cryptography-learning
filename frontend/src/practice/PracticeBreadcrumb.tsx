import React from 'react'
import { Breadcrumb, Breadcrumbs } from '@blueprintjs/core'
import { useHistory } from 'react-router-dom'
import styled from '@emotion/styled'
import { useTranslation } from 'react-i18next'

const Root = styled.nav`
  margin-bottom: 24px;

  @media (max-width: 520px) {
    margin-bottom: 16px;
  }
`

export const PracticeBreadcrumb: React.FC<{ segments?: string[] }> = ({ segments = [] }) => {
  const { t } = useTranslation()
  const history = useHistory()
  const [root, ...current] = segments
  const items = [
    { text: root ?? t('nav.practice'), href: '/practice', onClick: (event: React.MouseEvent<HTMLElement>) => {
      if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        history.push('/practice')
      }
    } },
    ...current.map((text) => ({ text })),
  ]
  return <Root aria-label={root ?? t('nav.practice')}><Breadcrumbs items={items} currentBreadcrumbRenderer={(props) => <span aria-current="page"><Breadcrumb {...props} current /></span>} /></Root>
}
