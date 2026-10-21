import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { diagnostic, bytes, readBits, bitPosition, bits } from '../operation_support'

export type XorConstantParameters = { target: number; constant: number }

export const xorConstant: Operation<'core.xor-constant@1', XorConstantParameters> = {
  manifest: {
    identity: 'core.xor-constant@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
  },
  validateParameters(parameters, node) {
    const target = parameters.target
    const constant = parameters.constant
    return Number.isSafeInteger(target) && (target as number) >= 0
      && Number.isSafeInteger(constant) && (constant as number) >= 0 && (constant as number) <= 0xffffffff
      ? []
      : [diagnostic('operation.xor-constant-out-of-bounds', 'Word constant parameters are outside the input width.', `${node.id}.parameters`, node)]
  },
  inferOutputTypes(inputTypes, parameters, node) {
    const type = inputTypes.value
    const target = parameters.target
    const constant = parameters.constant
    if (type?.family !== 'bits' || typeof type.size !== 'number' || type.size % 32 !== 0
      || !Number.isSafeInteger(target) || (target as number) < 0 || (target as number) >= type.size / 32
      || !Number.isSafeInteger(constant) || (constant as number) < 0 || (constant as number) > 0xffffffff) {
      return { ok: false, diagnostics: [diagnostic('operation.xor-constant-out-of-bounds', 'Word constant parameters are outside the input width.', `${node?.id ?? 'xor-constant'}.parameters`, node)] }
    }
    return { ok: true, value: { value: type } }
  },
  lineage(_, inputTypes) {
    const size = inputTypes.value?.family === 'bits' ? inputTypes.value.size as number : 0
    return { value: Array.from({ length: size }, (_, bit) => [{ port: 'value', bit }]) }
  },
  execute(inputs, parameters) {
    const input = inputs.value as BitsValue
    const output = input.bytes.slice()
    const { target, constant } = parameters
    const start = target * 32
    for (let bit = 0; bit < 32; bit += 1) {
      const value = readBits(input, start + bit, 1) ^ ((constant >>> (31 - bit)) & 1)
      const [byte, shift] = bitPosition(input.type.size, start + bit)
      if (value) output[byte] |= 1 << shift
      else output[byte] &= ~(1 << shift)
    }
    return { value: bits(input.type.size, output) }
  },
}
