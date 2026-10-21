import type { AuthoredNode, BitsValue, CryptoValue, PortType, IntegerValue, AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue, AlphabetDirectionValue } from '../index'
import type { Operation } from '../operation'
import { text, cipherText, modulo, CipherDiagnostic } from '../operation_support'

export type EmptyParameters = Record<never, never>

export const vigenere: Operation<'classical.vigenere@1', EmptyParameters> = {
  manifest: {
    identity: 'classical.vigenere@1',
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
    if (key.type.mapping !== text.type.mapping) throw new CipherDiagnostic('cipher.invalid-vigenere-key', 'Vigenere key must use the text alphabet mapping.', { reason: 'unmapped' })
    if (key.symbols.length === 0) throw new CipherDiagnostic('cipher.invalid-vigenere-key', 'Vigenere key must not be empty.', { reason: 'empty' })
    const positions = new Map(mapping.symbols.map((symbol, position) => [symbol, position]))
    const keyPositions = key.symbols.map((symbol) => positions.get(symbol))
    if (keyPositions.some((position) => position === undefined)) throw new CipherDiagnostic('cipher.invalid-vigenere-key', 'Vigenere key contains a symbol outside the alphabet.', { reason: 'unmapped' })
    let keyIndex = 0
    return {
      text: cipherText(text, (position) => {
        const shift = keyPositions[keyIndex % keyPositions.length]!
        keyIndex += 1
        return direction.value === 'encrypt' ? modulo(position + shift, mapping.symbols.length) : modulo(position - shift, mapping.symbols.length)
      }, policy, mappings),
    }
  },
}
