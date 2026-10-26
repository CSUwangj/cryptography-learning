import React, { lazy, Suspense, useEffect, useState, type PropsWithChildren } from 'react'
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

const LearningNavigation = lazy(() => import('learning').then(({ LearningNavigation: Page }) => ({ default: Page })))

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
  background-color: var(--app-page);
  font-size: 20px;

  && .bp6-navbar-group {
    float: none;
    gap: 4px;
    height: 100%;
    min-width: 0;
  }

  @media (max-width: 768px) {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 4px;
    height: 56px;
    padding: 0 4px;

    && .bp6-navbar-group {
      display: contents;
    }

    [data-home-navigation], .bp6-navbar-heading {
      display: contents;
    }

    && button.bp6-button {
      min-width: 0;
      padding-inline: 8px;
      width: 100%;
    }

    button.bp6-button .bp6-button-text {
      display: none;
    }

    .bp6-navbar-divider {
      display: none;
    }

    .bp6-navbar-heading {
      margin: 0;
    }
  }
`

const PrimaryNavigation = styled(NavbarGroup)`
  flex: 1 1 auto;
  min-width: 0;
`

const UtilityNavigation = styled(NavbarGroup)`
  flex: 0 0 auto;
`

const CompactAction = styled(Button)`
  && {
    flex: 0 0 auto;
  }

  &&[data-icon-only] .bp6-button-text {
    display: none;
  }
`

const NavigationActions = styled(Unselectable)`
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  gap: 4px;
  min-width: 0;
  overflow: hidden;

  > [data-learning-navigation], > [data-practice-navigation] {
    flex: 1 1 0;
  }

  &:has(> [data-navigation-expanded]) {
    > [data-learning-navigation], > [data-practice-navigation] {
      flex: 0 0 auto;
    }

    > [data-navigation-expanded] {
      flex: 1 1 0;
    }
  }

  @media (max-width: 768px) {
    display: contents;
  }
`

const THEME_STORAGE_KEY = 'cryptography-learning-theme'
type Theme = 'light' | 'dark'

const readTheme = (): Theme => {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const Shell: React.FC<PropsWithChildren> = ({ children }) => {
  const { t, i18n } = useTranslation()
  // i18n.languages is list of fallback languages
  const items = i18n.languages
  // but if not using line above, seems only ugly way to do so,
  // check https://github.com/i18next/i18next/issues/1068 for discuss
  // const items = Object.keys(i18n.services.resourceStore.data)
  const [theme, setTheme] = useState<Theme>(readTheme)
  const dark = theme === 'dark'
  const history = useHistory()
  const feedbackURL = import.meta.env.VITE_FEEDBACK_URL
  const handleOpenFeedback = feedbackURL ? () => window.open(feedbackURL) : () => history.push('/feedback')

  useEffect(() => {
    document.body.classList.toggle(Classes.DARK, dark)
    return () => document.body.classList.remove(Classes.DARK)
  }, [dark])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const update = () => {
      if (!window.localStorage.getItem(THEME_STORAGE_KEY)) setTheme(media.matches ? 'dark' : 'light')
    }
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark'
    window.localStorage.setItem(THEME_STORAGE_KEY, next)
    setTheme(next)
  }

  return <Layout className={dark ? Classes.DARK : undefined} data-theme={theme}>
    <Header>
      <NavMenu className={dark ? Classes.DARK : undefined}>
        <PrimaryNavigation align={Alignment.LEFT}>
            <Unselectable data-home-navigation>
            <NavbarHeading><CompactAction data-icon-only minimal large icon={IconNames.HOME} text={t('nav.home')} aria-label={t('nav.homeAction')} title={t('nav.homeAction')} onClick={() => history.push('/')}/></NavbarHeading>
          </Unselectable>
          <NavbarDivider />
          <NavigationActions>
            {/* <Button minimal large icon={IconNames.HELP} text={t('nav.tutorial')} onClick={() => history.push('/tutorial')} /> */}
            <Suspense fallback={<CompactAction data-learning minimal large icon={IconNames.SEARCH} text={t('nav.learning')} aria-label={t('nav.learning')} onClick={() => history.push('/learning')} />}><LearningNavigation /></Suspense>
            <PracticeNavigation />
            <CompactAction data-feedback-navigation minimal large icon={IconNames.ENVELOPE} text={t('nav.feedback')} aria-label={t('nav.feedback')} title={t('nav.feedback')} onClick={handleOpenFeedback} />
          </NavigationActions>
        </PrimaryNavigation>
        <UtilityNavigation align={Alignment.RIGHT}>
          <NavbarDivider />
          <CompactAction
            data-icon-only
            minimal
            large
            text={dark ? t('light') : t('dark')}
            aria-label={dark ? t('light') : t('dark')}
            title={dark ? t('light') : t('dark')}
            icon={dark ? 'flash' : 'moon'}
            onClick={toggleTheme}
          />
          <NavbarDivider />
          <Select<string>
            items={items}
            filterable={false}
            itemRenderer={(s, {handleClick, modifiers}) => <I18nRender s={s} handleClick={handleClick} modifiers={modifiers} />}
            onItemSelect={(i) => {i18n.changeLanguage(i)}}
          >
            <CompactAction data-icon-only minimal large icon={IconNames.TRANSLATE} text={t('i18n.'+i18n.language)} aria-label={t('nav.language')} title={t('nav.language')} />
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
