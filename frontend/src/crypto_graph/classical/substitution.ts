import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue, AlphabetDirectionValue } from '../index'
import type { Operation } from '../operation'
import { text, cipherText, CipherDiagnostic } from '../operation_support'

export type EmptyParameters = Record<never, never>

export const substitution: Operation<'classical.substitution@1', EmptyParameters> = {
  manifest: {
    identity: 'classical.substitution@1',
    inputs: [
      { name: 'text', type: { family: 'alphabet-text', mapping: '*' } },
      { name: 'key', type: { family: 'alphabet-text', mapping: '*' } },
      { name: 'policy', type: { family: 'alphabet-policy' } },
      { name: 'direction', type: { family: 'alphabet-direction' } },
    ],
    outputs: [{ name: 'text', type: { family: 'alphabet-text', mapping: '*' } }],
  },
  execute(inputs, _, mappings) {
    const text = inputs.text as AlphabetTextValue
    const key = inputs.key as AlphabetTextValue
    const policy = inputs.policy as AlphabetPolicyValue
    const direction = inputs.direction as AlphabetDirectionValue
    const mapping = mappings.get(text.type.mapping)
    if (!mapping) throw new CipherDiagnostic('cipher.invalid-mapping', 'Cipher text references an unknown alphabet mapping.', { mapping: text.type.mapping })
    if (key.type.mapping !== text.type.mapping) throw new CipherDiagnostic('cipher.invalid-substitution-key', 'Substitution key must use the text alphabet mapping.', { reason: 'unmapped' })
    if (key.symbols.length !== mapping.symbols.length) {
      throw new CipherDiagnostic('cipher.invalid-substitution-key', 'Substitution key must have the same length as the alphabet.', { reason: 'length' })
    }
    const positions = new Map(mapping.symbols.map((symbol, position) => [symbol, position]))
    const seen = new Set<string>()
    for (const symbol of key.symbols) {
      if (!positions.has(symbol)) throw new CipherDiagnostic('cipher.invalid-substitution-key', 'Substitution key contains a symbol outside the alphabet.', { reason: 'unmapped' })
      if (seen.has(symbol)) throw new CipherDiagnostic('cipher.invalid-substitution-key', 'Substitution key symbols must be unique.', { reason: 'duplicate' })
      seen.add(symbol)
    }
    const keyed = new Map(key.symbols.map((symbol, position) => [symbol, position]))
    return {
      text: cipherText(text, (position) => direction.value === 'encrypt' ? positions.get(key.symbols[position])! : keyed.get(mapping.symbols[position])!, policy, mappings),
    }
  },
}
