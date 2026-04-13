import fs from 'fs'
import path from 'path'
import type { FileMap, FileEntry } from '../crawler/types.js'
import type { LanguageConfig } from '../crawler/languages/types.js'

export interface ImportGraph {
  /** file path → set of file paths it imports (resolved, within the repo) */
  edges: Map<string, Set<string>>
  /** file path → set of external package names it references */
  externals: Map<string, Set<string>>
}

const RESOLVE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.py', '.php', '.java', '.go',
]

/**
 * Tries to resolve a relative import specifier to an absolute file path
 * that exists in the fileSet. Returns null if not resolvable.
 */
function resolveRelativeImport(
  fromFile: string,
  specifier: string,
  fileSet: Set<string>
): string | null {
  const base = path.resolve(path.dirname(fromFile), specifier)

  // Exact match (import already has extension)
  if (fileSet.has(base)) return base

  // Try adding known extensions
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = base + ext
    if (fileSet.has(candidate)) return candidate
  }

  // Try index file inside a directory
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = path.join(base, `index${ext}`)
    if (fileSet.has(candidate)) return candidate
  }

  return null
}

function isRelativeImport(specifier: string): boolean {
  // JS/TS: ./foo or ../foo
  // Python: .foo or ..foo (from .utils import ...)
  return specifier.startsWith('./') || specifier.startsWith('../') || /^\.*[^.]/.test(specifier) && specifier.startsWith('.')
}

/**
 * Normalises Python-style relative specifiers (.utils → ./utils, ..utils → ../utils)
 * to the ./  ../ form that path.resolve understands.
 */
function normalisePythonRelative(specifier: string): string {
  if (specifier.startsWith('./') || specifier.startsWith('../')) return specifier
  // Count leading dots
  const dots = specifier.match(/^\.+/)?.[0] ?? ''
  const rest = specifier.slice(dots.length)
  if (dots.length === 1) return `./${rest}`
  // Two dots = one level up, three dots = two levels up, etc.
  const levels = '../'.repeat(dots.length - 1)
  return `${levels}${rest}`
}

function extractImports(content: string, patterns: RegExp[]): string[] {
  const results: string[] = []
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags)
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      if (m[1]) results.push(m[1])
    }
  }
  return results
}

export function buildGraph(
  fileMap: FileMap,
  configs: Record<string, LanguageConfig>
): ImportGraph {
  const fileSet = new Set(fileMap.map((f) => f.path))
  const edges = new Map<string, Set<string>>(fileMap.map((f) => [f.path, new Set()]))
  const externals = new Map<string, Set<string>>(fileMap.map((f) => [f.path, new Set()]))

  for (const entry of fileMap) {
    const config = configs[entry.language]
    if (!config) continue

    let content: string
    try {
      content = fs.readFileSync(entry.path, 'utf-8')
    } catch {
      continue
    }

    const specifiers = extractImports(content, config.importPatterns)

    for (const specifier of specifiers) {
      if (isRelativeImport(specifier)) {
        const normalised = normalisePythonRelative(specifier)
        const resolved = resolveRelativeImport(entry.path, normalised, fileSet)
        if (resolved) {
          edges.get(entry.path)!.add(resolved)
        }
      } else {
        // External package — strip sub-path (e.g. "lodash/merge" → "lodash")
        const pkgName = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : specifier.split('/')[0]
        if (pkgName) externals.get(entry.path)!.add(pkgName)
      }
    }
  }

  return { edges, externals }
}
