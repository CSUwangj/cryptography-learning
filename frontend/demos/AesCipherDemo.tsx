import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createBrowserLessonSession, type BrowserLessonSession, type LessonSessionState } from '../src/lesson_runtime'
import { RenderHost, visualizerCatalog } from '../src/visualizers'
import { aesCipherDemoDocuments } from './aes128CipherLesson'

type Locale = 'en-US' | 'zh-CN'
type Variant = 128 | 192 | 256

const defaults: Record<Variant, { readonly key: string; readonly plaintext: string }> = {
  128: { key: '000102030405060708090a0b0c0d0e0f', plaintext: '00112233445566778899aabbccddeeff' },
  192: { key: '000102030405060708090a0b0c0d0e0f1011121314151617', plaintext: '00112233445566778899aabbccddeeff' },
  256: { key: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', plaintext: '00112233445566778899aabbccddeeff' },
}

const copy = {
  'en-US': {
    title: 'AES cipher demo',
    variant: 'Variant',
    key: 'Key (hex-block)',
    plaintext: 'Plaintext (hex-block)',
    run: 'Run encrypt → decrypt',
    encrypt: 'Encryption',
    decrypt: 'Decryption',
    failure: 'Could not run this AES Lesson.',
  },
  'zh-CN': {
    title: 'AES 加解密演示',
    variant: '变体',
    key: '密钥（定宽十六进制）',
    plaintext: '明文（定宽十六进制）',
    run: '运行：加密 → 解密',
    encrypt: '加密',
    decrypt: '解密',
    failure: '无法运行此 AES 课程。',
  },
} as const

const keyHexLength = (variant: Variant): number => variant / 4

const advanceToDecrypt = async (session: BrowserLessonSession): Promise<{ ok: true; value: LessonSessionState } | { ok: false; message: string }> => {
  // enter-input → encrypt → decrypt
  let latest: LessonSessionState | undefined
  for (let step = 0; step < 2; step += 1) {
    const result = await session.next()
    if (!result.ok) return { ok: false, message: result.diagnostics[0]?.message ?? '' }
    const executionDiagnostic = Object.values(result.value.executionDiagnostics)[0]
    if (executionDiagnostic) return { ok: false, message: executionDiagnostic.message }
    latest = result.value
  }
  return { ok: true, value: latest! }
}

export const AesCipherDemo: React.FC<{ readonly locale: Locale }> = ({ locale }) => {
  const text = copy[locale]
  const [variant, setVariant] = useState<Variant>(128)
  const [key, setKey] = useState(defaults[128].key)
  const [plaintext, setPlaintext] = useState(defaults[128].plaintext)
  // A result keeps the steps of the session that produced it, so a later session's
  // variant never pairs with an earlier variant's snapshots.
  const [result, setResult] = useState<{ readonly state: LessonSessionState; readonly steps: BrowserLessonSession['lesson']['steps'] }>()
  const [failure, setFailure] = useState<string>()
  const session = useRef<BrowserLessonSession | undefined>(undefined)

  const run = (current: BrowserLessonSession): void => {
    void advanceToDecrypt(current).then((outcome) => {
      if (session.current !== current) return
      if (outcome.ok) setResult({ state: outcome.value, steps: current.lesson.steps })
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
    run(created.value)
    return () => {
      created.value.dispose()
      session.current = undefined
    }
  }, [locale, text.failure])

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  // Re-rendering the full-state views blocks the main thread for seconds, so form edits must not.
  const views = useMemo(() => {
    const state = result?.state
    const encryptStep = result?.steps.find((step) => step.id === 'encrypt')
    const decryptStep = result?.steps.find((step) => step.id === 'decrypt')
    return <>
      {state?.snapshots.encrypt && <section>
        <h2>{text.encrypt}</h2>
        <RenderHost
          dimensions={{ width: 1100, height: 700 }}
          execution={state.snapshots.encrypt}
          executionIdentity={state.executionIdentities.encrypt ?? 'aes-encrypt'}
          locale={locale}
          presentation={encryptStep?.presentation}
          reducedMotion={reducedMotion}
        />
      </section>}
      {state?.snapshots.decrypt && <section>
        <h2>{text.decrypt}</h2>
        <RenderHost
          dimensions={{ width: 1100, height: 700 }}
          execution={state.snapshots.decrypt}
          executionIdentity={state.executionIdentities.decrypt ?? 'aes-decrypt'}
          locale={locale}
          presentation={decryptStep?.presentation}
          reducedMotion={reducedMotion}
        />
      </section>}
    </>
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
      for (const [id, value] of [['key', key], ['plaintext', plaintext]] as const) {
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
      run(created.value)
    }}>
      <label>{text.variant}{' '}
        <select value={variant} onChange={(event) => {
          const next = Number(event.target.value) as Variant
          setVariant(next)
          setKey(defaults[next].key)
          setPlaintext(defaults[next].plaintext)
        }}>
          <option value={128}>AES-128</option>
          <option value={192}>AES-192</option>
          <option value={256}>AES-256</option>
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
      <button type="submit">{text.run}</button>
    </form>
    {failure && <p role="alert">{failure}</p>}
    {views}
  </main>
}
