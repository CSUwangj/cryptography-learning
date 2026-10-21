import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { diagnostic, rangeParameter, bytes, bits } from '../operation_support'

export type SubstituteBytesParameters = { sBox: readonly number[]; start?: number; count?: number }

export const substituteBytes: Operation<'core.substitute-bytes@1', SubstituteBytesParameters> = {
  manifest: {
    identity: 'core.substitute-bytes@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
  },
  validateParameters(parameters, node) {
    const sBox = parameters.sBox
    const validRange = [parameters.start, parameters.count].every((value) => value === undefined || (Number.isSafeInteger(value) && (value as number) >= 0))
    return validRange && Array.isArray(sBox) && sBox.length === 256
      && Array.from({ length: 256 }, (_, index) => Object.prototype.hasOwnProperty.call(sBox, index) && Number.isSafeInteger(sBox[index]) && sBox[index] >= 0 && sBox[index] <= 255).every(Boolean)
      ? []
      : [diagnostic(validRange ? 'operation.invalid-s-box' : 'operation.substitute-bytes-range-out-of-bounds', validRange ? 'S-box must contain 256 byte values.' : 'Substitution range is outside the input width.', validRange ? `${node.id}.parameters.sBox` : `${node.id}.parameters`, node)]
  },
  inferOutputTypes(inputTypes, parameters, node) {
    const type = inputTypes.value
    if (type?.family !== 'bits' || typeof type.size !== 'number' || type.size % 8 !== 0) {
      return { ok: false, diagnostics: [diagnostic('operation.invalid-byte-width', 'Byte substitution requires a bits width divisible by 8.', 'inputs.value')] }
    }
    const start = parameters.start === undefined ? 0 : parameters.start
    const count = parameters.count === undefined ? type.size / 8 - (typeof start === 'number' ? start : 0) : parameters.count
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || (start as number) < 0 || (count as number) < 0 || (start as number) + (count as number) > type.size / 8) {
      return { ok: false, diagnostics: [diagnostic('operation.substitute-bytes-range-out-of-bounds', 'Substitution range is outside the input width.', `${node?.id ?? 'substitute-bytes'}.parameters`, node)] }
    }
    return { ok: true, value: { value: type } }
  },
  lineage(parameters, inputTypes) {
    const size = inputTypes.value?.family === 'bits' ? inputTypes.value.size as number : 0
    const range = rangeParameter(parameters, size / 8, { id: 'substitute-bytes' })
    const start = range.ok ? range.value.start : 0
    const count = range.ok ? range.value.count : 0
    return { value: Array.from({ length: size }, (_, bit) => {
      const byte = Math.floor(bit / 8)
      return byte >= start && byte < start + count
        ? Array.from({ length: 8 }, (_, sourceBit) => ({ port: 'value', bit: byte * 8 + sourceBit }))
        : [{ port: 'value', bit }]
    }) }
  },
  execute(inputs, parameters) {
    const input = inputs.value as BitsValue
    const sBox = parameters.sBox
    const start = parameters.start ?? 0
    const count = parameters.count ?? input.type.size / 8 - start
    const output = input.bytes.slice()
    for (let byte = start; byte < start + count; byte += 1) output[byte] = sBox[output[byte]]
    return { value: bits(input.type.size, output) }
  },
}
