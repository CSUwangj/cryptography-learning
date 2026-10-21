import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { cloneValue } from '../operation_support'

export type EmptyParameters = Record<never, never>

export const output: Operation<'core.output@1', EmptyParameters> = {
  manifest: { identity: 'core.output@1', inputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }], outputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }] },
  lineage: (_, inputTypes) => {
    const size = inputTypes.value?.family === 'bits' ? inputTypes.value.size as number : 0
    return { value: Array.from({ length: size }, (_, bit) => [{ port: 'value', bit }]) }
  },
  execute(inputs) {
    return { value: cloneValue(inputs.value) }
  },
}
