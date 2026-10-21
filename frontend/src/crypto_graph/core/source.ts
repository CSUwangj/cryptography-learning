import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { isPortType, diagnostic, isCryptoValue, validSizedValue, typeMatches, actualType, cloneValue } from '../operation_support'

export type SourceParameters = { type: PortType; value?: CryptoValue; roundKeys?: readonly CryptoValue[] }

export const source: Operation<'core.source@1', SourceParameters> = {
  manifest: {
    identity: 'core.source@1',
    inputs: [],
    outputs: [{ name: 'value', type: { family: 'bits', size: 'N' } }],
    outputTypeParameter: 'type',
  },
  validateParameters(parameters, node) {
    if (!isPortType(parameters.type)) {
      return [diagnostic('invalid-parameter', 'Source requires a declared port type.', `${node.id}.parameters.type`, node)]
    }
    if (parameters.value !== undefined && (!isCryptoValue(parameters.value) || !validSizedValue(parameters.value) || !typeMatches(parameters.type, actualType(parameters.value), new Map()))) {
      return [diagnostic('invalid-parameter', 'Source value does not match its declared type.', `${node.id}.parameters.value`, node)]
    }
    return []
  },
  lineage: (parameters) => ({ value: Array.from({ length: isPortType(parameters.type) && parameters.type.family === 'bits' ? parameters.type.size as number : 0 }, () => []) }),
  execute(_, parameters) {
    if (!parameters.value) throw new Error('Source value is required.')
    return { value: cloneValue(parameters.value) }
  },
}
