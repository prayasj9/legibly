import type { LanguageConfig } from './types.js'

const python: LanguageConfig = {
  extensions: ['.py'],
  ignorePatterns: [
    '__pycache__',
    '.venv',
    'venv',
    'env',
    'dist',
    'build',
    '*.pyc',
    '*.egg-info',
  ],
  importPatterns: [
    // import foo / import foo.bar
    /^import\s+([\w.]+)/gm,
    // from foo import bar / from .foo import bar
    /^from\s+(\.{0,2}[\w.]*)\s+import/gm,
  ],
}

export default python
