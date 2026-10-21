import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { validPermutation, diagnostic, bytes, bits } from '../operation_support'

export type PermuteParameters = { permutation: readonly number[] }

export const permute: Operation<'spn.permute@1', PermuteParameters> = {
  manifest: {
    identity: 'spn.permute@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 16 } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 16 } }],
  },
  validateParameters(parameters, node) {
    return validPermutation(parameters.permutation, 4)
      ? []
      : [diagnostic('spn.invalid-permutation', 'Permutation must be a permutation of 0 through 3.', `${node.id}.parameters.permutation`, node)]
  },
  lineage(parameters, inputTypes) {
    const size = inputTypes.value?.family === 'bits' ? inputTypes.value.size as number : 16
    const permutation = parameters.permutation
    const inverse = permutation.reduce<number[]>((result, source, destination) => {
      result[source] = destination
      return result
    }, [])
    return { value: Array.from({ length: size }, (_, bit) => {
      const nibble = Math.floor(bit / 4)
      return [{ port: 'value', bit: (inverse[nibble] ?? 0) * 4 + bit % 4 }]
    }) }
  },
  execute(inputs, parameters) {
    const input = inputs.value as BitsValue
    const nibbles = [input.bytes[0] >> 4, input.bytes[0] & 0x0f, input.bytes[1] >> 4, input.bytes[1] & 0x0f]
    const output = new Uint8Array(4)
    for (const [index, destination] of parameters.permutation.entries()) output[destination] = nibbles[index]
    return { value: bits(16, Uint8Array.of((output[0] << 4) | output[1], (output[2] << 4) | output[3])) }
  },
}
