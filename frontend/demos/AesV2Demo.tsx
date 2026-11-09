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

// Keep this interaction fixture to the first real AES-128 generation; runtime tests cover full schedules.
const keyExample = parse(aes128)
keyExample.graphs.schedule.nodes = keyExample.graphs.schedule.nodes.slice(0, 7)
keyExample.graphs.schedule.outputs = keyExample.graphs.schedule.outputs.slice(0, 2)
const standaloneKeyDocuments: LessonDocuments = {
  ...keyAvalancheLesson({ lesson: stringify(keyExample), locales: {} }),
  locales: {
    'en-US': `title: Inspect one original-key bit
summary: Inspect the first real AES-128 key-schedule generation after changing one original-key bit.
texts:
  introduction: Edit the original key and choose one MSB-first bit. Continue to inspect the paired schedule. Choosing another bit replaces the previous flip.
  key: Original key
`,
    'zh-CN': `title: 检查一个原始密钥位
summary: 改变一个原始密钥位，检查真实 AES-128 密钥编排的首轮生成。
texts:
  introduction: 编辑原始密钥并选择一个从最高有效位开始编号的位。继续下一步查看成对编排。更换位会替换之前的翻转。
  key: 原始密钥
`,
  },
}

const comparisonLessons: Readonly<Record<string, LessonDocuments>> = {
  'generic-comparison': genericComparisonDocuments,
  'data-avalanche': dataAvalancheDocuments,
  'key-avalanche': standaloneKeyDocuments,
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
      }, {
        id: 'comparison',
        name: ['en-US', 'zh-CN'].map((lang) => ({ lang, text: i18n.t('nav.learning', { lng: lang }) })),
        lessons: Object.entries(comparisonLessons).map(([id, documents]) => ({ id, title: parse(documents.locales[language]).title })),
      }] } } })
      if (operation.operationName === 'LessonDocuments') {
        const documents = comparisonLessons[operation.variables.lessonId] ?? lessons[operation.variables.lessonId]
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
