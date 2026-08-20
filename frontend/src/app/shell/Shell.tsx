import React, { useState, type PropsWithChildren } from 'react'
import {
  Alignment,
  Button,
  Classes,
  Navbar,
  NavbarDivider,
  NavbarGroup,
  NavbarHeading,
  MenuItem,
} from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import { Unselectable } from '../Unselectable'
import { Select, type ItemModifiers } from '@blueprintjs/select'
import { useHistory } from 'react-router-dom'
import { Body, Footer, Header, Layout } from '../Layout'
import { navbarHeight } from 'ui'
import styled from '@emotion/styled'
import { IconNames } from '@blueprintjs/icons'
import { PracticeNavigation } from 'practice'

type I18nRenderProps = {
  s: string
  handleClick: (event: React.MouseEvent<HTMLElement>) => void
  modifiers: ItemModifiers
  query?: string
}

const I18nRender: React.FC<I18nRenderProps> = ({ s, handleClick, modifiers }) => {
  const { t } = useTranslation()
  if (!modifiers.matchesPredicate) {
    return null
  }
  return (
    <MenuItem
      active={modifiers.active}
      disabled={modifiers.disabled}
      label={s}
      key={s}
      onClick={handleClick}
      text={t('i18n.'+s)}
      roleStructure="listoption"
    />
  )
}

const NavMenu = styled(Navbar)`
  box-sizing: border-box;
  height: ${navbarHeight}px;
  display: flex;
  min-width: 0;
  overflow: hidden;
  padding: 0 8px;
  align-items: center;
  background-color: #EEE;
  font-size: 20px;

  && .bp6-navbar-group {
    float: none;
    gap: 4px;
    height: 100%;
    min-width: 0;
  }

  @media (max-width: 520px) {
    height: 56px;
    padding: 0 4px;

    .bp6-navbar-divider {
      display: none;
    }

    .bp6-navbar-heading {
      margin-right: 4px;
    }
  }
`

const PrimaryNavigation = styled(NavbarGroup)`
  flex: 1 1 auto;
`

const UtilityNavigation = styled(NavbarGroup)`
  flex: 0 0 auto;
`

const CompactAction = styled(Button)`
  && {
    flex: 0 0 auto;
  }

  @media (max-width: 520px) {
    && .bp6-button-text {
      display: none;
    }
  }
`

const PracticeTrigger = styled(PracticeNavigation)`
  && {
    flex: 1 1 auto;
    max-width: 42rem;
  }
`

const NavigationActions = styled(Unselectable)`
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  gap: 4px;
  min-width: 0;
`

export const Shell: React.FC<PropsWithChildren> = ({ children }) => {
  const { t, i18n } = useTranslation()
  // i18n.languages is list of fallback languages
  const items = i18n.languages
  // but if not using line above, seems only ugly way to do so,
  // check https://github.com/i18next/i18next/issues/1068 for discuss
  // const items = Object.keys(i18n.services.resourceStore.data)
  const [ dark, setDark ] = useState(false)
  const history = useHistory()
  const feedbackURL = import.meta.env.VITE_FEEDBACK_URL
  const handleOpenFeedback = feedbackURL ? () => window.open(feedbackURL) : () => history.push('/feedback')

  return <Layout className={dark ? Classes.DARK : undefined}>
    <Header>
      <NavMenu className={Classes.DARK}>
        <PrimaryNavigation align={Alignment.LEFT}>
          <Unselectable>
            <NavbarHeading><CompactAction minimal large icon={IconNames.HOME} text={t('nav.home')} aria-label={t('nav.homeAction')} onClick={() => history.push('/')}/></NavbarHeading>
          </Unselectable>
          <NavbarDivider />
          <NavigationActions>
            {/* <Button minimal large icon={IconNames.HELP} text={t('nav.tutorial')} onClick={() => history.push('/tutorial')} /> */}
            {/* <Button minimal large icon={IconNames.SEARCH} text={t('nav.learning')} onClick={() => history.push('/learning')} /> */}
            <PracticeTrigger />
            <CompactAction minimal large icon={IconNames.ENVELOPE} text={t('nav.feedback')} aria-label={t('nav.feedback')} onClick={handleOpenFeedback} />
          </NavigationActions>
        </PrimaryNavigation>
        <UtilityNavigation align={Alignment.RIGHT}>
          <NavbarDivider />
          <CompactAction
            minimal
            large
            text={dark ? t('light') : t('dark')}
            aria-label={dark ? t('light') : t('dark')}
            icon={dark ? 'flash' : 'moon'}
            onClick={() => {setDark(!dark)}}
          />
          <NavbarDivider />
          <Select<string>
            items={items}
            filterable={false}
            itemRenderer={(s, {handleClick, modifiers}) => <I18nRender s={s} handleClick={handleClick} modifiers={modifiers} />}
            onItemSelect={(i) => {i18n.changeLanguage(i)}}
          >
            <CompactAction minimal large icon={IconNames.TRANSLATE} text={t('i18n.'+i18n.language)} aria-label={t('nav.language')} rightIcon="double-caret-vertical" />
          </Select>
        </UtilityNavigation>
      </NavMenu>
    </Header>
    <Body>
      { children }
    </Body>
    <Footer>
    </Footer>
  </Layout>
}
