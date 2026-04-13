import { describe, it, expect } from 'vitest'
import { getLanguageConfig, REGISTRY } from '../index.js'

describe('getLanguageConfig', () => {
  it('returns config for each supported language', () => {
    for (const lang of Object.keys(REGISTRY)) {
      const config = getLanguageConfig(lang)
      expect(config.extensions.length).toBeGreaterThan(0)
      expect(config.ignorePatterns.length).toBeGreaterThan(0)
      expect(config.importPatterns.length).toBeGreaterThan(0)
    }
  })

  it('throws a clear error for unsupported language', () => {
    expect(() => getLanguageConfig('ruby')).toThrowError(/Unsupported language: "ruby"/)
    expect(() => getLanguageConfig('ruby')).toThrowError(/Supported languages are:/)
    expect(() => getLanguageConfig('ruby')).toThrowError(/CONTRIBUTING\.md/)
  })

  describe('nodejs', () => {
    it('includes .vue extension', () => {
      expect(getLanguageConfig('nodejs').extensions).toContain('.vue')
    })

    it('matches require() imports', () => {
      const { importPatterns } = getLanguageConfig('nodejs')
      const src = `const fs = require('fs')\nconst x = require("./utils")`
      const matches = extractImports(src, importPatterns)
      expect(matches).toContain('fs')
      expect(matches).toContain('./utils')
    })

    it('matches ES import statements', () => {
      const { importPatterns } = getLanguageConfig('nodejs')
      const src = `import express from 'express'\nimport { foo } from './bar'`
      const matches = extractImports(src, importPatterns)
      expect(matches).toContain('express')
      expect(matches).toContain('./bar')
    })
  })

  describe('typescript', () => {
    it('excludes .d.ts from crawl extensions but lists .ts and .tsx', () => {
      const config = getLanguageConfig('typescript')
      expect(config.extensions).toContain('.ts')
      expect(config.extensions).toContain('.tsx')
      expect(config.ignorePatterns).toContain('*.d.ts')
    })
  })

  describe('python', () => {
    it('matches standard import statements', () => {
      const { importPatterns } = getLanguageConfig('python')
      const src = `import os\nimport json\nfrom pathlib import Path\nfrom .utils import helper`
      const matches = extractImports(src, importPatterns)
      expect(matches).toContain('os')
      expect(matches).toContain('json')
      expect(matches).toContain('pathlib')
      expect(matches).toContain('.utils')
    })
  })

  describe('php', () => {
    it('matches require_once and use statements', () => {
      const { importPatterns } = getLanguageConfig('php')
      const src = `require_once 'vendor/autoload.php';\nuse App\\Http\\Controllers\\UserController;`
      const matches = extractImports(src, importPatterns)
      expect(matches).toContain('vendor/autoload.php')
      expect(matches).toContain('App\\Http\\Controllers\\UserController')
    })
  })

  describe('java', () => {
    it('matches import statements', () => {
      const { importPatterns } = getLanguageConfig('java')
      const src = `import java.util.List;\nimport com.example.service.PaymentService;`
      const matches = extractImports(src, importPatterns)
      expect(matches).toContain('java.util.List')
      expect(matches).toContain('com.example.service.PaymentService')
    })
  })

  describe('go', () => {
    it('matches quoted import paths', () => {
      const { importPatterns } = getLanguageConfig('go')
      const src = `import "fmt"\nimport "github.com/gin-gonic/gin"`
      const matches = extractImports(src, importPatterns)
      expect(matches).toContain('fmt')
      expect(matches).toContain('github.com/gin-gonic/gin')
    })
  })
})

// Helper: collect all capture group 1 matches across all patterns
function extractImports(src: string, patterns: RegExp[]): string[] {
  const results: string[] = []
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags)
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
      if (m[1]) results.push(m[1])
    }
  }
  return results
}
