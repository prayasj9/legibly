import type { LanguageConfig } from './types.js'

const java: LanguageConfig = {
  extensions: ['.java'],
  ignorePatterns: [
    'target',
    'build',
    '.gradle',
    'out',
    '*.class',
  ],
  importPatterns: [
    // import com.example.Foo;
    /^import\s+([\w.]+)\s*;/gm,
  ],
}

export default java
