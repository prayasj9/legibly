import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import path from 'path'
import os from 'os'
import { buildServicePrompt } from '../prompts/service.js'
import type { Chunk } from '../../chunker/types.js'
import type { FileEntry } from '../../crawler/types.js'

function makeEntry(filePath: string, language = 'typescript'): FileEntry {
  return { path: filePath, relativePath: path.basename(filePath), language, size: 100, lastModified: new Date() }
}

describe('buildServicePrompt', () => {
  let tmp: string

  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `legibly-prompt-${Date.now()}`)
    mkdirSync(tmp, { recursive: true })
  })

  afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

  it('includes the entry point path', () => {
    const filePath = path.join(tmp, 'service.ts')
    writeFileSync(filePath, 'export const x = 1')
    const chunk: Chunk = {
      id: 'chunk-001',
      files: [makeEntry(filePath)],
      entryPoint: filePath,
      externalDeps: [],
    }
    const prompt = buildServicePrompt(chunk)
    expect(prompt).toContain(filePath)
  })

  it('includes file contents in the prompt', () => {
    const filePath = path.join(tmp, 'payment.ts')
    writeFileSync(filePath, 'export function charge() {}')
    const chunk: Chunk = {
      id: 'chunk-001',
      files: [makeEntry(filePath)],
      entryPoint: filePath,
      externalDeps: [],
    }
    const prompt = buildServicePrompt(chunk)
    expect(prompt).toContain('export function charge()')
  })

  it('lists external deps when present', () => {
    const filePath = path.join(tmp, 'app.ts')
    writeFileSync(filePath, '')
    const chunk: Chunk = {
      id: 'chunk-001',
      files: [makeEntry(filePath)],
      entryPoint: filePath,
      externalDeps: ['express', 'zod'],
    }
    const prompt = buildServicePrompt(chunk)
    expect(prompt).toContain('express')
    expect(prompt).toContain('zod')
  })

  it('notes no external packages when externalDeps is empty', () => {
    const filePath = path.join(tmp, 'util.ts')
    writeFileSync(filePath, '')
    const chunk: Chunk = {
      id: 'chunk-001',
      files: [makeEntry(filePath)],
      entryPoint: filePath,
      externalDeps: [],
    }
    const prompt = buildServicePrompt(chunk)
    expect(prompt).toContain('No external packages detected')
  })

  it('includes the required JSON schema shape', () => {
    const filePath = path.join(tmp, 'a.ts')
    writeFileSync(filePath, '')
    const chunk: Chunk = { id: 'chunk-001', files: [makeEntry(filePath)], entryPoint: filePath, externalDeps: [] }
    const prompt = buildServicePrompt(chunk)
    expect(prompt).toContain('"failurePoints"')
    expect(prompt).toContain('"implicitAssumptions"')
    expect(prompt).toContain('"beforeYouTouch"')
  })

  it('includes the language of each file', () => {
    const tsFile = path.join(tmp, 'service.ts')
    const pyFile = path.join(tmp, 'helper.py')
    writeFileSync(tsFile, '')
    writeFileSync(pyFile, '')
    const chunk: Chunk = {
      id: 'chunk-001',
      files: [makeEntry(tsFile, 'typescript'), makeEntry(pyFile, 'python')],
      entryPoint: tsFile,
      externalDeps: [],
    }
    const prompt = buildServicePrompt(chunk)
    expect(prompt).toMatch(/Languages present: python, typescript/)
  })

  it('shows singular language line for single-language chunks', () => {
    const filePath = path.join(tmp, 'app.go')
    writeFileSync(filePath, '')
    const chunk: Chunk = {
      id: 'chunk-001',
      files: [makeEntry(filePath, 'go')],
      entryPoint: filePath,
      externalDeps: [],
    }
    const prompt = buildServicePrompt(chunk)
    expect(prompt).toContain('Language: go')
    expect(prompt).not.toContain('Languages present')
  })

  it('truncates files exceeding 40k chars', () => {
    const filePath = path.join(tmp, 'big.ts')
    writeFileSync(filePath, 'x'.repeat(50_000))
    const chunk: Chunk = {
      id: 'chunk-001',
      files: [makeEntry(filePath)],
      entryPoint: filePath,
      externalDeps: [],
    }
    const prompt = buildServicePrompt(chunk)
    expect(prompt).toContain('[TRUNCATED')
    // Original 50k chars should be cut down — prompt should be under 150k total
    expect(prompt.length).toBeLessThan(150_000)
  })

  it('omits files that would push the chunk over 150k chars', () => {
    // Fill up close to the limit with one file, then add a second
    const bigFile = path.join(tmp, 'big.ts')
    const smallFile = path.join(tmp, 'small.ts')
    writeFileSync(bigFile, 'x'.repeat(40_000))   // under per-file limit, but fills the chunk
    writeFileSync(smallFile, 'export const y = 1')

    // Create many large files to exceed the chunk cap
    const files: FileEntry[] = Array.from({ length: 5 }, (_, i) => {
      const p = path.join(tmp, `large${i}.ts`)
      writeFileSync(p, 'x'.repeat(40_000))
      return makeEntry(p)
    })
    files.push(makeEntry(smallFile))

    const chunk: Chunk = {
      id: 'chunk-001',
      files,
      entryPoint: files[0].path,
      externalDeps: [],
    }
    const prompt = buildServicePrompt(chunk)
    // Some files should be omitted with [OMITTED] notice
    expect(prompt).toContain('[OMITTED')
    expect(prompt.length).toBeLessThan(200_000)
  })
})
