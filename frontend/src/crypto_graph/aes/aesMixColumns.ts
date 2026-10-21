import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { bytes, bits } from '../operation_support'
import { mixColumn } from './helpers'

export type EmptyParameters = Record<never, never>

export const aesMixColumns: Operation<'aes.mix-columns@1', EmptyParameters> = {
  manifest: {
    identity: 'aes.mix-columns@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 128 } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 128 } }],
  },
  lineage: (_, inputTypes) => {
    const size = inputTypes.value?.family === 'bits' ? inputTypes.value.size as number : 128
    return { value: Array.from({ length: size }, (_, bit) => {
      const column = Math.floor(Math.floor(bit / 8) / 4)
      return Array.from({ length: 32 }, (_, sourceBit) => ({ port: 'value', bit: column * 32 + sourceBit }))
    }) }
  },
  execute(inputs) {
    const value = (inputs.value as BitsValue).bytes
    const output = new Uint8Array(16)
    for (let column = 0; column < 4; column += 1) output.set(mixColumn(value.slice(column * 4, column * 4 + 4), [2, 3, 1, 1]), column * 4)
    return { value: bits(128, output) }
  },
}
