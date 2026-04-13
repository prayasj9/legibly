import fs from 'fs'
import path from 'path'
import type { FileMap } from './types.js'
import type { LanguageConfig } from './languages/types.js'
import { isIgnored, detectLanguage } from './filter.js'

export interface WalkOptions {
  source: string
  configs: Record<string, LanguageConfig>
  /** Extra ignore patterns from legibly.config.json (merged with per-language ones) */
  extraIgnore?: string[]
}

export function walk(options: WalkOptions): FileMap {
  const { source, configs, extraIgnore = [] } = options

  // Merge all per-language ignore patterns with user-supplied extras
  const allIgnore = [
    ...new Set([
      ...Object.values(configs).flatMap((c) => c.ignorePatterns),
      ...extraIgnore,
    ]),
  ]

  const results: FileMap = []

  function recurse(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      // Skip unreadable directories silently
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relativePath = path.relative(source, fullPath)

      if (isIgnored(relativePath, allIgnore)) continue

      if (entry.isDirectory()) {
        recurse(fullPath)
      } else if (entry.isFile()) {
        const lang = detectLanguage(entry.name, configs)
        if (!lang) continue

        let stat: fs.Stats
        try {
          stat = fs.statSync(fullPath)
        } catch {
          continue
        }

        results.push({
          path: fullPath,
          relativePath,
          language: lang,
          size: stat.size,
          lastModified: stat.mtime,
        })
      }
    }
  }

  recurse(source)
  return results
}
