import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { diagnostic, validPermutation, bits, bytes } from '../operation_support'

export type PermuteBytesParameters = { permutation: readonly number[] }

export const permuteBytes: Operation<'core.permute-bytes@1', PermuteBytesParameters> = {
  manifest: {
    identity: 'core.permute-bytes@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
  },
  validateParameters(parameters, node) {
    return Array.isArray(parameters.permutation) && Array.from(parameters.permutation).every((value) => Number.isSafeInteger(value) && value >= 0)
      ? []
      : [diagnostic('operation.invalid-permutation', 'Permutation must contain non-negative integers.', `${node.id}.parameters.permutation`, node)]
  },
  inferOutputTypes(inputTypes, parameters) {
    const type = inputTypes.value
    if (type?.family !== 'bits' || typeof type.size !== 'number' || type.size % 8 !== 0) {
      return { ok: false, diagnostics: [diagnostic('operation.invalid-byte-width', 'Byte permutation requires a bits width divisible by 8.', 'inputs.value')] }
    }
    return validPermutation(parameters.permutation, type.size / 8)
      ? { ok: true, value: { value: type } }
      : { ok: false, diagnostics: [diagnostic('operation.invalid-permutation', 'Permutation must cover each input byte exactly once.', 'parameters.permutation')] }
  },
  lineage(parameters, inputTypes) {
    const size = inputTypes.value?.family === 'bits' ? inputTypes.value.size as number : 0
    const permutation = parameters.permutation
    return { value: Array.from({ length: size }, (_, bit) => {
      const byte = Math.floor(bit / 8)
      return [{ port: 'value', bit: (permutation[byte] ?? 0) * 8 + bit % 8 }]
    }) }
  },
  execute(inputs, parameters) {
    const input = inputs.value as BitsValue
    const permutation = parameters.permutation
    return { value: bits(input.type.size, Uint8Array.from(permutation.map((index) => input.bytes[index]))) }
  },
}
