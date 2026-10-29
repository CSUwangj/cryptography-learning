import type { TFunction } from 'i18next'
// PROTOTYPE: fixed AES-192 slice for #95 P0; values use the existing CryptoGraph engine.
import { aesCipherGraph, aesInverseCipherGraph, aesKeyExpansionGraph, bits, compile, hex, type AuthoredGraph, type BitsValue, type CryptoValue, type WorkerExecutionSnapshot } from 'crypto_graph'
import { relatedBitIds, type LearningPresentation, type LearningRelationship, type LearningRow } from '../src/ui/learning'
import { blockCipherPresentation } from '../src/visualizers/BlockCipher'
import { keyExpansionPresentation } from '../src/visualizers/KeyExpansion'

export type PrototypeDirection = 'forward' | 'reverse'
export type PrototypeRow = {
  id: string
  label: string
  value: string
  bitValues: string[]
  unit: number
  round?: number
  sourceOrder?: number
  words?: string
}
export const range = (length: number, start = 0): number[] => Array.from({ length }, (_, i) => start + i)
const check = (condition: unknown, message: string): void => { if (!condition) throw new Error(`AES-192 prototype: ${message}`) }
const fromHex = (value: string): BitsValue => bits(value.length * 4, Uint8Array.from(value.match(/../g)!.map((byte) => parseInt(byte, 16))))
const run = (graph: AuthoredGraph, inputs: Record<string, CryptoValue>): WorkerExecutionSnapshot => {
  const compiled = compile(graph)
  if (!compiled.ok) throw new Error(compiled.diagnostics[0].message)
  const result = compiled.value.execute(inputs)
  if (!result.ok) throw new Error(result.diagnostics[0].message)
  return { ...result.value, traceStatus: { truncated: false, retained: result.value.trace.length, dropped: 0 } }
}

const key = fromHex('000102030405060708090a0b0c0d0e0f1011121314151617')
const plaintext = fromHex('00112233445566778899aabbccddeeff')
const schedule = run(aesKeyExpansionGraph(192), { 'key.value': key })
const encryption = run(aesCipherGraph(192), { ...schedule.outputs, 'plaintext.value': plaintext })
const ciphertext = encryption.outputs['cipher-12-add-round-key.value']
const decryption = run(aesInverseCipherGraph(192), { ...schedule.outputs, 'ciphertext.value': ciphertext })
check(hex(ciphertext as BitsValue) === '0xdda97ca4864cdfe06eaf70a0ec0d7191', 'ciphertext must match the known answer')
check(hex(decryption.outputs['cipher-0-add-round-key.value'] as BitsValue) === hex(plaintext), 'inverse cipher must recover plaintext')
check(hex(schedule.outputs['round-key-1.value'] as BitsValue) === '0x10111213141516175846f2f95c43f4fe', 'rk1 must cross the initial key and generated batch')

const bitValues = (value: BitsValue): string[] => range(value.type.size).map((bit) => String((value.bytes[bit >> 3] >> (7 - bit % 8)) & 1))
const convert = (row: LearningRow, prefix: string, unit: number): PrototypeRow => ({
  id: `${prefix}/${row.id}`,
  label: row.label,
  value: String(row.cells[1]?.value ?? ''),
  bitValues: row.selectableBits?.map((bit) => String(bit.value)) ?? [],
  unit,
  ...(row.id.startsWith('round-key-') ? { round: Number(row.id.slice('round-key-'.length)) } : {}),
})
const prefixEdges = (rows: readonly LearningRow[], prefix: string): LearningRelationship[] => rows.flatMap((row) =>
  (row.relationships ?? []).map(({ from, to }) => ({ from: `${prefix}/${from}`, to: `${prefix}/${to}` })))

