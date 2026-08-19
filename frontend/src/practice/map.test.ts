import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mapLabDescription, mapPracticeMenu } from './map'
import type { LabQuery, PracticesQuery } from '../transport/generated/graphql'

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../baseline/fixtures/graphql',
)

const loadFixture = <T>(name: string): T =>
  JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as T

describe('Practice GraphQL mapping (#16)', () => {
  it('maps the practice catalog preserving category and lab order', () => {
    const fixture = loadFixture<{ data: PracticesQuery }>('practice.json')
    const categories = mapPracticeMenu(fixture.data, 'en-US')

    expect(categories.map((c) => c.id)).toEqual(['classical', 'modern'])
    expect(categories[0].labs.map((l) => l.id)).toEqual(['affine', 'caesar'])
    expect(categories[1].labs.map((l) => l.id)).toEqual(['rsa-factor'])
  })

  it('selects localized category and lab names, with language fallback', () => {
    const fixture = loadFixture<{ data: PracticesQuery }>('practice.json')

    expect(mapPracticeMenu(fixture.data, 'en-US')).toEqual([
      {
        id: 'classical',
        name: 'Classical',
        labs: [
          { id: 'affine', name: 'Affine Cipher' },
          { id: 'caesar', name: '凯撒加密' },
        ],
      },
      {
        id: 'modern',
        name: 'Modern',
        labs: [{ id: 'rsa-factor', name: 'RSA Factorization' }],
      },
    ])

    expect(mapPracticeMenu(fixture.data, 'zh-CN')[0]).toMatchObject({
      id: 'classical',
      name: '古典密码学',
      labs: [
        { id: 'affine', name: '仿射加密' },
        { id: 'caesar', name: '凯撒加密' },
      ],
    })
  })

  it('uses stable IDs when a catalog entry has no translated name', () => {
    const data: PracticesQuery = {
      practice: {
        labCategories: [{
          id: 'classical',
          name: [],
          labs: [{
            id: 'affine',
            resources: [],
            wsEndpoints: [],
            tcpEndpoints: [],
          }],
        }],
      },
    }

    expect(mapPracticeMenu(data, 'en-US')).toEqual([
      {
        id: 'classical',
        name: 'classical',
        labs: [{ id: 'affine', name: 'affine' }],
      },
    ])
  })

  it('maps Lab Description endpoints and content from representative fixtures', () => {
    const en = loadFixture<{ data: LabQuery }>('lab_affine_en.json')
    const zh = loadFixture<{ data: LabQuery }>('lab_affine_zh.json')

    expect(mapLabDescription(en.data)).toEqual({
      content:
        '# Affine Cipher\n\nBaseline Lab Description for characterization tests.\n\nCiphertext: `baseline-affine-en`\n',
      wsEndpoints: [{ host: '127.0.0.1', port: 19020 }],
      tcpEndpoints: [{ host: '127.0.0.1', port: 19000 }],
    })

    expect(mapLabDescription(zh.data)).toEqual({
      content:
        '# 仿射加密\n\nBaseline Lab Description for characterization tests.\n\nCiphertext: `baseline-affine-zh`\n',
      wsEndpoints: [{ host: '127.0.0.1', port: 19020 }],
      tcpEndpoints: [{ host: '127.0.0.1', port: 19000 }],
    })
  })

  it('preserves empty endpoint arrays on a Lab Description', () => {
    const data: LabQuery = {
      lab: {
        lang: 'en-US',
        name: 'RSA Factorization',
        content: 'no sockets',
        wsEndpoints: [],
        tcpEndpoints: [],
      },
    }
    expect(mapLabDescription(data)).toEqual({
      content: 'no sockets',
      wsEndpoints: [],
      tcpEndpoints: [],
    })
  })
})
