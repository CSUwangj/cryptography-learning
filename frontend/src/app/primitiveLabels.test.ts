import { describe, expect, it } from 'vitest'
import enUSPrimitiveLabels from './i18n/locales/en-US/primitives.json'
import zhCNPrimitiveLabels from './i18n/locales/zh-CN/primitives.json'
import { operationManifests } from 'crypto_graph'
import i18n from './i18n'

describe('primitive labels', () => {
  it('registers matching, nonempty bilingual resources in all four namespaces', () => {
    const keys = (resource: object, prefix = ''): string[] => Object.entries(resource).flatMap(([key, value]) => {
      if (typeof value === 'string') {
        expect(value.length).toBeGreaterThan(0)
        return [prefix + key]
      }
      return keys(value, prefix + key + '.')
    }).sort()
    for (const namespace of ['translations', 'primitives', 'visualizers', 'demos']) {
      expect(keys(i18n.getResourceBundle('zh-CN', namespace)))
        .toEqual(keys(i18n.getResourceBundle('en-US', namespace)))
    }
  })

  it('resets a native prefix for dotted primitive IDs and preserves runtime interpolation', () => {
    const t = i18n.getFixedT('zh-CN', 'visualizers', 'executionTrace')
    expect(t('title')).toBe('执行轨迹')
    expect(t('core.xor@1', { ns: 'primitives', keyPrefix: '', keySeparator: false })).toBe('异或')
    const applicationT = i18n.getFixedT('zh-CN', 'translations')
    for (const count of [0, 1, 2]) {
      expect(applicationT('completion.total', { label: '<runtime>&{{unchanged}}', count }))
        .toBe(`<runtime>&{{unchanged}}：${count}`)
    }
  })

  it('falls back to English UI and preserves count interpolation', async () => {
    await i18n.changeLanguage('fr-FR')
    expect(i18n.t('nav.learning')).toBe('Learning')
    for (const count of [0, 1, 2]) {
      expect(i18n.t('completion.total', { label: 'Records', count })).toBe(`Records: ${count}`)
    }
    await i18n.changeLanguage('en-US')
  })

  it('provides bilingual labels for every registered operation', () => {
    for (const manifest of operationManifests) {
      expect(enUSPrimitiveLabels[manifest.identity as keyof typeof enUSPrimitiveLabels]).toBeTruthy()
      expect(zhCNPrimitiveLabels[manifest.identity as keyof typeof zhCNPrimitiveLabels]).toBeTruthy()
    }
  })
})
