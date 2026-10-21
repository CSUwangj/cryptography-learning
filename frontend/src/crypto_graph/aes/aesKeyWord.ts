import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { diagnostic, bytes, bits, CipherDiagnostic } from '../operation_support'

export type AesKeyWordParameters = { index: number }

export const aesKeyWord: Operation<'aes.key-word@1', AesKeyWordParameters> = {
  manifest: {
    identity: 'aes.key-word@1',
    inputs: [{ name: 'key', type: { family: 'bits', size: 'N' } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
  },
  validateParameters(parameters, node) {
    return Number.isSafeInteger(parameters.index) && (parameters.index as number) >= 0
      ? []
      : [diagnostic('aes.invalid-key-word-index', 'Key word index must be a non-negative integer.', `${node.id}.parameters.index`, node)]
  },
  execute(inputs, parameters) {
    const key = inputs.key as BitsValue
    const { index } = parameters
    const offset = index * 4
    if (offset + 4 > key.bytes.length) {
      throw new CipherDiagnostic('aes.key-word-out-of-range', 'Key word index exceeds the key length.', { index, keyBytes: key.bytes.length })
    }
    return { value: bits(32, key.bytes.slice(offset, offset + 4)) }
  },
}
