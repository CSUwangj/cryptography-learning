import { describe, expect, it } from 'vitest'
import { bits, bytes } from 'crypto_graph'
import { inputText } from './LearningPage'

describe('inputText redisplay (#84 review R1)', () => {
  it('redisplays a hex-block value as bare, unprefixed hex matching the input encoding it will be re-validated against', () => {
    const value = bits(128, Uint8Array.from({ length: 16 }, (_, index) => index))
    const text = inputText(value, 'hex-block')
    // The `hex-block` decoder (compiler.ts) rejects a `0x` prefix and requires the exact digit
    // count; the redisplayed text must satisfy the same shape or the next edit fails validation.
    expect(text).toMatch(/^[0-9a-f]{32}$/)
  })

  it('keeps the 0x-prefixed redisplay for the plain hex encoding', () => {
    const value = bytes(2, Uint8Array.of(0x0f, 0x0f))
    expect(inputText(value, 'hex')).toBe('0x0f0f')
  })
})
