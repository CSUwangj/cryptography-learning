import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { text, validKey, modulo, cipherText, CipherDiagnostic } from '../operation_support'

export type EmptyParameters = Record<never, never>

export const caesar: Operation<'classical.caesar@1', EmptyParameters> = {
  manifest: {
    identity: 'classical.caesar@1',
    inputs: [
      { name: 'text', type: { family: 'alphabet-text', mapping: '*' } },
      { name: 'shift', type: { family: 'integer', signed: true, safe: true } },
      { name: 'policy', type: { family: 'alphabet-policy' } },
    ],
    outputs: [{ name: 'text', type: { family: 'alphabet-text', mapping: '*' } }],
  },
  execute(inputs, _, mappings) {
    const text = inputs.text as AlphabetTextValue
    const shift = inputs.shift as IntegerValue
    const policy = inputs.policy as AlphabetPolicyValue
    validKey(shift)
    const modulus = mappings.get(text.type.mapping)?.symbols.length
    if (!modulus) throw new CipherDiagnostic('cipher.invalid-mapping', 'Cipher text references an unknown alphabet mapping.', { mapping: text.type.mapping })
    const normalizedShift = modulo(shift.value, modulus)
    return { text: cipherText(text, (position) => modulo(position + normalizedShift, modulus), policy, mappings) }
  },
}
