import React, { useState } from 'react'
import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { OverlaysProvider } from '@blueprintjs/core'
import { BrowserRouter } from 'react-router-dom'
import { of } from 'rxjs'
import { parse } from 'yaml'
import { Shell, i18n } from '../src/app'
import { LearningPage } from '../src/learning'
import type { LessonDocuments } from '../src/lesson_runtime'
import aes128 from '../src/lesson_runtime/fixture/aes128-v2.yaml?raw'
import aes128En from '../src/lesson_runtime/fixture/aes128-v2-locales/en-US.yaml?raw'
import aes128Zh from '../src/lesson_runtime/fixture/aes128-v2-locales/zh-CN.yaml?raw'
import aes192 from '../src/lesson_runtime/fixture/aes192-v2.yaml?raw'
import aes192En from '../src/lesson_runtime/fixture/aes192-v2-locales/en-US.yaml?raw'
import aes192Zh from '../src/lesson_runtime/fixture/aes192-v2-locales/zh-CN.yaml?raw'
import aes256 from '../src/lesson_runtime/fixture/aes256-v2.yaml?raw'
import aes256En from '../src/lesson_runtime/fixture/aes256-v2-locales/en-US.yaml?raw'
import aes256Zh from '../src/lesson_runtime/fixture/aes256-v2-locales/zh-CN.yaml?raw'
import '../src/index.css'

const lessons: Readonly<Record<string, LessonDocuments>> = {
  'aes128-v2-kat': { lesson: aes128, locales: { 'en-US': aes128En, 'zh-CN': aes128Zh } },
  'aes192-v2-kat': { lesson: aes192, locales: { 'en-US': aes192En, 'zh-CN': aes192Zh } },
  'aes256-v2-kat': { lesson: aes256, locales: { 'en-US': aes256En, 'zh-CN': aes256Zh } },
}

export const AesV2Demo: React.FC = () => {
  const [client] = useState(() => new ApolloClient({
    cache: new InMemoryCache(),
    // Only the document service is local; Learning owns compilation, execution and presentation.
    link: new ApolloLink((operation) => {
      const language = operation.variables.language === 'zh-CN' ? 'zh-CN' : 'en-US'
      if (operation.operationName === 'LearningCatalog') return of({ data: { learning: { lessonCategories: [{
        id: 'aes-v2',
        name: ['en-US', 'zh-CN'].map((lang) => ({ lang, text: i18n.getFixedT(lang, 'demos')('aesV2.category') })),
        lessons: Object.entries(lessons).map(([id, documents]) => ({ id, title: parse(documents.locales[language]).title })),
      }] } } })
      if (operation.operationName === 'LessonDocuments') {
        const documents = lessons[operation.variables.lessonId]
        return of({ data: { lessonDocuments: documents ? { lesson: documents.lesson, locale: documents.locales[language] } : null } })
      }
      if (operation.operationName === 'Practices') return of({ data: { practice: { labCategories: [] } } })
      throw new Error(`Unsupported demo query: ${operation.operationName}`)
    }),
  }))
  return <BrowserRouter><OverlaysProvider><ApolloProvider client={client}>
    <div className="app" style={{ height: '100%' }}><Shell><LearningPage /></Shell></div>
  </ApolloProvider></OverlaysProvider></BrowserRouter>
}
