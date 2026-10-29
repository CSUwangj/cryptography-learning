import { it } from 'vitest'
import i18n from '../src/app/i18n'
import { prototypeData, selectedLineage, alignedRows, range } from './aes192OverlayPrototypeData'

const check = (condition: unknown, message: string): void => { if (!condition) throw new Error(message) }

it('preserves prototype lineage and consumption order with an explicit translator', () => {
  // Small executable checks for the prototype adapter, separate from production v2 claims.
  const fixture = prototypeData(i18n.getFixedT('en-US', 'visualizers'), 'forward')
  const selected = selectedLineage(fixture, range(8).map((bit) => `c/cipher-1-add-round-key#${bit}`))
  check(range(8, 128).every((bit) => selected.has(`s/input#${bit}`)), 'selected byte must cross the rk1 anchor')
  check(!selected.has('s/input#136'), 'a highlighted word must not add its other bits')
  check(!selected.has('s/round-key-2#64'), 'ancestors must not introduce their other descendants')
  const selectedWord = selectedLineage(fixture, range(32, 128).map((bit) => `s/input#${bit}`))
  check(selectedWord.has('c/round-key-1#31'), 'explicit word selection must include all its bits')
  for (const direction of ['forward', 'reverse'] as const) {
    const data = direction === 'forward' ? fixture : prototypeData(i18n.getFixedT('en-US', 'visualizers'), direction)
    for (const anchor of ['key', 'operation'] as const) {
      const layout = alignedRows(data, anchor)
      check(layout.filter((row) => row.anchor !== undefined).map((row) => row.anchor).join() === (direction === 'forward' ? '0,1,2' : '2,1,0'), 'anchors must follow consumption order')
      check(new Set(layout.flatMap((row) => row.schedule ? [row.schedule.id] : [])).size === data.scheduleRows.length, 'alignment must retain every schedule row once')
    }
  }

})
