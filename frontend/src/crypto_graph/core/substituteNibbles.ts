import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { validPermutation, diagnostic, rangeParameter, bytesForBits, readBits, writeBits, bits } from '../operation_support'

export type SubstituteNibblesParameters = { sBox: readonly number[]; start?: number; count?: number }

export const substituteNibbles: Operation<'core.substitute-nibbles@1', SubstituteNibblesParameters> = {
  manifest: {
    identity: 'core.substitute-nibbles@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
  },
  validateParameters(parameters, node) {
    const validRange = [parameters.start, parameters.count].every((value) => value === undefined || (Number.isSafeInteger(value) && (value as number) >= 0))
    return validPermutation(parameters.sBox, 16) && validRange
      ? []
      : [diagnostic(validRange ? 'operation.invalid-s-box' : 'operation.substitute-nibbles-range-out-of-bounds', validRange ? 'S-box must be a permutation of 0 through 15.' : 'Substitution range is outside the input width.', validRange ? `${node.id}.parameters.sBox` : `${node.id}.parameters`, node)]
  },
  inferOutputTypes(inputTypes, parameters, node) {
    const type = inputTypes.value
    if (type?.family !== 'bits' || typeof type.size !== 'number' || type.size % 4 !== 0) {
      return { ok: false, diagnostics: [diagnostic('operation.invalid-nibble-width', 'Nibble substitution requires a bits width divisible by 4.', 'inputs.value')] }
    }
    const range = rangeParameter(parameters, type.size / 4, node ?? { id: 'substitute-nibbles' })
    return range.ok ? { ok: true, value: { value: type } } : range
  },
  lineage(parameters, inputTypes) {
    const size = inputTypes.value?.family === 'bits' ? inputTypes.value.size as number : 0
    const range = rangeParameter(parameters, size / 4, { id: 'substitute-nibbles' })
    const start = range.ok ? range.value.start : 0
    const count = range.ok ? range.value.count : 0
    return { value: Array.from({ length: size }, (_, bit) => {
      const nibble = Math.floor(bit / 4)
      return nibble >= start && nibble < start + count
        ? Array.from({ length: 4 }, (_, sourceBit) => ({ port: 'value', bit: nibble * 4 + sourceBit }))
        : [{ port: 'value', bit }]
    }) }
  },
  execute(inputs, parameters) {
    const input = inputs.value as BitsValue
    const sBox = parameters.sBox
    const start = parameters.start ?? 0
    const count = parameters.count ?? input.type.size / 4 - start
    const output = new Uint8Array(bytesForBits(input.type.size))
    for (let nibble = 0; nibble < input.type.size / 4; nibble += 1) {
      const value = readBits(input, nibble * 4, 4)
      writeBits(output, input.type.size, nibble * 4, nibble >= start && nibble < start + count ? sBox[value] : value, 4)
    }
    return { value: bits(input.type.size, output) }
  },
}
