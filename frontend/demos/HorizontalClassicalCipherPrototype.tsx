import React, { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, FormGroup, HTMLSelect, RadioGroup, Radio, Slider } from '@blueprintjs/core'
import '@blueprintjs/core/lib/css/blueprint.css'
import '@blueprintjs/icons/lib/css/blueprint-icons.css'
import './horizontalClassicalCipherPrototype.css'

type AlgorithmType = 'caesar' | 'vigenere' | 'affine' | 'substitution'

interface CipherCharacter {
  input: string
  output: string
  shift?: number
  sourcePos: number
  targetPos: number
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const KEYED_ALPHABET = 'QWERTYUIOPASDFGHJKLZXCVBNM'
const CHAR_HEIGHT = 3 // rem - single source of truth

const caesarEncrypt = (text: string, shift: number): CipherCharacter[] => {
  return text.split('').map(char => {
    if (char === ' ') return { input: ' ', output: ' ', sourcePos: -1, targetPos: -1 }
    const sourcePos = ALPHABET.indexOf(char.toUpperCase())
    if (sourcePos === -1) return { input: char, output: char, sourcePos: -1, targetPos: -1 }
    const targetPos = (sourcePos + shift) % 26
    return { input: char, output: ALPHABET[targetPos], shift, sourcePos, targetPos }
  })
}

const vigenereEncrypt = (text: string, key: string): CipherCharacter[] => {
  let keyIndex = 0
  return text.split('').map(char => {
    if (char === ' ') return { input: ' ', output: ' ', sourcePos: -1, targetPos: -1 }
    const sourcePos = ALPHABET.indexOf(char.toUpperCase())
    if (sourcePos === -1) return { input: char, output: char, sourcePos: -1, targetPos: -1 }
    const shift = ALPHABET.indexOf(key[keyIndex % key.length].toUpperCase())
    keyIndex++
    const targetPos = (sourcePos + shift) % 26
    return { input: char, output: ALPHABET[targetPos], shift, sourcePos, targetPos }
  })
}

const affineEncrypt = (text: string, a: number, b: number): CipherCharacter[] => {
  return text.split('').map(char => {
    if (char === ' ') return { input: ' ', output: ' ', sourcePos: -1, targetPos: -1 }
    const sourcePos = ALPHABET.indexOf(char.toUpperCase())
    if (sourcePos === -1) return { input: char, output: char, sourcePos: -1, targetPos: -1 }
    const targetPos = (a * sourcePos + b) % 26
    return { input: char, output: ALPHABET[targetPos], sourcePos, targetPos }
  })
}

const substitutionEncrypt = (text: string): CipherCharacter[] => {
  return text.split('').map(char => {
    if (char === ' ') return { input: ' ', output: ' ', sourcePos: -1, targetPos: -1 }
    const sourcePos = ALPHABET.indexOf(char.toUpperCase())
    if (sourcePos === -1) return { input: char, output: char, sourcePos: -1, targetPos: -1 }
    return { input: char, output: KEYED_ALPHABET[sourcePos], sourcePos, targetPos: sourcePos }
  })
}

const VerticalReel: React.FC<{
  sourcePos: number
  currentShift: number
  animate: boolean
  reducedMotion: boolean
}> = ({ sourcePos, currentShift, animate, reducedMotion }) => {
  const prevShiftRef = useRef(currentShift)
  const [displayShift, setDisplayShift] = useState(currentShift)

  React.useEffect(() => {
    if (!animate || reducedMotion) {
      setDisplayShift(currentShift)
      prevShiftRef.current = currentShift
      return
    }

    // Continuous animation from previous position
    setDisplayShift(currentShift)
    prevShiftRef.current = currentShift
  }, [currentShift, animate, reducedMotion])

  // Generate full alphabet path (0 to 25) to support bidirectional animation
  const maxPath = 26
  const fullPath = Array.from({ length: maxPath }, (_, i) =>
    ALPHABET[(sourcePos + i) % 26]
  )

  return (
    <div className="vertical-reel">
      <div
        className="vertical-strip"
        style={{
          transform: `translateY(-${displayShift * CHAR_HEIGHT}rem)`,
          transition: (animate && !reducedMotion) ? 'transform 600ms ease-out' : 'none',
        }}
      >
        {fullPath.map((char, i) => (
          <div key={i} className={`reel-char ${i === currentShift ? 'target' : ''}`}>
            {char}
          </div>
        ))}
      </div>
    </div>
  )
}

const CharacterTransform: React.FC<{
  char: CipherCharacter
  showReel: boolean
  animate: boolean
  reducedMotion: boolean
}> = ({ char, showReel, animate, reducedMotion }) => {
  if (char.sourcePos === -1) {
    return (
      <div className="char-transform space">
        <div className="input-char">{char.input === ' ' ? '␣' : char.input}</div>
        <div className="transform-arrow">↓</div>
        <div className="output-char">{char.output === ' ' ? '␣' : char.output}</div>
      </div>
    )
  }

  if (!showReel) {
    return (
      <div className="char-transform direct">
        <div className="input-char">{char.input}</div>
        <div className="transform-arrow">→</div>
        <div className="output-char">{char.output}</div>
      </div>
    )
  }

  return (
    <div className="char-transform with-reel">
      <div className="input-char">{char.input}</div>
      <VerticalReel
        sourcePos={char.sourcePos}
        currentShift={char.shift!}
        animate={animate}
        reducedMotion={reducedMotion}
      />
      <div className="output-char">{char.output}</div>
      {char.shift !== undefined && <div className="shift-indicator">+{char.shift}</div>}
    </div>
  )
}

export const HorizontalClassicalCipherPrototype: React.FC = () => {
  const { t, i18n } = useTranslation('demos', { keyPrefix: 'classicalCipher' })
  const [algorithm, setAlgorithm] = useState<AlgorithmType>('caesar')
  const [plaintext, setPlaintext] = useState('HELLO WORLD')
  const [caesarShift, setCaesarShift] = useState(3)
  const [vigenereKey, setVigenereKey] = useState('KEY')
  const [affineA, setAffineA] = useState(5)
  const [affineB, setAffineB] = useState(8)
  const [animate, setAnimate] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)

