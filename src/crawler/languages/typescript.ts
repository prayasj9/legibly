import type { LanguageConfig } from './types.js'

const typescript: LanguageConfig = {
  extensions: ['.ts', '.tsx', '.vue'],
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    '*.d.ts',
  ],
  importPatterns: [
    // import ... from '...'
    /import\s+(?:[\w*{},\s]+\s+from\s+)?['"]([^'"]+)['"]/g,
    // dynamic import('...')
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // require('...')
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ],
}

export default typescript
