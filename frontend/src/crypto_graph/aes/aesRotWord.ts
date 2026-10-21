import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { bytes, bits } from '../operation_support'

export type EmptyParameters = Record<never, never>

export const aesRotWord: Operation<'aes.rot-word@1', EmptyParameters> = {
  manifest: {
    identity: 'aes.rot-word@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
  },
  lineage: () => ({ value: Array.from({ length: 32 }, (_, bit) => [{ port: 'value', bit: (bit + 8) % 32 }]) }),
  execute(inputs) {
    const value = (inputs.value as BitsValue).bytes
    return { value: bits(32, Uint8Array.of(value[1], value[2], value[3], value[0])) }
  },
}
