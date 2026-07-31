import React, {useEffect} from 'react'
import { useTranslation } from 'react-i18next'
import { WIP } from '../Wip'
import { Div, navbarHeight } from 'ui'
import styled from '@emotion/styled'

const Wrapper = styled(Div)`
  min-height: calc(100vh - ${navbarHeight}px);
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
`

export const LearningPage: React.FC = () => {
  const { t } = useTranslation()
  useEffect(() => {
    const currentTitle = document.title
    document.title = t('nav.learning')
    return () => {document.title = currentTitle}
  },[t] )

  return <Wrapper>
    <WIP />
  </Wrapper>
}
