import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { bits, bytes } from '../operation_support'
import { byteSubstitutionLineage, aesSBox } from './helpers'

export type EmptyParameters = Record<never, never>

export const aesSubBytes: Operation<'aes.sub-bytes@1', EmptyParameters> = {
  manifest: {
    identity: 'aes.sub-bytes@1',
    inputs: [{ name: 'value', type: { family: 'bits', size: 128 } }],
    outputs: [{ name: 'value', type: { family: 'bits', size: 128 } }],
  },
  lineage: (_, inputTypes) => byteSubstitutionLineage(inputTypes),
  execute(inputs) {
    const value = inputs.value as BitsValue
    return { value: bits(128, value.bytes.map((byte) => aesSBox[byte])) }
  },
}
