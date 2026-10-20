import { describe, expect, it } from 'vitest'
import enUSPrimitiveLabels from './i18n/locales/en-US/primitives.json'
import zhCNPrimitiveLabels from './i18n/locales/zh-CN/primitives.json'
import { operationManifests } from 'crypto_graph'

describe('primitive labels', () => {
  it('provides bilingual labels for every registered operation', () => {
    for (const manifest of operationManifests) {
      expect(enUSPrimitiveLabels[manifest.identity as keyof typeof enUSPrimitiveLabels]).toBeTruthy()
      expect(zhCNPrimitiveLabels[manifest.identity as keyof typeof zhCNPrimitiveLabels]).toBeTruthy()
    }
  })
})
