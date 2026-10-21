import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { cloneValue } from '../operation_support'

export type InvalidLineageParameters = { mode?: 'width' | 'port' | 'bit' }

export const invalidLineage: Operation<'test.invalid-lineage@1', InvalidLineageParameters> = {
  manifest: { identity: 'test.invalid-lineage@1', inputs: [{ name: 'value', type: { family: 'bits', size: 4 } }], outputs: [{ name: 'value', type: { family: 'bits', size: 4 } }] },
  lineage: (parameters) => parameters.mode === 'width'
    ? { value: [] }
    : parameters.mode === 'port'
      ? { value: Array.from({ length: 4 }, () => [{ port: 'missing', bit: 0 }]) }
      : { value: Array.from({ length: 4 }, () => [{ port: 'value', bit: 4 }]) },
  execute(inputs) { return { value: cloneValue(inputs.value) } },
}
