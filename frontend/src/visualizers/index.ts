export type VisualizerDescriptor = {
  readonly id: string
  readonly major: number
  readonly slots: Readonly<Record<string, { readonly family: string }>>
  readonly trace: { readonly family: 'comparison'; readonly level: 'detail' }
  readonly inputSlots: Readonly<Record<string, never>>
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

const descriptors = new Map([[`${avalanche.id}@${avalanche.major}`, avalanche]])

export const visualizerCatalog = Object.freeze({
  get: (id: string): VisualizerDescriptor | undefined => descriptors.get(id),
})

export type VisualizerCatalog = typeof visualizerCatalog
export { RenderHost } from './RenderHost'
