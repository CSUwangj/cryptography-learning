import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { diagnostic, bytesForBits, bitAt, setBit, bits } from '../operation_support'

export type EmptyParameters = Record<never, never>

export const concat: Operation<'core.concat@1', EmptyParameters> = {
  manifest: {
    identity: 'core.concat@1',
    inputs: [{ name: 'left', type: { family: 'bits', size: 'L' } }, { name: 'right', type: { family: 'bits', size: 'R' } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
  },
  inferOutputTypes(inputTypes) {
    const left = inputTypes.left
    const right = inputTypes.right
    return left?.family === 'bits' && right?.family === 'bits'
      ? { ok: true, value: { value: { family: 'bits', size: (left.size as number) + (right.size as number) } } }
      : { ok: false, diagnostics: [diagnostic('graph.unresolved-type', 'V2 graph output type cannot be resolved.', 'inputs')] }
  },
  lineage: (_, inputTypes) => {
    const left = inputTypes.left?.family === 'bits' ? inputTypes.left.size as number : 0
    const right = inputTypes.right?.family === 'bits' ? inputTypes.right.size as number : 0
    return { value: [
      ...Array.from({ length: left }, (_, bit) => [{ port: 'left', bit }]),
      ...Array.from({ length: right }, (_, bit) => [{ port: 'right', bit }]),
    ] }
  },
  execute(inputs) {
    const left = inputs.left as BitsValue
    const right = inputs.right as BitsValue
    const joined = new Uint8Array(bytesForBits(left.type.size + right.type.size))
    const size = left.type.size + right.type.size
    for (let index = 0; index < left.type.size; index += 1) if (bitAt(left, index)) setBit(joined, size, index)
    for (let index = 0; index < right.type.size; index += 1) if (bitAt(right, index)) setBit(joined, size, left.type.size + index)
    return { value: bits(left.type.size + right.type.size, joined) }
  },
}
