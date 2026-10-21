import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { diagnostic, validPermutation, bytesForBits, writeBits, readBits, bits } from '../operation_support'

export type PermuteGatherParameters = { permutation: readonly number[] }

export const permuteGather: Operation<'spn.permute-gather@1', PermuteGatherParameters> = {
  manifest: {
    identity: 'spn.permute-gather@1',
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
    if (type?.family !== 'bits' || typeof type.size !== 'number' || type.size % 4 !== 0) {
      return { ok: false, diagnostics: [diagnostic('operation.invalid-nibble-width', 'Nibble permutation requires a bits width divisible by 4.', 'inputs.value')] }
    }
    return validPermutation(parameters.permutation, type.size / 4)
      ? { ok: true, value: { value: type } }
      : { ok: false, diagnostics: [diagnostic('operation.invalid-permutation', 'Permutation must cover each input nibble exactly once.', 'parameters.permutation')] }
  },
  lineage(parameters, inputTypes) {
    const size = inputTypes.value?.family === 'bits' ? inputTypes.value.size as number : 0
    const permutation = parameters.permutation
    return { value: Array.from({ length: size }, (_, bit) => {
      const nibble = Math.floor(bit / 4)
      return [{ port: 'value', bit: (permutation[nibble] ?? 0) * 4 + bit % 4 }]
    }) }
  },
  execute(inputs, parameters) {
    const input = inputs.value as BitsValue
    const permutation = parameters.permutation
    const output = new Uint8Array(bytesForBits(input.type.size))
    for (let nibble = 0; nibble < permutation.length; nibble += 1) {
      writeBits(output, input.type.size, nibble * 4, readBits(input, permutation[nibble] * 4, 4), 4)
    }
    return { value: bits(input.type.size, output) }
  },
}
