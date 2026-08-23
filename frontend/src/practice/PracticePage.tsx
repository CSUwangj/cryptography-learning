import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { H1 } from '@blueprintjs/core'
import { Route, Switch } from 'react-router-dom'
import styled from '@emotion/styled'
import { Div, navbarHeight } from 'ui'
import { LAB_PATTERN } from './routes'
import { LabPage } from './LabPage'

const Container = styled.div`
  min-height: calc(100vh - ${navbarHeight}px);
  display: flex;
`

const WelcomeContainer = styled(Div)`
  align-items: center;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  min-height: 100%;
  padding: 24px;
  text-align: center;
  width: 100%;
`

const ContentWrapper = styled(Div)`
  flex: 1 1 auto;
  display: flex;
  padding: 0;
  justify-content: space-around;
  overflow-y: auto;
`

const Welcome: React.FC = () => {
  const { t } = useTranslation()

  return <WelcomeContainer>
    <div>
      <H1>{t('lab-welcome-title')}</H1>
      <p>{ t('lab-welcome') }</p>
    </div>
  </WelcomeContainer>
}

export const PracticePage: React.FC = () => {
  const { t } = useTranslation()
  useEffect(() => {
    const currentTitle = document.title
    document.title = t('nav.practice')
    return () => {document.title = currentTitle}
  },[t] )

  return <Container>
    <ContentWrapper>
      <Switch>
        <Route exact path={LAB_PATTERN} component={LabPage} />
        <Route path='/practice' component={Welcome} />
      </Switch>
    </ContentWrapper>
  </Container>
}
