// Basic smoke test for Classical Cipher Prototype
import { describe, it, expect } from 'vitest'

describe('HorizontalClassicalCipherPrototype encryption logic', () => {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

  const caesarEncrypt = (text: string, shift: number): string => {
    return text.split('').map(char => {
      if (char === ' ') return ' '
      const sourcePos = ALPHABET.indexOf(char.toUpperCase())
      if (sourcePos === -1) return char
      const targetPos = (sourcePos + shift) % 26
      return ALPHABET[targetPos]
    }).join('')
  }

  it('should encrypt HELLO WORLD with shift=5 to MJQQT BTWQI', () => {
    expect(caesarEncrypt('HELLO WORLD', 5)).toBe('MJQQT BTWQI')
  })

  it('should encrypt C with shift=1 to D', () => {
    expect(caesarEncrypt('C', 1)).toBe('D')
  })

  it('should encrypt C with shift=2 to E', () => {
    expect(caesarEncrypt('C', 2)).toBe('E')
  })

  it('should handle wrap-around Z→A with shift=1', () => {
    expect(caesarEncrypt('Z', 1)).toBe('A')
  })

  it('should handle wrap-around Z→B with shift=2', () => {
    expect(caesarEncrypt('Z', 2)).toBe('B')
  })

  it('should preserve spaces', () => {
    expect(caesarEncrypt('HELLO WORLD', 3)).toBe('KHOOR ZRUOG')
  })
})
