import type { LanguageConfig } from './types.js'
import nodejs from './nodejs.js'
import typescript from './typescript.js'
import python from './python.js'
import php from './php.js'
import java from './java.js'
import go from './go.js'

const REGISTRY: Record<string, LanguageConfig> = {
  nodejs,
  typescript,
  python,
  php,
  java,
  go,
}

const SUPPORTED = Object.keys(REGISTRY).join(', ')

export function getLanguageConfig(language: string): LanguageConfig {
  const config = REGISTRY[language]
  if (!config) {
    throw new Error(
      `Unsupported language: "${language}". ` +
        `Supported languages are: ${SUPPORTED}. ` +
        `To add a new language, see CONTRIBUTING.md.`
    )
  }
  return config
}

export { REGISTRY }
export type { LanguageConfig }
