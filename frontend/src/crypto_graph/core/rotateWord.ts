import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { diagnostic, bytes, writeBits, readBits, bits } from '../operation_support'

export type RotateWordParameters = { target: number; amount: number }

export const rotateWord: Operation<'core.rotate-word@1', RotateWordParameters> = {
  manifest: {
    identity: 'core.rotate-word@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
  },
  validateParameters(parameters, node) {
    const target = parameters.target
    const amount = parameters.amount
    return Number.isSafeInteger(target) && (target as number) >= 0 && Number.isSafeInteger(amount) && (amount as number) >= 1 && (amount as number) <= 31
      ? []
      : [diagnostic('operation.rotate-word-out-of-bounds', 'Word rotation parameters are outside the input width.', `${node.id}.parameters`, node)]
  },
  inferOutputTypes(inputTypes, parameters, node) {
    const type = inputTypes.value
    const target = parameters.target
    const amount = parameters.amount
    if (type?.family !== 'bits' || typeof type.size !== 'number' || type.size % 32 !== 0
      || !Number.isSafeInteger(target) || !Number.isSafeInteger(amount) || (target as number) < 0
      || (amount as number) < 1 || (amount as number) > 31 || (target as number) >= type.size / 32) {
      return { ok: false, diagnostics: [diagnostic('operation.rotate-word-out-of-bounds', 'Word rotation parameters are outside the input width.', `${node?.id ?? 'rotate-word'}.parameters`, node)] }
    }
    return { ok: true, value: { value: type } }
  },
  lineage(parameters, inputTypes) {
    const size = inputTypes.value?.family === 'bits' ? inputTypes.value.size as number : 0
    const target = Number(parameters.target)
    const amount = Number(parameters.amount)
    return { value: Array.from({ length: size }, (_, bit) => {
      const word = Math.floor(bit / 32)
      return [{ port: 'value', bit: word === target ? word * 32 + ((bit - word * 32 + amount) % 32) : bit }]
    }) }
  },
  execute(inputs, parameters) {
    const input = inputs.value as BitsValue
    const output = input.bytes.slice()
    const { target, amount } = parameters
    const start = target * 32
    output.fill(0, start / 8, start / 8 + 4)
    for (let bit = 0; bit < 32; bit += 1) writeBits(output, input.type.size, start + bit, readBits(input, start + ((bit + amount) % 32), 1), 1)
    return { value: bits(input.type.size, output) }
  },
}
