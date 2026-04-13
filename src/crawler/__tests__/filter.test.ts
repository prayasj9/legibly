import { describe, it, expect } from 'vitest'
import { isIgnored, detectLanguage } from '../filter.js'
import { REGISTRY } from '../languages/index.js'

describe('isIgnored', () => {
  it('ignores exact directory names', () => {
    expect(isIgnored('node_modules/express/index.js', ['node_modules'])).toBe(true)
  })

  it('ignores extension globs', () => {
    expect(isIgnored('src/app.min.js', ['*.min.js'])).toBe(true)
  })

  it('ignores nested paths that contain an ignored segment', () => {
    expect(isIgnored('src/dist/output.js', ['dist'])).toBe(true)
  })

  it('does not ignore non-matching paths', () => {
    expect(isIgnored('src/services/payment.js', ['node_modules', 'dist'])).toBe(false)
  })

  it('does not match partial directory names', () => {
    expect(isIgnored('src/distribution/index.js', ['dist'])).toBe(false)
  })
})

describe('detectLanguage', () => {
  it('detects .ts as typescript', () => {
    expect(detectLanguage('src/app.ts', REGISTRY)).toBe('typescript')
  })

  it('detects .tsx as typescript', () => {
    expect(detectLanguage('src/Button.tsx', REGISTRY)).toBe('typescript')
  })

  it('detects .js as nodejs', () => {
    expect(detectLanguage('src/server.js', REGISTRY)).toBe('nodejs')
  })

  it('detects .mjs as nodejs', () => {
    expect(detectLanguage('src/util.mjs', REGISTRY)).toBe('nodejs')
  })

  it('detects .py as python', () => {
    expect(detectLanguage('app/main.py', REGISTRY)).toBe('python')
  })

  it('detects .php as php', () => {
    expect(detectLanguage('app/Controller.php', REGISTRY)).toBe('php')
  })

  it('detects .java as java', () => {
    expect(detectLanguage('src/PaymentService.java', REGISTRY)).toBe('java')
  })

  it('detects .go as go', () => {
    expect(detectLanguage('cmd/main.go', REGISTRY)).toBe('go')
  })

  it('returns null for unknown extensions', () => {
    expect(detectLanguage('README.md', REGISTRY)).toBeNull()
    expect(detectLanguage('data.json', REGISTRY)).toBeNull()
  })

  it('is case-insensitive for extensions', () => {
    expect(detectLanguage('src/App.TS', REGISTRY)).toBe('typescript')
  })
})
