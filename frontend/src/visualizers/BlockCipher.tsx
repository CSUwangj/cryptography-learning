import React, { useMemo } from 'react'
import type { WorkerExecutionSnapshot } from 'crypto_graph'
import { LearningPresentationView, type LearningPresentation } from '../ui/learning'
import { executionTracePresentation } from './ExecutionTrace'

type Locale = 'en-US' | 'zh-CN'
type Variant = 128 | 192 | 256
type Direction = 'encrypt' | 'decrypt'

export type BlockCipherPresentationMeta = {
  readonly algorithm: 'AES'
  readonly variant: Variant
  readonly direction: Direction
}

export type BlockCipherRendererProps = {
  readonly execution: WorkerExecutionSnapshot
  readonly locale: string
  readonly executionIdentity: string
  readonly presentation: BlockCipherPresentationMeta
}

const copy = {
  'en-US': {
    encrypt: (variant: Variant) => `AES-${variant} encryption`,
    decrypt: (variant: Variant) => `AES-${variant} decryption`,
  },
  'zh-CN': {
    encrypt: (variant: Variant) => `AES-${variant} 加密`,
    decrypt: (variant: Variant) => `AES-${variant} 解密`,
  },
} as const

/** Generic block-cipher Learning presentation; variant/direction come only from explicit metadata. */
export const blockCipherPresentation = (
  execution: WorkerExecutionSnapshot,
  locale: string,
  executionIdentity: string,
  meta: BlockCipherPresentationMeta,
): LearningPresentation => {
  const text = copy[locale as Locale] ?? copy['en-US']
  const generic = executionTracePresentation(execution, locale, executionIdentity)
  return {
    ...generic,
    title: meta.direction === 'encrypt' ? text.encrypt(meta.variant) : text.decrypt(meta.variant),
    diagnostics: generic.diagnostics?.map((diagnostic) => ({ ...diagnostic, code: 'aes.cipher-trace-incomplete' })),
  }
}

export const BlockCipherRenderer: React.FC<BlockCipherRendererProps> = ({ execution, locale, executionIdentity, presentation }) => {
  const learning = useMemo(
    () => blockCipherPresentation(execution, locale, executionIdentity, presentation),
    [execution, locale, executionIdentity, presentation],
  )
  return <LearningPresentationView presentation={learning} />
}
