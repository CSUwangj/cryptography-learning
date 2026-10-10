import React, { useEffect, useState } from 'react'
import { learningColors } from '../ui/learning'
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
  readonly motionDirection?: 1 | -1
}> = ({ mapping, policy, policyLabel, positions, locale, reducedMotion, motionDirection }) => {
  const [settled, setSettled] = useState(reducedMotion)
  const copy = locale === 'zh-CN'
    ? { label: '古典密码位置映射', unmapped: '未映射', moves: '移动', space: '[空格]' }
    : { label: 'Classical cipher position mapping', unmapped: 'Unmapped', moves: 'moves', space: '[space]' }
  const symbolText = (symbol: string) => symbol === ' ' ? copy.space : symbol || '∅'
  useEffect(() => {
    setSettled(reducedMotion)
    if (!reducedMotion) {
      const frame = requestAnimationFrame(() => setSettled(true))
      return () => cancelAnimationFrame(frame)
    }
  }, [positions, reducedMotion, motionDirection])
  return <section aria-label={copy.label} data-policy={policy.value}>
    <p>{policyLabel}</p>
    {positions.map((position, index) => {
      const source = position.sourcePosition ?? 0
      const target = position.targetPosition ?? 0
      const direction = motionDirection ?? (target < source ? -1 : 1)
      const distance = ((target - source) * direction + mapping.symbols.length) % mapping.symbols.length
      const path = position.mapped ? Array.from({ length: distance + 1 }, (_, offset) =>
        mapping.symbols[(source + direction * offset + mapping.symbols.length) % mapping.symbols.length]) : []
      const startOffset = direction === -1 ? distance : 0
      const endOffset = direction === -1 ? 0 : distance
      return <div key={`${index}-${position.input}`} data-mapped={position.mapped}>
        <span>{symbolText(position.input)} → {symbolText(position.output)}</span>
        {position.mapped
          ? <div aria-label={`${symbolText(position.input)} ${copy.moves} ${position.sourcePosition} ${position.targetPosition}`} style={{ overflow: 'hidden', boxSizing: 'content-box', height: '2rem', width: '3rem', border: `1px solid ${learningColors.border}`, borderRadius: '0.25rem', background: learningColors.selected }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                transform: `translateY(${-2 * (settled ? endOffset : startOffset)}rem)`,
                transition: reducedMotion ? 'none' : 'transform 600ms ease-out',
                textAlign: 'center',
              }}>
                {(direction === -1 ? path.reverse() : path).map((symbol, pathPosition) => <span key={pathPosition} style={{ height: '2rem', lineHeight: '2rem', flexShrink: 0 }} aria-current={pathPosition === endOffset ? 'true' : undefined}>{symbolText(symbol)}</span>)}
              </div>
            </div>
          : <span> {copy.unmapped}</span>}
      </div>
    })}
  </section>
}
