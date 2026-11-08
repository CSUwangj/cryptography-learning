import React, { useState } from 'react'
import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { OverlaysProvider } from '@blueprintjs/core'
import { MemoryRouter } from 'react-router-dom'
import { of } from 'rxjs'
import { parse } from 'yaml'
import { LearningPage } from '../src/learning'
import { Shell, i18n } from '../src/app'
import { teachingSpnV2DemoDocuments } from './teachingSpnV2Lesson'
import '../src/app/App.css'
import '../src/index.css'

// Supply public demo documents at the catalog boundary; Learning and its Worker stay unchanged.
export const SpnV2Demo: React.FC = () => {
  const [client] = useState(() => new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => {
      const language = operation.variables.language === 'zh-CN' ? 'zh-CN' : 'en-US'
      switch (operation.operationName) {
      case 'LearningCatalog':
        return of({ data: { learning: { lessonCategories: [{
          id: 'demos',
          name: ['en-US', 'zh-CN'].map((lang) => ({ lang, text: i18n.t('nav.learning', { lng: lang }) })),
          lessons: [{ id: 'teaching-spn-v2', title: parse(teachingSpnV2DemoDocuments.locales[language]).title }],
        }] } } })
      case 'LessonDocuments':
        return of({ data: { lessonDocuments: {
          lesson: teachingSpnV2DemoDocuments.lesson,
          locale: teachingSpnV2DemoDocuments.locales[language],
        } } })
      default:
        return of({ data: { practice: { labCategories: [] } } })
      }
    }),
  }))

  return <ApolloProvider client={client}>
    <MemoryRouter initialEntries={['/learning/teaching-spn-v2']}>
      <OverlaysProvider><div className="app" style={{ height: '100%' }}><Shell><LearningPage /></Shell></div></OverlaysProvider>
    </MemoryRouter>
  </ApolloProvider>
}
