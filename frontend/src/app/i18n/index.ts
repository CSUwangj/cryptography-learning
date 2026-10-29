import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import Backend from 'i18next-http-backend'
import LanguageDetector from 'i18next-browser-languagedetector'
import enUStranslations from './locales/en-US/translations.json'
import enUSprimitives from './locales/en-US/primitives.json'
import enUSvisualizers from './locales/en-US/visualizers.json'
import enUSdemos from './locales/en-US/demos.json'
import zhCNtranslations from './locales/zh-CN/translations.json'
import zhCNprimitives from './locales/zh-CN/primitives.json'
import zhCNvisualizers from './locales/zh-CN/visualizers.json'
import zhCNdemos from './locales/zh-CN/demos.json'

export const primitiveResources = { 'en-US': enUSprimitives, 'zh-CN': zhCNprimitives } as const

void i18n.use(Backend).use(LanguageDetector).use(initReactI18next).init({
  supportedLngs: ['en-US', 'zh-CN'],
  fallbackLng: 'en-US',
  defaultNS: 'translations',
  ns: ['translations', 'primitives', 'visualizers', 'demos'],
  react: { useSuspense: false },
  resources: {
    'en-US': { translations: enUStranslations, primitives: enUSprimitives, visualizers: enUSvisualizers, demos: enUSdemos },
    'zh-CN': { translations: zhCNtranslations, primitives: zhCNprimitives, visualizers: zhCNvisualizers, demos: zhCNdemos },
  },
  interpolation: { escapeValue: false },
})

export default i18n
