import type { FileMap, FileEntry } from '../crawler/types.js'
import type { ImportGraph } from './graph.js'
import type { Chunk } from './types.js'

const MAX_CHUNK_SIZE = 20

/**
 * Finds weakly-connected components using union-find.
 * "Weakly connected" means we treat import edges as undirected —
 * if A imports B, they belong in the same chunk.
 */
function connectedComponents(
  files: FileEntry[],
  edges: Map<string, Set<string>>
): FileEntry[][] {
  const parent = new Map<string, string>(files.map((f) => [f.path, f.path]))

  function find(x: string): string {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!))
    return parent.get(x)!
  }

  function union(a: string, b: string): void {
    parent.set(find(a), find(b))
  }

  for (const [from, targets] of edges) {
    for (const to of targets) {
      if (parent.has(to)) union(from, to)
    }
  }

  const groups = new Map<string, FileEntry[]>()
  for (const file of files) {
    const root = find(file.path)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(file)
  }

  return Array.from(groups.values())
}

/**
 * Splits a component that is too large into sub-chunks of MAX_CHUNK_SIZE.
 * Keeps the most-connected files together in the first sub-chunk.
 */
function splitLargeComponent(
  files: FileEntry[],
  edges: Map<string, Set<string>>
): FileEntry[][] {
  // Score each file by inbound + outbound degree within this component
  const pathSet = new Set(files.map((f) => f.path))
  const score = new Map<string, number>(files.map((f) => [f.path, 0]))

  for (const file of files) {
    const outbound = [...(edges.get(file.path) ?? [])].filter((p) => pathSet.has(p))
    score.set(file.path, (score.get(file.path) ?? 0) + outbound.length)
    for (const target of outbound) {
      score.set(target, (score.get(target) ?? 0) + 1)
    }
  }

  const sorted = [...files].sort((a, b) => (score.get(b.path) ?? 0) - (score.get(a.path) ?? 0))

  const chunks: FileEntry[][] = []
  for (let i = 0; i < sorted.length; i += MAX_CHUNK_SIZE) {
    chunks.push(sorted.slice(i, i + MAX_CHUNK_SIZE))
  }
  return chunks
}

/**
 * Picks the entry point for a chunk: the file with the highest inbound
 * degree within the chunk, falling back to the first file alphabetically.
 */
function pickEntryPoint(files: FileEntry[], edges: Map<string, Set<string>>): string {
  const pathSet = new Set(files.map((f) => f.path))
  const inbound = new Map<string, number>(files.map((f) => [f.path, 0]))

  for (const file of files) {
    for (const target of edges.get(file.path) ?? []) {
      if (pathSet.has(target)) inbound.set(target, (inbound.get(target) ?? 0) + 1)
    }
  }

  let best = files[0].path
  let bestScore = -1
  for (const [p, score] of inbound) {
    if (score > bestScore) {
      best = p
      bestScore = score
    }
  }
  return best
}

export function groupIntoChunks(fileMap: FileMap, graph: ImportGraph): Chunk[] {
  const components = connectedComponents(fileMap, graph.edges)

  const allSubgroups: FileEntry[][] = []
  for (const component of components) {
    if (component.length <= MAX_CHUNK_SIZE) {
      allSubgroups.push(component)
    } else {
      allSubgroups.push(...splitLargeComponent(component, graph.edges))
    }
  }

  return allSubgroups.map((files, i) => {
    const chunkPaths = new Set(files.map((f) => f.path))

    // Collect external deps from all files in this chunk
    const externalDeps = new Set<string>()
    for (const file of files) {
      for (const dep of graph.externals.get(file.path) ?? []) {
        externalDeps.add(dep)
      }
    }

    return {
      id: `chunk-${String(i + 1).padStart(3, '0')}`,
      files,
      entryPoint: pickEntryPoint(files, graph.edges),
      externalDeps: [...externalDeps].sort(),
    }
  })
}
