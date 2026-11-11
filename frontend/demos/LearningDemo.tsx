import React, { useState } from 'react'
import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { OverlaysProvider } from '@blueprintjs/core'
import { BrowserRouter } from 'react-router-dom'
import { of } from 'rxjs'
import { parse, stringify } from 'yaml'
import { Shell, i18n } from '../src/app'
import { LearningPage } from '../src/learning'
import type { LessonDocuments } from '../src/lesson_runtime'
import { genericComparisonDocuments } from './genericComparisonLesson'
import { dataAvalancheDocuments } from './dataAvalancheLesson'
import { keyAvalancheLesson } from './keyAvalancheLesson'
import { aesKeyChangeLesson } from './keyChangeLesson'
import { caesarV2Documents } from './caesarLesson'
import { classicalV2Documents } from './classicalV2Lessons'
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
import { serializeLessonLocales } from './serializeLessonLocales'
import enUS from './locales/en-US/standaloneKey.json' with { type: 'json' }
import zhCN from './locales/zh-CN/standaloneKey.json' with { type: 'json' }

const locales = { 'en-US': enUS, 'zh-CN': zhCN }

const lessons: Readonly<Record<string, LessonDocuments>> = {
  'aes128-v2-kat': { lesson: aes128, locales: { 'en-US': aes128En, 'zh-CN': aes128Zh } },
  'aes192-v2-kat': { lesson: aes192, locales: { 'en-US': aes192En, 'zh-CN': aes192Zh } },
  'aes256-v2-kat': { lesson: aes256, locales: { 'en-US': aes256En, 'zh-CN': aes256Zh } },
}

// Keep this interaction fixture to the first real AES-128 generation; runtime tests cover full schedules.
const keyExample = parse(aes128)
keyExample.graphs.schedule.nodes = keyExample.graphs.schedule.nodes.slice(0, 7)
keyExample.graphs.schedule.outputs = keyExample.graphs.schedule.outputs.slice(0, 2)
const standaloneKeyDocuments: LessonDocuments = {
  ...keyAvalancheLesson({ lesson: stringify(keyExample), locales: {} }),
  locales: serializeLessonLocales(locales),
}

const classicalLessons: Readonly<Record<string, LessonDocuments>> = {
  'caesar-v2': caesarV2Documents,
  'vigenere-v2': classicalV2Documents('vigenere'),
  'affine-v2': classicalV2Documents('affine'),
  'substitution-v2': classicalV2Documents('substitution'),
  'transposition-v2': classicalV2Documents('transposition'),
}

const comparisonLessons: Readonly<Record<string, LessonDocuments>> = {
  'generic-comparison': genericComparisonDocuments,
  'data-avalanche': dataAvalancheDocuments,
  'key-avalanche': standaloneKeyDocuments,
  'aes128-key-change-encrypt': aesKeyChangeLesson(lessons['aes128-v2-kat'], 128, 'encrypt'),
  'aes128-key-change-decrypt': aesKeyChangeLesson(lessons['aes128-v2-kat'], 128, 'decrypt'),
}

export const LearningDemo: React.FC = () => {
  const [client] = useState(() => new ApolloClient({
    cache: new InMemoryCache(),
    // Only the document service is local; Learning owns compilation, execution and presentation.
    link: new ApolloLink((operation) => {
      const language = operation.variables.language === 'zh-CN' ? 'zh-CN' : 'en-US'
      if (operation.operationName === 'LearningCatalog') return of({ data: { learning: { lessonCategories: [{
        id: 'aes-v2',
        name: ['en-US', 'zh-CN'].map((lang) => ({ lang, text: i18n.getFixedT(lang, 'demos')('learning.categories.aes') })),
        lessons: Object.entries(lessons).map(([id, documents]) => ({ id, title: parse(documents.locales[language]).title })),
      }, {
        id: 'classical',
        name: ['en-US', 'zh-CN'].map((lang) => ({ lang, text: i18n.getFixedT(lang, 'demos')('learning.categories.classical') })),
        lessons: Object.entries(classicalLessons).map(([id, documents]) => ({ id, title: parse(documents.locales[language]).title })),
      }, {
        id: 'comparison',
        name: ['en-US', 'zh-CN'].map((lang) => ({ lang, text: i18n.getFixedT(lang, 'demos')('learning.categories.comparison') })),
        lessons: Object.entries(comparisonLessons).map(([id, documents]) => ({ id, title: parse(documents.locales[language]).title })),
      }] } } })
      if (operation.operationName === 'LessonDocuments') {
        const documents = comparisonLessons[operation.variables.lessonId] ?? classicalLessons[operation.variables.lessonId] ?? lessons[operation.variables.lessonId]
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
