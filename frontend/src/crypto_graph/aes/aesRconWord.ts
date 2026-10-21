import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { diagnostic, bits } from '../operation_support'
import { aesRcon } from './helpers'

export type AesRconWordParameters = { round: number }

export const aesRconWord: Operation<'aes.rcon-word@1', AesRconWordParameters> = {
  manifest: {
    identity: 'aes.rcon-word@1',
    inputs: [],
    outputs: [{ name: 'value', type: { family: 'bits', size: 32 } }],
  },
  lineage: () => ({ value: Array.from({ length: 32 }, () => []) }),
  validateParameters(parameters, node) {
    return Number.isSafeInteger(parameters.round) && (parameters.round as number) >= 1 && (parameters.round as number) <= aesRcon.length
      ? []
      : [diagnostic('aes.invalid-rcon-round', 'Rcon round must be a positive integer within the supported range.', `${node.id}.parameters.round`, node, { maximum: aesRcon.length })]
  },
  execute(_inputs, parameters) {
    return { value: bits(32, Uint8Array.of(aesRcon[parameters.round - 1], 0, 0, 0)) }
  },
}
