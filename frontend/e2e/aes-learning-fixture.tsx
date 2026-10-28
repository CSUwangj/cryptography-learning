import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { LearningPresentationView, type LearningPresentation } from '../src/ui/learning'

const bitValue = (bit: number, width: number): string => ((width - bit) % 2).toString()

const bits = (prefix: string, width: number, label: string) => Array.from({ length: width }, (_, bit) => ({
  id: `${prefix}-${bit}`,
  bit,
  value: bitValue(bit, width),
  ariaLabel: `${label}, Bit ${bit}: ${bitValue(bit, width)}`,
}))

const row = (id: string, width: number, label: string) => ({
  id,
  label,
  cells: [{ value: label }, { value: `bits<${width}>` }],
  selectableBits: bits(id, width, label),
  bitGrouping: { size: 8 },
})

export const aesFixturePresentation = (width: 128 | 192 | 256): LearningPresentation => {
  const input = row('input', width, `AES-${width} input`)
  const mixed = row('mixed', width, 'Fan-in and fan-out')
  const output = row('output', width, 'Output')
  const unrelated = row('unrelated', width, 'Unrelated path')
  const relationships = [
    { from: 'input-0', to: 'mixed-0' },
    { from: 'input-1', to: 'mixed-0' },
    { from: 'mixed-0', to: 'output-0' },
    { from: 'input-2', to: 'unrelated-2' },
    { from: 'input-3', to: 'mixed-1' },
    { from: 'input-3', to: 'output-1' },
  ]
  return {
    title: `AES-${width} fixture`,
    instructions: 'Synthetic fixture for shared Learning renderer geometry and lineage.',
    executionIdentity: `aes-fixture-${width}`,
    sections: [{
      kind: 'trace',
      caption: 'Operation rows',
      headers: ['Stage', 'Value'],
      rows: [
        { ...input, relationships: [] },
        { ...mixed, relationships },
        { ...output, relationships: [] },
        { ...unrelated, relationships: [] },
      ],
    }],
  }
}

export const aesOverlayFixturePresentation: LearningPresentation = {
  title: 'AES anchored overlay fixture',
  instructions: 'Synthetic fixture for anchored schedule alignment.',
  executionIdentity: 'aes-overlay-fixture',
  sections: [{
    kind: 'trace',
    caption: 'Cipher state',
    headers: ['Stage', 'Value'],
    rows: [
      { ...row('state-0', 16, 'State 0'), selectableKey: { id: 'key-0', value: '0x0011', ariaLabel: 'Round key 0: 0x0011' } },
      { ...row('state-1', 16, 'State 1'), selectableKey: { id: 'key-1', value: '0x2233', ariaLabel: 'Round key 1: 0x2233' } },
    ],
  }],
  keyExpansionLane: {
    caption: 'Key expansion',
    closeLabel: 'Close key expansion',
    rows: [
      { id: 'schedule-input', label: 'Schedule input', anchor: 'state-0', selectableBits: bits('schedule-input', 16, 'Schedule input'), bitGrouping: { size: 8 } },
      { id: 'schedule-round-key-0', label: 'Round key 0', selectableBits: bits('schedule-round-key-0', 16, 'Round key 0'), bitGrouping: { size: 8 } },
      { id: 'schedule-round-key-1', label: 'Round key 1', anchor: 'state-1', selectableBits: bits('schedule-round-key-1', 16, 'Round key 1'), bitGrouping: { size: 8 } },
    ],
  },
}

export const mountAesFixture = (presentation: LearningPresentation): { readonly element: HTMLElement; readonly unmount: () => void } => {
  const element = document.createElement('div')
  document.body.append(element)
  const root: Root = createRoot(element)
  flushSync(() => root.render(<LearningPresentationView presentation={presentation} />))
  return { element, unmount: () => { root.unmount(); element.remove() } }
}
