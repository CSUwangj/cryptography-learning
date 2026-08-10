import React from 'react'
import { useTranslation } from 'react-i18next'
import { Classes } from '@blueprintjs/core'

/** Generic bilingual Not Found view shared by app routing and feature error mapping. */
export const NotFound: React.FC = () => {
  const { t } = useTranslation()
  return (
    <section>
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.message')}</p>
    </section>
  )
}
