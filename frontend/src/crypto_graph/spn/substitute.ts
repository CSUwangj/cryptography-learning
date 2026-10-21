import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { validPermutation, diagnostic, bits, bytes } from '../operation_support'

export type SubstituteParameters = { sBox: readonly number[] }

export const substitute: Operation<'spn.substitute@1', SubstituteParameters> = {
  manifest: {
    identity: 'spn.substitute@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 16 } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 16 } }],
  },
  validateParameters(parameters, node) {
    return validPermutation(parameters.sBox, 16)
      ? []
      : [diagnostic('spn.invalid-s-box', 'S-box must be a permutation of 0 through 15.', `${node.id}.parameters.sBox`, node)]
  },
  lineage(_, inputTypes) {
    const size = inputTypes.value?.family === 'bits' ? inputTypes.value.size as number : 16
    return { value: Array.from({ length: size }, (_, bit) => {
      const nibble = Math.floor(bit / 4)
      return Array.from({ length: 4 }, (_, sourceBit) => ({ port: 'value', bit: nibble * 4 + sourceBit }))
    }) }
  },
  execute(inputs, parameters) {
    const sBox = parameters.sBox
    const input = inputs.value as BitsValue
    return {
      value: bits(16, input.bytes.map((byte) => (sBox[byte >> 4] << 4) | sBox[byte & 0x0f])),
    }
  },
}
