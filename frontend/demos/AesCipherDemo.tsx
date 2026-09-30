import React, { useEffect, useRef, useState } from 'react'
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
    run: 'Run expand → encrypt → decrypt',
    expand: 'Key expansion',
    encrypt: 'Encryption',
    decrypt: 'Decryption',
    failure: 'Could not run this AES Lesson.',
  },
  'zh-CN': {
    title: 'AES 加解密演示',
    variant: '变体',
    key: '密钥（定宽十六进制）',
    plaintext: '明文（定宽十六进制）',
    run: '运行：扩展 → 加密 → 解密',
    expand: '密钥扩展',
    encrypt: '加密',
    decrypt: '解密',
    failure: '无法运行此 AES 课程。',
  },
} as const

const keyHexLength = (variant: Variant): number => variant / 4

const advanceToDecrypt = async (session: BrowserLessonSession): Promise<{ ok: true; value: LessonSessionState } | { ok: false; message: string }> => {
  // enter-input → expand-key → encrypt → decrypt
  let latest: LessonSessionState | undefined
  for (let step = 0; step < 3; step += 1) {
    const result = await session.next()
    if (!result.ok) return { ok: false, message: result.diagnostics[0]?.message ?? '' }
    latest = result.value
  }
  return { ok: true, value: latest! }
}

export const AesCipherDemo: React.FC<{ readonly locale: Locale }> = ({ locale }) => {
  const text = copy[locale]
  const [variant, setVariant] = useState<Variant>(128)
  const [key, setKey] = useState(defaults[128].key)
  const [plaintext, setPlaintext] = useState(defaults[128].plaintext)
  const [state, setState] = useState<LessonSessionState>()
  const [failure, setFailure] = useState<string>()
  const session = useRef<BrowserLessonSession | undefined>(undefined)

  useEffect(() => {
    const created = createBrowserLessonSession(aesCipherDemoDocuments(128), locale, visualizerCatalog)
    if (!created.ok) {
      setFailure(created.diagnostics[0]?.message ?? text.failure)
      return
    }
    session.current = created.value
    let active = true
    void advanceToDecrypt(created.value).then((result) => {
      if (!active) return
      if (result.ok) setState(result.value)
      else setFailure(result.message || text.failure)
    })
    return () => {
      active = false
      created.value.dispose()
      session.current = undefined
    }
  }, [locale, text.failure])

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const steps = session.current?.lesson.steps
  const expandStep = steps?.find((step) => step.id === 'expand-key')
  const encryptStep = steps?.find((step) => step.id === 'encrypt')
  const decryptStep = steps?.find((step) => step.id === 'decrypt')

  return <main style={{ margin: '0 auto', maxWidth: 1200, padding: 20 }}>
    <h1>{text.title}</h1>
    <form onSubmit={(event) => {
      event.preventDefault()
      session.current?.dispose()
      const created = createBrowserLessonSession(aesCipherDemoDocuments(variant), locale, visualizerCatalog)
      if (!created.ok) {
        setFailure(created.diagnostics[0]?.message ?? text.failure)
        return
      }
      session.current = created.value
      for (const [id, value] of [['key', key], ['plaintext', plaintext]] as const) {
        const updated = created.value.setInput(id, value)
        if (!updated.ok) {
          setFailure(updated.diagnostics[0]?.message ?? text.failure)
          return
        }
      }
      setFailure(undefined)
      void advanceToDecrypt(created.value).then((result) => {
        if (result.ok) setState(result.value)
        else setFailure(result.message || text.failure)
      })
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
    {state?.snapshots['expand-key'] && <section>
      <h2>{text.expand}</h2>
      <RenderHost
        dimensions={{ width: 1100, height: 500 }}
        execution={state.snapshots['expand-key']}
        executionIdentity={state.executionIdentities['expand-key'] ?? 'aes-expand'}
        locale={locale}
        presentation={expandStep?.presentation}
        reducedMotion={reducedMotion}
      />
    </section>}
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
  </main>
}
