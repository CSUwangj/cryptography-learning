import React, { useMemo } from 'react'
import type { WorkerExecutionSnapshot } from 'crypto_graph'
import { LearningPresentationView, type LearningPresentation } from '../ui/learning'
import { aesKeyExpansionPresentation } from './AesKeyExpansion'

type Locale = 'en-US' | 'zh-CN'
type Variant = 128 | 192 | 256

export type KeyExpansionPresentationMeta = {
  readonly algorithm: 'AES'
  readonly variant: Variant
}

export type KeyExpansionRendererProps = {
  readonly execution: WorkerExecutionSnapshot
  readonly locale: string
  readonly executionIdentity: string
  readonly presentation: KeyExpansionPresentationMeta
}

const copy = {
  'en-US': { title: (variant: Variant) => `AES-${variant} key expansion` },
  'zh-CN': { title: (variant: Variant) => `AES-${variant} 密钥扩展` },
} as const

/** Generic key-expansion Learning presentation; variant comes only from explicit metadata. */
export const keyExpansionPresentation = (
  execution: WorkerExecutionSnapshot,
  locale: string,
  executionIdentity: string,
  meta: KeyExpansionPresentationMeta,
): LearningPresentation => {
  const text = copy[locale as Locale] ?? copy['en-US']
  // Reuse the established AES key-expansion lane/trace until post-#86 migration retires AesKeyExpansion.
  return { ...aesKeyExpansionPresentation(execution, locale, executionIdentity), title: text.title(meta.variant) }
}

export const KeyExpansionRenderer: React.FC<KeyExpansionRendererProps> = ({ execution, locale, executionIdentity, presentation }) => {
  const learning = useMemo(
    () => keyExpansionPresentation(execution, locale, executionIdentity, presentation),
    [execution, locale, executionIdentity, presentation],
  )
  return <LearningPresentationView presentation={learning} />
}
