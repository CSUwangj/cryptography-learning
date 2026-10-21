import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { bits, bytes } from '../operation_support'

export type EmptyParameters = Record<never, never>

export const aesWordXor: Operation<'aes.word-xor@1', EmptyParameters> = {
  manifest: {
    identity: 'aes.word-xor@1',
    inputs: [{ name: 'left', type: { family: 'bits', size: 32 } }, { name: 'right', type: { family: 'bits', size: 32 } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
  },
  lineage: () => ({ value: Array.from({ length: 32 }, (_, bit) => [{ port: 'left', bit }, { port: 'right', bit }]) }),
  execute(inputs) {
    const left = inputs.left as BitsValue
    const right = inputs.right as BitsValue
    return { value: bits(32, left.bytes.map((byte, index) => byte ^ right.bytes[index])) }
  },
}
