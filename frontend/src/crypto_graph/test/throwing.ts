import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'

export type EmptyParameters = Record<never, never>

export const throwing: Operation<'test.throw@1', EmptyParameters> = {
  manifest: { identity: 'test.throw@1', inputs: [], outputs: [{ name: 'value', type: { family: 'bits', size: 8 } }] },
  execute() {
    throw new Error('synthetic failure')
  },
}
