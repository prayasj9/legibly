import { describe, it, expect } from 'vitest'
import path from 'path'
import { groupIntoChunks } from '../grouper.js'
import type { FileEntry } from '../../crawler/types.js'
import type { ImportGraph } from '../graph.js'

function makeEntry(p: string): FileEntry {
  return { path: p, relativePath: path.basename(p), language: 'typescript', size: 100, lastModified: new Date() }
}

function makeGraph(
  edgePairs: [string, string][],
  externalPairs: [string, string[]][] = []
): ImportGraph {
  const allPaths = new Set([
    ...edgePairs.flatMap(([a, b]) => [a, b]),
    ...externalPairs.map(([p]) => p),
  ])
  const edges = new Map<string, Set<string>>(
    [...allPaths].map((p) => [p, new Set()])
  )
  const externals = new Map<string, Set<string>>(
    [...allPaths].map((p) => [p, new Set()])
  )
  for (const [from, to] of edgePairs) edges.get(from)!.add(to)
  for (const [p, deps] of externalPairs) deps.forEach((d) => externals.get(p)!.add(d))
  return { edges, externals }
}

describe('groupIntoChunks', () => {
  it('puts connected files into the same chunk', () => {
    const a = '/src/a.ts', b = '/src/b.ts'
    const graph = makeGraph([[a, b]])
    const chunks = groupIntoChunks([makeEntry(a), makeEntry(b)], graph)

    expect(chunks).toHaveLength(1)
    const paths = chunks[0].files.map((f) => f.path)
    expect(paths).toContain(a)
    expect(paths).toContain(b)
  })

  it('puts disconnected files into separate chunks', () => {
    const a = '/src/a.ts', b = '/src/b.ts', c = '/src/c.ts'
    const graph = makeGraph([[a, b]])  // c is isolated
    const chunks = groupIntoChunks([makeEntry(a), makeEntry(b), makeEntry(c)], graph)

    expect(chunks).toHaveLength(2)
  })

  it('assigns chunk ids as chunk-001, chunk-002, ...', () => {
    const a = '/a.ts', b = '/b.ts'
    const graph = makeGraph([])  // both isolated
    const chunks = groupIntoChunks([makeEntry(a), makeEntry(b)], graph)

    const ids = chunks.map((c) => c.id).sort()
    expect(ids[0]).toBe('chunk-001')
    expect(ids[1]).toBe('chunk-002')
  })

  it('picks the most-imported file as the entry point', () => {
    // a → c, b → c: c has the highest inbound degree
    const a = '/a.ts', b = '/b.ts', c = '/c.ts'
    const graph = makeGraph([[a, c], [b, c]])
    const chunks = groupIntoChunks([makeEntry(a), makeEntry(b), makeEntry(c)], graph)

    expect(chunks).toHaveLength(1)
    expect(chunks[0].entryPoint).toBe(c)
  })

  it('collects external deps from all files in a chunk', () => {
    const a = '/a.ts', b = '/b.ts'
    const graph = makeGraph([[a, b]], [[a, ['express']], [b, ['zod']]])
    const chunks = groupIntoChunks([makeEntry(a), makeEntry(b)], graph)

    expect(chunks[0].externalDeps).toContain('express')
    expect(chunks[0].externalDeps).toContain('zod')
  })

  it('splits components larger than 20 files', () => {
    const files = Array.from({ length: 25 }, (_, i) => makeEntry(`/src/file${i}.ts`))
    // Chain: file0 → file1 → ... → file24 (all connected)
    const pairs: [string, string][] = files.slice(0, -1).map((f, i) => [f.path, files[i + 1].path])
    const graph = makeGraph(pairs)

    const chunks = groupIntoChunks(files, graph)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.files.length).toBeLessThanOrEqual(20)
    }
  })

  it('returns empty array for empty fileMap', () => {
    const graph = makeGraph([])
    expect(groupIntoChunks([], graph)).toHaveLength(0)
  })
})