export const prototypeData = (t: TFunction<'visualizers'>, direction: PrototypeDirection) => {
  const originalSchedule = keyExpansionPresentation(schedule, t, 'prototype', { algorithm: 'AES', variant: 192 }).sections[0].rows
  const scheduleSlice = originalSchedule.slice(0, originalSchedule.findIndex((row) => row.id === 'round-key-2') + 1)
  const generated = scheduleSlice.find((row) => row.id.startsWith('xor-'))!
  const scheduleRows = scheduleSlice.map((row, sourceOrder) => {
    const converted = { ...convert(row, 's', 32), sourceOrder }
    if (converted.round !== undefined) {
      const value = schedule.outputs[`${row.id}.value`] as BitsValue
      return { ...converted, value: hex(value), bitValues: bitValues(value), words: ['w0..w3', 'w4,w5 | w6,w7', 'w8..w11'][converted.round] }
    }
    return { ...converted, words: row.id === 'input' ? 'w0..w5' : row.id === generated.id ? 'w6..w11' : 'w0..w4 | temp(w5)' }
  })
  const fullCipher = blockCipherPresentation(direction === 'forward' ? encryption : decryption, t, 'prototype', { algorithm: 'AES', variant: 192, direction: direction === 'forward' ? 'encrypt' : 'decrypt' }).sections[0].rows
  const cipherSlice = direction === 'forward'
    ? fullCipher.slice(0, fullCipher.findIndex((row) => row.id === 'cipher-2-add-round-key') + 1)
    : fullCipher.slice(fullCipher.findIndex((row) => row.id === 'cipher-3-inv-mix-columns'), fullCipher.findIndex((row) => row.id === 'cipher-0-add-round-key') + 1)
  const cipherRows = cipherSlice.map((row, index) => ({
    ...convert(row, 'c', 8),
    ...(direction === 'reverse' && index === 0 ? { label: t('aes192Overlay.beforeRoundKey', { ns: 'demos', keyPrefix: '' }) } : {}),
  }))
  // shortcut: fixed rk0-rk2 projections; replace when implementing approved generic v2 lineage.
  const roundKeys = range(3).flatMap((round) => range(128).map((bit) => {
    const source = round === 0 ? `s/input#${bit}`
      : round === 1 && bit < 64 ? `s/input#${128 + bit}`
        : `s/${generated.id}#${round === 1 ? bit - 64 : bit + 64}`
    return { from: source, to: `s/round-key-${round}#${bit}` }
  }))
  const anchors = range(3).flatMap((round) => range(128).map((bit) => ({ from: `s/round-key-${round}#${bit}`, to: `c/round-key-${round}#${bit}` })))
  const allRows = [...scheduleRows, ...cipherRows]
  const visibleBits = new Set(allRows.flatMap((row) => row.bitValues.map((_, bit) => `${row.id}#${bit}`)))
  const relationships = [...prefixEdges(scheduleSlice, 's'), ...roundKeys, ...prefixEdges(cipherSlice, 'c'), ...anchors]
    .filter(({ from, to }) => visibleBits.has(from) && visibleBits.has(to))
  const lineage: LearningPresentation = { title: t('aes192Overlay.prototype', { ns: 'demos', keyPrefix: '' }), sections: [{ kind: 'trace', caption: '', headers: [], rows: [{ id: 'relationships', label: '', cells: [], relationships }] }] }
  // Reverse blocks, never the operations inside a block. Source identities and dependencies stay fixed.
  const groups: PrototypeRow[][] = []
  let pending: PrototypeRow[] = []
  for (const row of scheduleRows) {
    pending.push(row)
    if (row.round !== undefined) { groups.push(pending); pending = [] }
  }
  return { cipherRows, scheduleRows: direction === 'reverse' ? groups.reverse().flat() : scheduleRows, allRows, relationships, lineage }
}
export type PrototypeData = ReturnType<typeof prototypeData>

export const selectedLineage = (data: PrototypeData, seeds: readonly string[]): Set<string> =>
  new Set(seeds.flatMap((seed) => [...relatedBitIds(data.lineage, seed)]))

export const alignedRows = (data: PrototypeData, anchor: 'key' | 'operation'): { cipher?: PrototypeRow; schedule?: PrototypeRow; anchor?: number }[] => {
  const result: { cipher?: PrototypeRow; schedule?: PrototypeRow; anchor?: number }[] = []
  let c = 0
  let s = 0
  for (const row of data.scheduleRows.filter((item) => item.round !== undefined)) {
    const target = anchor === 'key' ? `c/round-key-${row.round}` : `c/cipher-${row.round}-add-round-key`
    const ci = data.cipherRows.findIndex((item) => item.id === target)
    const si = data.scheduleRows.indexOf(row)
    for (let i = 0; i < Math.max(ci - c, si - s); i++) result.push({ cipher: i < ci - c ? data.cipherRows[c + i] : undefined, schedule: i < si - s ? data.scheduleRows[s + i] : undefined })
    result.push({ cipher: data.cipherRows[ci], schedule: row, anchor: row.round })
    c = ci + 1
    s = si + 1
  }
  for (let i = 0; i < Math.max(data.cipherRows.length - c, data.scheduleRows.length - s); i++) result.push({ cipher: data.cipherRows[c + i], schedule: data.scheduleRows[s + i] })
  return result
}

export const bitRanges = (indices: readonly number[]): string => {
  const groups: string[] = []
  for (let i = 0; i < indices.length; i++) {
    const first = indices[i]
    while (i + 1 < indices.length && indices[i + 1] === indices[i] + 1) i++
    groups.push(first === indices[i] ? String(first) : `${first}..${indices[i]}`)
  }
  return groups.join(', ')
}
