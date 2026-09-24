import React, { useEffect, useState } from 'react'
import type { AlphabetMapping, AlphabetPolicyValue, AlphabetTextValue } from '../crypto_graph'

export type ClassicalCipherPosition = {
  readonly input: string
  readonly output: string
  readonly sourcePosition?: number
  readonly targetPosition?: number
  readonly mapped: boolean
}

export const classicalCipherPositions = (
  input: AlphabetTextValue,
  output: AlphabetTextValue,
  mapping: AlphabetMapping,
): readonly ClassicalCipherPosition[] => {
  const positions = new Map(mapping.symbols.map((symbol, index) => [symbol, index]))
  return input.symbols.map((symbol, index) => {
    const sourcePosition = positions.get(symbol)
    const outputSymbol = output.symbols[index] ?? ''
    const targetPosition = positions.get(outputSymbol)
    return sourcePosition === undefined || targetPosition === undefined
      ? { input: symbol, output: outputSymbol, mapped: false }
      : { input: symbol, output: outputSymbol, sourcePosition, targetPosition, mapped: true }
  })
}

export const ClassicalCipherRenderer: React.FC<{
  readonly mapping: AlphabetMapping
  readonly policy: AlphabetPolicyValue
  readonly policyLabel: string
  readonly positions: readonly ClassicalCipherPosition[]
  readonly locale: string
  readonly reducedMotion: boolean
}> = ({ mapping, policy, policyLabel, positions, locale, reducedMotion }) => {
  const [settled, setSettled] = useState(reducedMotion)
  const copy = locale === 'zh-CN'
    ? { label: '古典密码位置映射', unmapped: '未映射', moves: '移动' }
    : { label: 'Classical cipher position mapping', unmapped: 'Unmapped', moves: 'moves' }
  useEffect(() => {
    setSettled(reducedMotion)
    if (!reducedMotion) {
      const frame = requestAnimationFrame(() => setSettled(true))
      return () => cancelAnimationFrame(frame)
    }
  }, [positions, reducedMotion])
  return <section aria-label={copy.label} data-policy={policy.value}>
    <p>{policyLabel}</p>
    {positions.map((position, index) =>
      <div key={`${index}-${position.input}`} data-mapped={position.mapped}>
        <span>{position.input || '∅'} → {position.output || '∅'}</span>
        {position.mapped
          ? <div aria-label={`${position.input} ${copy.moves} ${position.sourcePosition} ${position.targetPosition}`} style={{ overflow: 'hidden', maxWidth: '100%' }}>
              <div style={{
                display: 'flex',
                gap: '0.5rem',
                transform: `translateX(${settled ? -position.targetPosition! * 2 : -position.sourcePosition! * 2}rem)`,
                transition: reducedMotion ? 'none' : 'transform 600ms ease-out',
                width: 'max-content',
              }}>
                {mapping.symbols.map((symbol, alphabetPosition) => <span key={alphabetPosition} aria-current={alphabetPosition === position.targetPosition ? 'true' : undefined}>{symbol}</span>)}
              </div>
            </div>
          : <span>{copy.unmapped}</span>}
      </div>,
    )}
  </section>
}
