import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { bits, bytes } from '../operation_support'

export type EmptyParameters = Record<never, never>

export const xor: Operation<'core.xor@1', EmptyParameters> = {
  manifest: {
    identity: 'core.xor@1',
    inputs: [{ name: 'left', type: { family: 'bits', size: 'N' } }, { name: 'right', type: { family: 'bits', size: 'N' } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
  },
  lineage: (_, inputTypes) => {
    const size = inputTypes.left?.family === 'bits' ? inputTypes.left.size as number : 0
    return { value: Array.from({ length: size }, (_, bit) => [{ port: 'left', bit }, { port: 'right', bit }]) }
  },
  execute(inputs) {
    const left = inputs.left as BitsValue
    const right = inputs.right as BitsValue
    return { value: bits(left.type.size, left.bytes.map((value, index) => value ^ right.bytes[index])) }
  },
}
