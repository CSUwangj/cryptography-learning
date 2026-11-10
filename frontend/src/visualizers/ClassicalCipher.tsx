import { useTranslation } from 'react-i18next'
import React, { useEffect, useState } from 'react'
import { Slider } from '@blueprintjs/core'
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
  readonly reducedMotion: boolean
  readonly motionDirection?: 1 | -1
  readonly direct?: boolean
  readonly vigenereKey?: AlphabetTextValue
  readonly affine?: { readonly a: number, readonly b: number }
  readonly caesar?: { readonly shift: number, readonly onCommit?: (shift: number) => void }
}> = ({ mapping, policy, policyLabel, positions, reducedMotion, motionDirection, caesar, direct, vigenereKey, affine }) => {
  const [settled, setSettled] = useState(reducedMotion)
  const [preview, setPreview] = useState<number>()
  const { t } = useTranslation('visualizers', { keyPrefix: 'classicalCipher' })
  const symbolText = (symbol: string) => symbol === ' ' ? t('space') : symbol || '∅'
  useEffect(() => {
    setSettled(reducedMotion)
    if (!reducedMotion && !direct) {
      const frame = requestAnimationFrame(() => setSettled(true))
      return () => cancelAnimationFrame(frame)
    }
  }, [positions, reducedMotion, motionDirection, direct])
  let keyIndex = 0
  const characters = positions.map((position, index) => {
    if (direct) {
      const keySymbol = position.mapped && vigenereKey ? vigenereKey.symbols[keyIndex++ % vigenereKey.symbols.length] : undefined
      return <div key={`${index}-${position.input}`} data-mapped={position.mapped} role="group"
        aria-label={position.mapped ? t('mapping', { input: symbolText(position.input), output: symbolText(position.output), source: position.sourcePosition, target: position.targetPosition }) : undefined}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', border: `1px solid ${learningColors.border}`, borderRadius: '0.25rem', padding: '0.5rem', background: learningColors.canvas, color: learningColors.text }}>
        {vigenereKey && <span>{keySymbol === undefined ? t('noKey') : t('keySymbol', { symbol: symbolText(keySymbol) })}</span>}
        <span>{symbolText(position.input)} → {symbolText(position.output)}</span>
        {!position.mapped && <span>{t('unmapped')}</span>}
      </div>
    }
    const source = position.sourcePosition ?? 0
    const shift = preview ?? caesar?.shift
    const target = caesar && preview !== undefined && position.mapped
      ? ((source + preview % mapping.symbols.length) % mapping.symbols.length + mapping.symbols.length) % mapping.symbols.length
      : position.targetPosition ?? 0
    const direction = caesar && shift !== undefined ? shift < 0 ? -1 : 1 : motionDirection ?? (target < source ? -1 : 1)
    const distance = ((target - source) * direction + mapping.symbols.length) % mapping.symbols.length
    const path = position.mapped ? caesar
      ? Array.from({ length: 2 * mapping.symbols.length + 1 }, (_, offset) => mapping.symbols[(source + offset) % mapping.symbols.length])
      : Array.from({ length: distance + 1 }, (_, offset) => mapping.symbols[(source + direction * offset + mapping.symbols.length) % mapping.symbols.length]) : []
    const startOffset = caesar ? mapping.symbols.length : direction === -1 ? distance : 0
    const endOffset = caesar ? mapping.symbols.length + direction * distance : direction === -1 ? 0 : distance
    return <div key={`${index}-${position.input}`} data-mapped={position.mapped} style={caesar ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' } : undefined}>
      <span>{symbolText(position.input)} → {symbolText(position.output)}</span>
      {position.mapped
        ? <div aria-label={`${preview !== undefined ? `${t('preview')} ` : ''}${symbolText(position.input)} ${t('moves')} ${position.sourcePosition} ${target}`} style={{ overflow: 'hidden', boxSizing: 'content-box', height: '2rem', width: '3rem', border: `1px solid ${learningColors.border}`, borderRadius: '0.25rem', background: learningColors.selected, color: caesar ? learningColors.text : undefined }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            transform: `translateY(${-2 * (settled || preview !== undefined ? endOffset : startOffset)}rem)`,
            transition: reducedMotion ? 'none' : 'transform 600ms ease-out',
            textAlign: 'center',
          }}>
            {(!caesar && direction === -1 ? path.reverse() : path).map((symbol, pathPosition) => <span key={pathPosition} style={{ height: '2rem', lineHeight: '2rem', flexShrink: 0 }} aria-current={pathPosition === endOffset ? 'true' : undefined}>{symbolText(symbol)}</span>)}
          </div>
        </div>
        : <span> {t('unmapped')}</span>}
    </div>
  })
  return <section aria-label={t('label')} data-policy={policy.value}>
    <p>{policyLabel}</p>
    {direct && affine && <p aria-label={t('affineFormula')}>y = (a × x + b) mod {mapping.symbols.length}, a = {affine.a}, b = {affine.b}</p>}
    {caesar ? <>
      <p>{t('committedShift', { value: caesar.shift })}</p>
      {caesar.onCommit && <p aria-live="polite">{preview !== undefined ? t('previewShift', { value: preview }) : t('previewHint')}</p>}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', flex: 1, minWidth: 0 }}>{characters}</div>
        {caesar.onCommit && <div data-caesar-control style={{ flexShrink: 0 }}>
          <Slider
            vertical
            min={-Math.max(mapping.symbols.length - 1, Math.abs(caesar.shift))}
            max={Math.max(mapping.symbols.length - 1, Math.abs(caesar.shift))}
            stepSize={1}
            labelRenderer={false}
            handleHtmlProps={{ 'aria-label': t('shift') }}
            value={preview ?? caesar.shift}
            onChange={setPreview}
            onRelease={(shift) => { setPreview(undefined); caesar.onCommit?.(shift) }}
          />
        </div>}
      </div>
    </> : direct ? <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '1rem', minWidth: 0 }}>{characters}</div> : characters}
  </section>
}
