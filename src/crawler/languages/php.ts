import type { LanguageConfig } from './types.js'

const php: LanguageConfig = {
  extensions: ['.php'],
  ignorePatterns: [
    'vendor',
    'node_modules',
    'storage',
    'bootstrap/cache',
    '*.min.php',
  ],
  importPatterns: [
    // require/include (with optional _once)
    /(?:require|include)(?:_once)?\s*\(?['"]([^'"]+)['"]\)?/g,
    // use Namespace\Class
    /^use\s+([\w\\]+)/gm,
  ],
}

export default php
