import path from 'path'
import type { LanguageConfig } from './languages/types.js'

/**
 * Returns true if the given path segment matches a gitignore-style pattern.
 * Supports exact names, extension globs (*.js), and directory names.
 */
function matchesPattern(segment: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    return segment.endsWith(pattern.slice(1))
  }
  return segment === pattern
}

/**
 * Returns true if any component of the path matches an ignore pattern.
 */
export function isIgnored(filePath: string, ignorePatterns: string[]): boolean {
  const parts = filePath.split(path.sep)
  for (const part of parts) {
    for (const pattern of ignorePatterns) {
      if (matchesPattern(part, pattern)) return true
    }
  }
  return false
}

/**
 * Returns the language key whose extensions include this file's extension,
 * or null if no language matches.
 */
export function detectLanguage(
  filePath: string,
  configs: Record<string, LanguageConfig>
): string | null {
  const ext = path.extname(filePath).toLowerCase()
  for (const [lang, config] of Object.entries(configs)) {
    if (config.extensions.includes(ext)) return lang
  }
  return null
}
