import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

const dep = (name: string) =>
  packageJson.dependencies[name] ?? packageJson.devDependencies[name]

describe('frontend runtime upgrade contract (#15)', () => {
  it('pins React and React DOM on the 19.x line', () => {
    expect(dep('react')).toMatch(/^(\^|~)?19\./)
    expect(dep('react-dom')).toMatch(/^(\^|~)?19\./)
    expect(dep('@types/react')).toMatch(/^(\^|~)?19\./)
    expect(dep('@types/react-dom')).toMatch(/^(\^|~)?19\./)
  })

  it('upgrades Blueprint packages together on the 6.x line', () => {
    expect(dep('@blueprintjs/core')).toMatch(/^(\^|~)?6\./)
    expect(dep('@blueprintjs/icons')).toMatch(/^(\^|~)?6\./)
    expect(dep('@blueprintjs/select')).toMatch(/^(\^|~)?6\./)
  })

  it('uses current Emotion packages instead of @emotion/core macros', () => {
    expect(dep('@emotion/react')).toMatch(/^(\^|~)?11\./)
    expect(dep('@emotion/styled')).toMatch(/^(\^|~)?11\./)
    expect(dep('@emotion/core')).toBeUndefined()
  })

  it('type-checks with TypeScript 6', () => {
    expect(dep('typescript')).toMatch(/^(\^|~)?6\./)
  })
})