  const characters: CipherCharacter[] = (() => {
    switch (algorithm) {
      case 'caesar': return caesarEncrypt(plaintext, caesarShift)
      case 'vigenere': return vigenereEncrypt(plaintext, vigenereKey)
      case 'affine': return affineEncrypt(plaintext, affineA, affineB)
      case 'substitution': return substitutionEncrypt(plaintext)
    }
  })()

  const showReel = algorithm === 'caesar' || algorithm === 'vigenere'
  const ciphertext = characters.map(c => c.output).join('')

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>{t('title')}</h1>
      <p style={{ color: 'var(--text-color-muted)', marginBottom: '1.5rem' }}>
        {t('subtitle')}
      </p>

      <Card style={{ marginBottom: '1rem' }}>
        <h3>{t('algorithm')}</h3>
        <RadioGroup
          selectedValue={algorithm}
          onChange={(e) => setAlgorithm((e.target as HTMLInputElement).value as AlgorithmType)}
        >
          <Radio label={t('algorithms.caesar')} value="caesar" />
          <Radio label={t('algorithms.vigenere')} value="vigenere" />
          <Radio label={t('algorithms.affine')} value="affine" />
          <Radio label={t('algorithms.substitution')} value="substitution" />
        </RadioGroup>
      </Card>

      <Card style={{ marginBottom: '1rem' }}>
        <FormGroup label={t('plaintext')}>
          <input
            className="bp5-input"
            value={plaintext}
            onChange={(e) => setPlaintext(e.target.value.toUpperCase())}
            style={{ width: '100%' }}
          />
        </FormGroup>

        {algorithm === 'vigenere' && (
          <FormGroup label={t('key')}>
            <input
              className="bp5-input"
              value={vigenereKey}
              onChange={(e) => setVigenereKey(e.target.value.toUpperCase())}
              style={{ width: '100%' }}
            />
          </FormGroup>
        )}

        {algorithm === 'affine' && (
          <>
            <FormGroup label={`${t('multiplier')}: ${affineA}`}>
              <HTMLSelect value={affineA} onChange={(e) => setAffineA(parseInt(e.target.value))}>
                {[1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25].map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </HTMLSelect>
            </FormGroup>
            <FormGroup label={`${t('addend')}: ${affineB}`}>
              <Slider
                min={0}
                max={25}
                value={affineB}
                onChange={(value) => setAffineB(value)}
                labelStepSize={5}
              />
            </FormGroup>
          </>
        )}

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <label className="bp5-control bp5-checkbox">
            <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
            <span className="bp5-control-indicator" />
            {t('animate')}
          </label>
          <label className="bp5-control bp5-checkbox">
            <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} />
            <span className="bp5-control-indicator" />
            {t('reducedMotion')}
          </label>
        </div>
      </Card>

      <Card>
        <h3>{t('ciphertext')}: {ciphertext}</h3>
        <h4 style={{ marginTop: '1rem' }}>{t('characterTransformations')}</h4>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-color-muted)', marginBottom: '1rem' }}>
          {showReel ? t('verticalReelDescription') : t('directMappingDescription')}
        </p>

        <div className="cipher-display-wrapper">
          <div className="cipher-display">
            {characters.map((char, i) => (
              <CharacterTransform
                key={i}
                char={char}
                showReel={showReel}
                animate={animate}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>

          {algorithm === 'caesar' && (
            <div className="global-shift-control">
              <div className="shift-value">{caesarShift}</div>
              <Slider
                min={0}
                max={25}
                stepSize={1}
                value={caesarShift}
                onChange={(value) => setCaesarShift(value)}
                vertical={true}
                labelRenderer={false}
              />
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
