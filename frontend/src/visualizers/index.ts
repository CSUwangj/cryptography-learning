import type { PortType } from '../crypto_graph'

export type VisualizerDescriptor = {
  readonly id: string
  readonly major: number
  readonly slots: Readonly<Record<string, { readonly family: string }>>
  readonly trace: { readonly family: 'comparison' | 'execution'; readonly level: 'detail' }
  readonly inputSlots: Readonly<Record<string, PortType>>
  readonly traceLevels: readonly ('detail')[]
  readonly tracePaths: readonly string[]
  readonly options: Readonly<Record<string, 'boolean' | 'number' | 'string'>>
  readonly limits: { readonly bits: number }
  readonly dimensions: { readonly minWidth: number; readonly minHeight: number }
  readonly accessibility: { readonly summary: string }
}

const avalanche: VisualizerDescriptor = Object.freeze({
  id: 'avalanche',
  major: 1,
  slots: Object.freeze({ comparison: Object.freeze({ family: 'avalanche-comparison' }) }),
  trace: Object.freeze({ family: 'comparison', level: 'detail' }),
  inputSlots: Object.freeze({}),
  traceLevels: Object.freeze(['detail'] as const),
  tracePaths: Object.freeze([]),
  options: Object.freeze({}),
  limits: Object.freeze({ bits: 16 }),
  dimensions: Object.freeze({ minWidth: 900, minHeight: 500 }),
  accessibility: Object.freeze({ summary: 'avalanche.summary' }),
})

const teachingSpn: VisualizerDescriptor = Object.freeze({
  id: 'teaching-spn',
  major: 1,
  slots: Object.freeze({}),
  trace: Object.freeze({ family: 'execution', level: 'detail' }),
  inputSlots: Object.freeze({}),
  traceLevels: Object.freeze(['detail'] as const),
  tracePaths: Object.freeze(['output']),
  options: Object.freeze({}),
  limits: Object.freeze({ bits: 128 }),
  dimensions: Object.freeze({ minWidth: 900, minHeight: 500 }),
  accessibility: Object.freeze({ summary: 'teaching-spn.summary' }),
})

const classicalCipher: VisualizerDescriptor = Object.freeze({
  id: 'classical-cipher',
  major: 1,
  slots: Object.freeze({ cipher: Object.freeze({ family: 'classical-cipher' }) }),
  trace: Object.freeze({ family: 'execution', level: 'detail' }),
  inputSlots: Object.freeze({
    plaintext: Object.freeze({ family: 'alphabet-text', mapping: '*' }),
    ciphertext: Object.freeze({ family: 'alphabet-text', mapping: '*' }),
    policy: Object.freeze({ family: 'alphabet-policy' }),
  }),
  traceLevels: Object.freeze(['detail'] as const),
  tracePaths: Object.freeze(['output']),
  options: Object.freeze({}),
  limits: Object.freeze({ bits: 0 }),
  dimensions: Object.freeze({ minWidth: 300, minHeight: 160 }),
  accessibility: Object.freeze({ summary: 'classical-cipher.summary' }),
})

const descriptors = new Map([
  [`${avalanche.id}@${avalanche.major}`, avalanche],
  [`${teachingSpn.id}@${teachingSpn.major}`, teachingSpn],
  [`${classicalCipher.id}@${classicalCipher.major}`, classicalCipher],
])

export const visualizerCatalog = Object.freeze({
  get: (id: string): VisualizerDescriptor | undefined => descriptors.get(id),
})

export type VisualizerCatalog = typeof visualizerCatalog
export { RenderHost } from './RenderHost'
