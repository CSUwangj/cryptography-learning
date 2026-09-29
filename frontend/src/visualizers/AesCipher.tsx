import React, { useMemo } from 'react'
import type { WorkerExecutionSnapshot } from 'crypto_graph'
import { LearningPresentationView, type LearningPresentation } from '../ui/learning'
import { executionTracePresentation } from './ExecutionTrace'

type Locale = 'en-US' | 'zh-CN'

export type AesCipherRendererProps = {
  readonly execution: WorkerExecutionSnapshot
  readonly locale: string
  readonly executionIdentity: string
}

const copy = {
  'en-US': { encryptTitle: 'AES-128 encryption', decryptTitle: 'AES-128 decryption' },
  'zh-CN': { encryptTitle: 'AES-128 加密', decryptTitle: 'AES-128 解密' },
} as const

/** Kept for Lessons already bound to `aes-cipher@1`; ordinary AES traces need no descriptor. */
export const aesCipherPresentation = (execution: WorkerExecutionSnapshot, locale: string, executionIdentity: string): LearningPresentation => {
  const text = copy[locale as Locale] ?? copy['en-US']
  const generic = executionTracePresentation(execution, locale, executionIdentity)
  return {
    ...generic,
    title: execution.trace.some((event) => event.path === 'ciphertext') ? text.decryptTitle : text.encryptTitle,
    diagnostics: generic.diagnostics?.map((diagnostic) => ({ ...diagnostic, code: 'aes.cipher-trace-incomplete' })),
  }
}

export const AesCipherRenderer: React.FC<AesCipherRendererProps> = ({ execution, locale, executionIdentity }) => {
  const presentation = useMemo(() => aesCipherPresentation(execution, locale, executionIdentity), [execution, locale, executionIdentity])
  return <LearningPresentationView presentation={presentation} />
}
