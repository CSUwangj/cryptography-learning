import React from 'react'
import { Breadcrumb, Breadcrumbs } from '@blueprintjs/core'
import { useHistory } from 'react-router-dom'
import styled from '@emotion/styled'

const Root = styled.nav`
  margin-bottom: 24px;

  @media (max-width: 520px) {
    margin-bottom: 16px;
  }
`

export const PracticeBreadcrumb: React.FC<{ segments?: string[] }> = ({ segments = [] }) => {
  const history = useHistory()
  const [root, ...current] = segments
  const items = [
    { text: root ?? 'Practice', href: '/practice', onClick: (event: React.MouseEvent<HTMLElement>) => {
      if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        history.push('/practice')
      }
    } },
    ...current.map((text) => ({ text })),
  ]
  return <Root aria-label={root ?? 'Practice'}><Breadcrumbs items={items} currentBreadcrumbRenderer={(props) => <span aria-current="page"><Breadcrumb {...props} current /></span>} /></Root>
}
