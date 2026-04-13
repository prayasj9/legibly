import type { LanguageConfig } from './types.js'

const nodejs: LanguageConfig = {
  extensions: ['.js', '.mjs', '.cjs', '.vue'],
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    '*.min.js',
    '*.bundle.js',
  ],
  importPatterns: [
    // require('...')
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // import ... from '...'
    /import\s+(?:[\w*{},\s]+\s+from\s+)?['"]([^'"]+)['"]/g,
    // dynamic import('...')
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ],
}

export default nodejs
