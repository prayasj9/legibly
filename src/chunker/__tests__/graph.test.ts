import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import path from 'path'
import os from 'os'
import { buildGraph } from '../graph.js'
import { REGISTRY } from '../../crawler/languages/index.js'
import type { FileEntry } from '../../crawler/types.js'

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `legibly-graph-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeEntry(filePath: string, language = 'typescript'): FileEntry {
  return { path: filePath, relativePath: path.basename(filePath), language, size: 100, lastModified: new Date() }
}

function writeFile(p: string, content: string): void {
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, content)
}

describe('buildGraph', () => {
  let tmp: string

  beforeEach(() => { tmp = makeTmpDir() })
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

  it('creates an edge for a relative import', () => {
    const a = path.join(tmp, 'a.ts')
    const b = path.join(tmp, 'b.ts')
    writeFile(a, `import { foo } from './b'`)
    writeFile(b, `export const foo = 1`)

    const fileMap = [makeEntry(a), makeEntry(b)]
    const { edges } = buildGraph(fileMap, REGISTRY)

    expect(edges.get(a)).toContain(b)
    expect(edges.get(b)?.size).toBe(0)
  })

  it('handles import with explicit extension', () => {
    const a = path.join(tmp, 'a.ts')
    const b = path.join(tmp, 'b.ts')
    writeFile(a, `import './b.ts'`)
    writeFile(b, '')

    const { edges } = buildGraph([makeEntry(a), makeEntry(b)], REGISTRY)
    expect(edges.get(a)).toContain(b)
  })

  it('resolves index file imports', () => {
    const a = path.join(tmp, 'a.ts')
    const index = path.join(tmp, 'utils', 'index.ts')
    writeFile(a, `import { x } from './utils'`)
    writeFile(index, `export const x = 1`)

    const { edges } = buildGraph([makeEntry(a), makeEntry(index)], REGISTRY)
    expect(edges.get(a)).toContain(index)
  })

  it('does not add an edge for unresolvable relative imports', () => {
    const a = path.join(tmp, 'a.ts')
    writeFile(a, `import './nonexistent'`)

    const { edges } = buildGraph([makeEntry(a)], REGISTRY)
    expect(edges.get(a)?.size).toBe(0)
  })

  it('records external packages, stripping sub-paths', () => {
    const a = path.join(tmp, 'a.ts')
    writeFile(a, `import express from 'express'\nimport { merge } from 'lodash/merge'`)

    const { externals } = buildGraph([makeEntry(a)], REGISTRY)
    expect(externals.get(a)).toContain('express')
    expect(externals.get(a)).toContain('lodash')
    expect(externals.get(a)).not.toContain('lodash/merge')
  })

  it('handles scoped packages correctly', () => {
    const a = path.join(tmp, 'a.ts')
    writeFile(a, `import { something } from '@anthropic-ai/sdk/core'`)

    const { externals } = buildGraph([makeEntry(a)], REGISTRY)
    expect(externals.get(a)).toContain('@anthropic-ai/sdk')
  })

  it('works for python relative imports', () => {
    const a = path.join(tmp, 'service.py')
    const b = path.join(tmp, 'utils.py')
    writeFile(a, `from .utils import helper`)
    writeFile(b, `def helper(): pass`)

    const fileMap = [makeEntry(a, 'python'), makeEntry(b, 'python')]
    const { edges } = buildGraph(fileMap, REGISTRY)
    expect(edges.get(a)).toContain(b)
  })
})
