import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import path from 'path'
import os from 'os'
import { walk } from '../walker.js'
import { REGISTRY } from '../languages/index.js'

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `legibly-walker-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function touch(filePath: string, content = ''): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
}

describe('walk', () => {
  let src: string

  beforeEach(() => {
    src = makeTmpDir()
  })

  afterEach(() => {
    rmSync(src, { recursive: true, force: true })
  })

  it('returns files matching language extensions', () => {
    touch(path.join(src, 'index.js'))
    touch(path.join(src, 'app.ts'))
    touch(path.join(src, 'README.md'))

    const files = walk({ source: src, configs: REGISTRY })
    const names = files.map((f) => path.basename(f.path))

    expect(names).toContain('index.js')
    expect(names).toContain('app.ts')
    expect(names).not.toContain('README.md')
  })

  it('recurses into subdirectories', () => {
    touch(path.join(src, 'services/payment.ts'))
    touch(path.join(src, 'utils/helpers.js'))

    const files = walk({ source: src, configs: REGISTRY })
    const relatives = files.map((f) => f.relativePath)

    expect(relatives).toContain(path.join('services', 'payment.ts'))
    expect(relatives).toContain(path.join('utils', 'helpers.js'))
  })

  it('skips directories matching ignore patterns', () => {
    touch(path.join(src, 'node_modules/express/index.js'))
    touch(path.join(src, 'src/app.js'))

    const files = walk({ source: src, configs: REGISTRY })
    const relatives = files.map((f) => f.relativePath)

    expect(relatives).not.toContain(path.join('node_modules', 'express', 'index.js'))
    expect(relatives).toContain(path.join('src', 'app.js'))
  })

  it('applies extraIgnore patterns from config', () => {
    touch(path.join(src, 'src/app.js'))
    touch(path.join(src, 'src/app.test.js'))

    const files = walk({ source: src, configs: REGISTRY, extraIgnore: ['*.test.js'] })
    const names = files.map((f) => path.basename(f.path))

    expect(names).toContain('app.js')
    expect(names).not.toContain('app.test.js')
  })

  it('populates FileEntry fields correctly', () => {
    touch(path.join(src, 'server.ts'), 'console.log("hello")')

    const files = walk({ source: src, configs: REGISTRY })
    expect(files).toHaveLength(1)

    const entry = files[0]
    expect(entry.language).toBe('typescript')
    expect(entry.size).toBeGreaterThan(0)
    expect(entry.lastModified).toBeInstanceOf(Date)
    expect(entry.relativePath).toBe('server.ts')
    expect(path.isAbsolute(entry.path)).toBe(true)
  })

  it('returns empty array for empty directory', () => {
    const files = walk({ source: src, configs: REGISTRY })
    expect(files).toHaveLength(0)
  })

  it('skips .d.ts files via typescript ignorePatterns', () => {
    touch(path.join(src, 'src/types.d.ts'))
    touch(path.join(src, 'src/app.ts'))

    const files = walk({ source: src, configs: REGISTRY })
    const names = files.map((f) => path.basename(f.path))

    expect(names).not.toContain('types.d.ts')
    expect(names).toContain('app.ts')
  })
})
