import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../index'
import type { Operation } from '../operation'
import { text, validKey, modulo, cipherText, multiplyModulo, CipherDiagnostic } from '../operation_support'

export type EmptyParameters = Record<never, never>

export const affine: Operation<'classical.affine@1', EmptyParameters> = {
  manifest: {
    identity: 'classical.affine@1',
    inputs: [
      { name: 'text', type: { family: 'alphabet-text', mapping: '*' } },
      { name: 'a', type: { family: 'integer', signed: true, safe: true } },
      { name: 'b', type: { family: 'integer', signed: true, safe: true } },
      { name: 'policy', type: { family: 'alphabet-policy' } },
    ],
    outputs: [{ name: 'text', type: { family: 'alphabet-text', mapping: '*' } }],
  },
  execute(inputs, _, mappings) {
    const text = inputs.text as AlphabetTextValue
    const a = inputs.a as IntegerValue
    const b = inputs.b as IntegerValue
    const policy = inputs.policy as AlphabetPolicyValue
    validKey(a)
    validKey(b)
    const modulus = mappings.get(text.type.mapping)?.symbols.length
    if (!modulus) throw new CipherDiagnostic('cipher.invalid-mapping', 'Cipher text references an unknown alphabet mapping.', { mapping: text.type.mapping })
    const normalizedA = modulo(a.value, modulus)
    const gcd = (left: number, right: number): number => right === 0 ? left : gcd(right, left % right)
    if (gcd(normalizedA, modulus) !== 1) {
      throw new CipherDiagnostic('cipher.invalid-affine-key', 'Affine key a must be coprime to the alphabet size.', {
        a: normalizedA,
        modulus,
      })
    }
    const normalizedB = modulo(b.value, modulus)
    return { text: cipherText(text, (position) => modulo(multiplyModulo(normalizedA, position, modulus) + normalizedB, modulus), policy, mappings) }
  },
}
