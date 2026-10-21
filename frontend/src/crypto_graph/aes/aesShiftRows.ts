import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { bytes, bits } from '../operation_support'

export type EmptyParameters = Record<never, never>

export const aesShiftRows: Operation<'aes.shift-rows@1', EmptyParameters> = {
  manifest: {
    identity: 'aes.shift-rows@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 128 } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 128 } }],
  },
  lineage: (_, inputTypes) => {
    const size = inputTypes.value?.family === 'bits' ? inputTypes.value.size as number : 128
    const permutation = [0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12, 1, 6, 11]
    return { value: Array.from({ length: size }, (_, bit) => [{ port: 'value', bit: permutation[Math.floor(bit / 8)] * 8 + bit % 8 }]) }
  },
  execute(inputs) {
    const value = (inputs.value as BitsValue).bytes
    const output = new Uint8Array(16)
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) output[row + 4 * column] = value[row + 4 * ((column + row) % 4)]
    }
    return { value: bits(128, output) }
  },
}
