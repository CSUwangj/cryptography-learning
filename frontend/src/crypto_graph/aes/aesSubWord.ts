import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { bits, bytes } from '../operation_support'
import { aesSBox } from './helpers'

export type EmptyParameters = Record<never, never>

export const aesSubWord: Operation<'aes.sub-word@1', EmptyParameters> = {
  manifest: {
    identity: 'aes.sub-word@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
  },
  lineage: () => ({ value: Array.from({ length: 32 }, (_, bit) => Array.from({ length: 8 }, (_, sourceBit) => ({ port: 'value', bit: Math.floor(bit / 8) * 8 + sourceBit }))) }),
  execute(inputs) {
    const value = inputs.value as BitsValue
    return { value: bits(32, value.bytes.map((byte) => aesSBox[byte])) }
  },
}
