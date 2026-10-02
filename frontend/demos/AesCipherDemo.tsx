import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createBrowserLessonSession, type BrowserLessonSession, type LessonSessionState } from '../src/lesson_runtime'
import { RenderHost, visualizerCatalog } from '../src/visualizers'
import { aesCipherDemoDocuments } from './aes128CipherLesson'

type Locale = 'en-US' | 'zh-CN'
type Variant = 128 | 192 | 256
type Direction = 'encrypt' | 'decrypt'

const defaults: Record<Variant, { readonly key: string; readonly plaintext: string; readonly ciphertext: string }> = {
  128: { key: '000102030405060708090a0b0c0d0e0f', plaintext: '00112233445566778899aabbccddeeff', ciphertext: '69c4e0d86a7b0430d8cdb78070b4c55a' },
  192: { key: '000102030405060708090a0b0c0d0e0f1011121314151617', plaintext: '00112233445566778899aabbccddeeff', ciphertext: 'dda97ca4864cdfe06eaf70a0ec0d7191' },
  256: { key: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', plaintext: '00112233445566778899aabbccddeeff', ciphertext: '8ea2b7ca516745bfeafc49904b496089' },
}

const copy = {
  'en-US': {
    title: 'AES cipher demo',
    variant: 'Variant',
    direction: 'Direction',
    key: 'Key (hex-block)',
    plaintext: 'Plaintext (hex-block)',
    ciphertext: 'Ciphertext (hex-block)',
    run: 'Run',
    encrypt: 'Encryption',
    decrypt: 'Decryption',
    failure: 'Could not run this AES Lesson.',
  },
  'zh-CN': {
    title: 'AES 加解密演示',
    variant: '变体',
    direction: '方向',
    key: '密钥（定宽十六进制）',
    plaintext: '明文（定宽十六进制）',
    ciphertext: '密文（定宽十六进制）',
    run: '运行',
    encrypt: '加密',
    decrypt: '解密',
    failure: '无法运行此 AES 课程。',
  },
} as const

const keyHexLength = (variant: Variant): number => variant / 4

const advance = async (session: BrowserLessonSession, direction: Direction): Promise<{ ok: true; value: LessonSessionState } | { ok: false; message: string }> => {
  // enter-input → expand-key → encrypt or decrypt (step index 2 or 3)
  const result = await session.next()
  if (!result.ok) return { ok: false, message: result.diagnostics[0]?.message ?? '' }
  const targetStep = direction === 'encrypt' ? 2 : 3
  while (session.state().stepIndex < targetStep) {
    const next = await session.next()
    if (!next.ok) return { ok: false, message: next.diagnostics[0]?.message ?? '' }
  }
  const state = session.state()
  const executionDiagnostic = Object.values(state.executionDiagnostics)[0]
  if (executionDiagnostic) return { ok: false, message: executionDiagnostic.message }
  return { ok: true, value: state }
}

export const AesCipherDemo: React.FC<{ readonly locale: Locale }> = ({ locale }) => {
  const text = copy[locale]
  const [variant, setVariant] = useState<Variant>(128)
  const [direction, setDirection] = useState<Direction>('encrypt')
  const [key, setKey] = useState(defaults[128].key)
  const [plaintext, setPlaintext] = useState(defaults[128].plaintext)
  const [ciphertext, setCiphertext] = useState(defaults[128].ciphertext)
  const [result, setResult] = useState<{ readonly state: LessonSessionState; readonly step: BrowserLessonSession['lesson']['steps'][number] }>()
  const [failure, setFailure] = useState<string>()
  const session = useRef<BrowserLessonSession | undefined>(undefined)

  const run = (current: BrowserLessonSession, dir: Direction): void => {
    void advance(current, dir).then((outcome) => {
      if (session.current !== current) return
      if (outcome.ok) setResult({ state: outcome.value, step: current.lesson.steps[dir === 'encrypt' ? 2 : 3] })
      else setFailure(outcome.message || text.failure)
    })
  }

  useEffect(() => {
    const created = createBrowserLessonSession(aesCipherDemoDocuments(128), locale, visualizerCatalog)
    if (!created.ok) {
      setFailure(created.diagnostics[0]?.message ?? text.failure)
      return
    }
    session.current = created.value
    run(created.value, 'encrypt')
    return () => {
      created.value.dispose()
      session.current = undefined
    }
  }, [locale, text.failure])

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const view = useMemo(() => {
    const snapshot = result?.state.snapshots[result.step.id]
    return snapshot && result && <section>
      <h2>{text[result.step.id as Direction]}</h2>
      <RenderHost
        dimensions={{ width: 1100, height: 700 }}
        execution={snapshot}
        allSnapshots={result.state.snapshots}
        executionBindings={result.step.execute?.bindings}
        executionIdentity={result.state.executionIdentities[result.step.id] ?? `aes-${result.step.id}`}
        locale={locale}
        presentation={result.step.presentation}
        reducedMotion={reducedMotion}
      />
    </section>
  }, [result, locale, reducedMotion, text])

  return <main style={{ margin: '0 auto', maxWidth: 1200, padding: 20 }}>
    <h1>{text.title}</h1>
    <form noValidate onSubmit={(event) => {
      event.preventDefault()
      const created = createBrowserLessonSession(aesCipherDemoDocuments(variant), locale, visualizerCatalog)
      if (!created.ok) {
        setFailure(created.diagnostics[0]?.message ?? text.failure)
        return
      }
      for (const [id, value] of [['key', key], ['plaintext', plaintext], ['ciphertext', ciphertext]] as const) {
        const updated = created.value.setInput(id, value)
        if (!updated.ok) {
          created.value.dispose()
          setFailure(`${text[id]}: ${updated.diagnostics[0]?.message ?? text.failure}`)
          return
        }
      }
      session.current?.dispose()
      session.current = created.value
      setFailure(undefined)
      run(created.value, direction)
    }}>
      <label>{text.variant}{' '}
        <select value={variant} onChange={(event) => {
          const next = Number(event.target.value) as Variant
          setVariant(next)
          setKey(defaults[next].key)
          setPlaintext(defaults[next].plaintext)
          setCiphertext(defaults[next].ciphertext)
        }}>
          <option value={128}>AES-128</option>
          <option value={192}>AES-192</option>
          <option value={256}>AES-256</option>
        </select>
      </label>{' '}
      <label>{text.direction}{' '}
        <select value={direction} onChange={(event) => setDirection(event.target.value as Direction)}>
          <option value="encrypt">{text.encrypt}</option>
          <option value="decrypt">{text.decrypt}</option>
        </select>
      </label>{' '}
      <label>{text.key}{' '}
        <input
          pattern={`[0-9A-Fa-f]{${keyHexLength(variant)}}`}
          required
          size={keyHexLength(variant)}
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
      </label>{' '}
      <label>{text.plaintext}{' '}
        <input
          pattern="[0-9A-Fa-f]{32}"
          required
          size={32}
          value={plaintext}
          onChange={(event) => setPlaintext(event.target.value)}
        />
      </label>{' '}
      <label>{text.ciphertext}{' '}
        <input
          pattern="[0-9A-Fa-f]{32}"
          required
          size={32}
          value={ciphertext}
          onChange={(event) => setCiphertext(event.target.value)}
        />
      </label>{' '}
      <button type="submit">{text.run}</button>
    </form>
    {failure && <p role="alert">{failure}</p>}
    {view}
  </main>
}
