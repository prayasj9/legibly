export interface LanguageConfig {
  extensions: string[]
  ignorePatterns: string[]
  importPatterns: RegExp[] // for static import graph only
}
