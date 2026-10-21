import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue, AlphabetDirectionValue, TextValue } from '../index'
import type { Operation } from '../operation'
import { diagnostic, text, CipherDiagnostic } from '../operation_support'

export type TranspositionParameters = { rows?: number }

export const transposition: Operation<'classical.transposition@1', TranspositionParameters> = {
  manifest: {
    identity: 'classical.transposition@1',
    inputs: [
      { name: 'text', type: { family: 'text' } },
      { name: 'rows', type: { family: 'integer', signed: true, safe: true } },
      { name: 'direction', type: { family: 'alphabet-direction' } },
    ],
    outputs: [{ name: 'text', type: { family: 'text' } }],
  },
  validateParameters(parameters, node) {
    const value = parameters.rows
    if (value === undefined) return []
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 2 || value > 12) {
      return [diagnostic('cipher.invalid-transposition-rows', 'Transposition rows must be an integer from 2 through 12.', `${node.id}.inputs.rows`, node, { reason: typeof value === 'number' && !Number.isSafeInteger(value) ? 'unsafe' : 'range', minimum: 2, maximum: 12 })]
    }
    return []
  },
  execute(inputs) {
    const input = inputs.text as TextValue
    const rows = inputs.rows as IntegerValue
    const direction = inputs.direction as AlphabetDirectionValue
    if (!Number.isSafeInteger(rows.value) || rows.value < 2 || rows.value > 12) {
      throw new CipherDiagnostic('cipher.invalid-transposition-rows', 'Transposition rows must be an integer from 2 through 12.', { reason: Number.isSafeInteger(rows.value) ? 'range' : 'integer', minimum: 2, maximum: 12 })
    }
    const symbols = input.symbols
    const textValue = (value: readonly string[]): TextValue => ({ type: { family: 'text' }, symbols: [...value] })
    if (symbols.length < rows.value) return { text: textValue(symbols) }
    if (direction.value === 'encrypt') {
      const output: string[] = []
      for (let row = 0; row < rows.value; row += 1) for (let column = 0; row + column * rows.value < symbols.length; column += 1) output.push(symbols[row + column * rows.value])
      return { text: textValue(output) }
    }
    const width = Math.floor(symbols.length / rows.value)
    const remainder = symbols.length % rows.value
    const grid: string[][] = []
    let offset = 0
    for (let row = 0; row < rows.value; row += 1) { const length = width + (row < remainder ? 1 : 0); grid.push(symbols.slice(offset, offset + length) as string[]); offset += length }
    const output: string[] = []
    for (let column = 0; column < width + (remainder > 0 ? 1 : 0); column += 1) for (let row = 0; row < rows.value; row += 1) if (grid[row][column] !== undefined) output.push(grid[row][column])
    return { text: textValue(output) }
  },
}
