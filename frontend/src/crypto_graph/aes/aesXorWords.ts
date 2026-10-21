import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { diagnostic, bytes, bits } from '../operation_support'

export type AesXorWordsParameters = { start: number; count: number }

export const aesXorWords: Operation<'aes.xor-words@1', AesXorWordsParameters> = {
  manifest: {
    identity: 'aes.xor-words@1',
    inputs: [{ name: 'state', type: { family: 'bits', size: 'N' } }, { name: 'temp', type: { family: 'bits', size: 32 } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
  },
  validateParameters(parameters, node) {
    const start = parameters.start
    const count = parameters.count
    return Number.isSafeInteger(start) && (start as number) >= 0 && Number.isSafeInteger(count) && (count as number) >= 0
      ? []
      : [diagnostic('operation.xor-words-out-of-bounds', 'Chained XOR range is outside the input width.', `${node.id}.parameters`, node)]
  },
  inferOutputTypes(inputTypes, parameters, node) {
    const type = inputTypes.state
    const start = parameters.start
    const count = parameters.count
    if (type?.family !== 'bits' || typeof type.size !== 'number' || type.size % 32 !== 0
      || inputTypes.temp?.family !== 'bits' || inputTypes.temp.size !== 32
      || !Number.isSafeInteger(start) || !Number.isSafeInteger(count) || (start as number) < 0 || (count as number) < 0
      || (start as number) + (count as number) > type.size / 32) {
      return { ok: false, diagnostics: [diagnostic('operation.xor-words-out-of-bounds', 'Chained XOR range is outside the input width.', `${node?.id ?? 'xor-words'}.parameters`, node)] }
    }
    return { ok: true, value: { value: type } }
  },
  lineage(parameters, inputTypes) {
    const size = inputTypes.state?.family === 'bits' ? inputTypes.state.size as number : 0
    const start = Number(parameters.start)
    const count = Number(parameters.count)
    return { value: Array.from({ length: size }, (_, bit) => {
      const word = Math.floor(bit / 32)
      if (word < start || word >= start + count) return [{ port: 'state', bit }]
      return [
        ...Array.from({ length: word - start + 1 }, (_, index) => ({ port: 'state', bit: (start + index) * 32 + bit % 32 })),
        { port: 'temp', bit: bit % 32 },
      ]
    }) }
  },
  execute(inputs, parameters) {
    const state = inputs.state as BitsValue
    const temp = inputs.temp as BitsValue
    const output = state.bytes.slice()
    const { start, count } = parameters
    let previous = temp
    for (let word = start; word < start + count; word += 1) {
      const current = bits(32, Uint8Array.from(Array.from({ length: 4 }, (_, byte) => state.bytes[word * 4 + byte] ^ previous.bytes[byte])))
      output.set(current.bytes, word * 4)
      previous = current
    }
    return { value: bits(state.type.size, output) }
  },
}
