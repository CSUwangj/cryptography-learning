import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { words, bytes, bits } from '../operation_support'

export type EmptyParameters = Record<never, never>

export const aesRoundKey: Operation<'aes.round-key@1', EmptyParameters> = {
  manifest: {
    identity: 'aes.round-key@1',
    inputs: [
      { name: 'w0', type: { family: 'bits', size: 32 } },
      { name: 'w1', type: { family: 'bits', size: 32 } },
      { name: 'w2', type: { family: 'bits', size: 32 } },
      { name: 'w3', type: { family: 'bits', size: 32 } },
    ],
    outputs: [{ name: 'value', type: { family: 'bits', size: 128 } }],
  },
  lineage: (_, inputTypes) => ({ value: Array.from({ length: 128 }, (_, bit) => [{ port: `w${Math.floor(bit / 32)}`, bit: bit % 32 }]) }),
  execute(inputs) {
    const words = (['w0', 'w1', 'w2', 'w3'] as const).flatMap((name) => [...(inputs[name] as BitsValue).bytes])
    return { value: bits(128, Uint8Array.from(words)) }
  },
}
