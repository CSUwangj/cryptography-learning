import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Divider, H1, Menu } from '@blueprintjs/core'
import { Route, Switch, useHistory } from 'react-router-dom'
import styled from '@emotion/styled/macro'
import { Div, contentWidth, menuWidth, navbarHeight } from 'ui'
import { LAB_PATTERN, labPath } from './routes'
import { LabPage } from './LabPage'
import { usePracticeMenu } from './data'

const Container = styled.div`
  min-height: calc(100vh - ${navbarHeight}px);
  display: flex;
`

const WelcomeContainer = styled(Div)`
  display: flex;
  vertical-align: middle;
  align-items: center;
  justify-content: space-around;
  width: ${contentWidth}px;
`

const ContentWrapper = styled(Div)`
  flex: 1 1 auto;
  display: flex;
  padding: 0;
  justify-content: space-around;
  overflow-y: auto;
`

const MarginedMenu = styled(Div)`
  ul {
    height: 100%;
    border-radius: 0;
  }
`

const NoMarginDivider = styled(Divider)`
  margin: 0px;
`

const useMenu = (language: string) => {
  const history = useHistory()
  return usePracticeMenu(language, (categories) => {
    const menuItems = categories.map((category, categoryIndex) => {
      const categoryItems = category.labs.map((lab, labIndex) => {
        return <Menu.Item
          key={categoryIndex+'.'+labIndex}
          onClick={() => history.push(labPath({category: category.id, lab: lab.id}))}
          text={lab.name}
        />
      })
      return <>
        <Menu.Divider title={category.name} key={categoryIndex.toString()}/>
        {categoryItems}
      </>
    })
    return <>
      <MarginedMenu style={{width: menuWidth}}>
        <Menu>
          {menuItems}
        </Menu>
      </MarginedMenu>
    </>
  })
}

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
  const { t, i18n } = useTranslation()
  useEffect(() => {
    const currentTitle = document.title
    document.title = t('nav.practice')
    return () => {document.title = currentTitle}
  },[t] )

  const language = i18n.language
  const  menu = useMenu(language)
  return <Container>
    { menu }
    <NoMarginDivider />
    <ContentWrapper>
      <Switch>
        <Route exact path={LAB_PATTERN} component={LabPage} />
        <Route path='/practice' component={Welcome} />
      </Switch>
    </ContentWrapper>
  </Container>
}
