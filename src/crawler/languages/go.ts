import type { LanguageConfig } from './types.js'

const go: LanguageConfig = {
  extensions: ['.go'],
  ignorePatterns: [
    'vendor',
    'bin',
    'dist',
    '*_test.go',
  ],
  importPatterns: [
    // import "pkg"
    /import\s+"([\w./\-]+)"/g,
    // import ( "pkg1" \n "pkg2" )
    /"([\w./\-]+)"/g,
  ],
}

export default go
