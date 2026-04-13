import type { ChunkAnalysis } from '../analyser/types.js'
import type { AliasEntry } from './types.js'

/**
 * Normalises a service name for fuzzy matching:
 * strips punctuation, separators, common suffixes, lowercases.
 */
function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_.\s/\\]+/g, '')          // strip separators
    .replace(/service|svc|module|handler|controller|manager|util|utils|helper|helpers$/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Counts how many other chunks list this chunk as a dependency.
 */
function countDependents(canonical: string, allChunks: ChunkAnalysis[]): number {
  let count = 0
  for (const chunk of allChunks) {
    const isDep = chunk.dependencies.some(
      (d) => normalise(d.name) === normalise(canonical)
    )
    if (isDep) count++
  }
  return count
}

function classify(dependents: number): AliasEntry['classification'] {
  if (dependents >= 5) return 'core'
  if (dependents >= 2) return 'supporting'
  if (dependents === 1) return 'utility'
  return 'unknown'
}

/**
 * Deduplicates service names across all chunk analyses.
 *
 * Strategy:
 * 1. Each chunk's `name` is a canonical candidate.
 * 2. Dependency names across all chunks are matched against canonicals via
 *    normalised string comparison.
 * 3. Anything that normalises to the same string as a canonical is treated
 *    as an alias of that canonical.
 */
export function buildAliasTable(chunks: ChunkAnalysis[]): AliasEntry[] {
  // Map: normalised key → canonical chunk
  const canonicalMap = new Map<string, ChunkAnalysis>()
  for (const chunk of chunks) {
    canonicalMap.set(normalise(chunk.name), chunk)
  }

  // Map: normalised canonical → set of alias strings seen
  const aliasMap = new Map<string, Set<string>>()
  for (const key of canonicalMap.keys()) {
    aliasMap.set(key, new Set())
  }

  // Walk all dependency names — anything that normalises to a known canonical
  // but differs in its raw form is an alias
  for (const chunk of chunks) {
    for (const dep of chunk.dependencies) {
      const normDep = normalise(dep.name)
      if (canonicalMap.has(normDep)) {
        const canonical = canonicalMap.get(normDep)!
        if (dep.name !== canonical.name) {
          aliasMap.get(normDep)!.add(dep.name)
        }
      }
    }
  }

  return Array.from(canonicalMap.entries()).map(([normKey, chunk]) => {
    const dependents = countDependents(chunk.name, chunks)
    return {
      canonical: chunk.name,
      file: chunk.file,
      aliases: [...aliasMap.get(normKey)!],
      dependents,
      classification: classify(dependents),
    }
  })
}
