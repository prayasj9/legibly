import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import path from 'path'
import os from 'os'
import { assess, LEVELS } from '../index.js'

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `legibly-assess-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function write(root: string, rel: string, content: string): void {
  const full = path.join(root, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
}

describe('assess', () => {
  let root: string

  beforeEach(() => { root = makeTmpDir() })
  afterEach(() => { rmSync(root, { recursive: true, force: true }) })

  it('returns an assessment with all 6 dimensions', () => {
    const result = assess(root)
    const names = result.dimensions.map((d) => d.name)
    expect(names).toContain('Test Coverage')
    expect(names).toContain('Security')
    expect(names).toContain('CI/CD')
    expect(names).toContain('Documentation')
    expect(names).toContain('Technical Debt')
    expect(names).toContain('Type Safety')
  })

  it('overall score is at most the average of dimension scores', () => {
    // Hard blockers may cap the score below the raw average
    const result = assess(root)
    const avg = result.dimensions.reduce((s, d) => s + d.score, 0) / result.dimensions.length
    expect(result.overallScore).toBeLessThanOrEqual(avg + 0.01)
  })

  it('returns hardBlockers, safeForAI, requiresReview, avoidAI arrays', () => {
    const result = assess(root)
    expect(Array.isArray(result.hardBlockers)).toBe(true)
    expect(Array.isArray(result.safeForAI)).toBe(true)
    expect(Array.isArray(result.requiresReview)).toBe(true)
    expect(Array.isArray(result.avoidAI)).toBe(true)
  })

  it('hard blockers cap the level when there are no tests', () => {
    // empty dir has no tests → hard blocker → score capped at Eco
    const result = assess(root)
    expect(result.hardBlockers.length).toBeGreaterThan(0)
    expect(result.level.number).toBeLessThanOrEqual(2)
  })

  it('score is in range 0–4', () => {
    const result = assess(root)
    expect(result.overallScore).toBeGreaterThanOrEqual(0)
    expect(result.overallScore).toBeLessThanOrEqual(4)
    for (const d of result.dimensions) {
      expect(d.score).toBeGreaterThanOrEqual(0)
      expect(d.score).toBeLessThanOrEqual(4)
    }
  })

  it('resolves to a valid level', () => {
    const result = assess(root)
    const validNames = LEVELS.map((l) => l.name)
    expect(validNames).toContain(result.level.name)
  })

  it('nextLevel is null at Autonomous', () => {
    // Impossible to actually reach Autonomous in a tmp dir, so test the type
    const result = assess(root)
    if (result.level.name === 'Autonomous') {
      expect(result.nextLevel).toBeNull()
    } else {
      expect(result.nextLevel).not.toBeNull()
    }
  })

  it('toNextLevel returns actionable strings', () => {
    const result = assess(root)
    expect(result.toNextLevel.length).toBeGreaterThan(0)
    for (const action of result.toNextLevel) {
      expect(typeof action).toBe('string')
      expect(action.length).toBeGreaterThan(0)
    }
  })

  describe('Test Coverage dimension', () => {
    it('scores 0 with no test files', () => {
      write(root, 'src/app.ts', 'export const x = 1')
      const { dimensions } = assess(root)
      const d = dimensions.find((d) => d.name === 'Test Coverage')!
      expect(d.score).toBe(0)
      expect(d.gaps.some((g) => /No test files/.test(g))).toBe(true)
    })

    it('scores above 0 when test files exist', () => {
      write(root, 'src/app.ts', 'export const x = 1')
      write(root, 'src/app.test.ts', 'test("x", () => {})')
      const { dimensions } = assess(root)
      const d = dimensions.find((d) => d.name === 'Test Coverage')!
      expect(d.score).toBeGreaterThan(0)
    })
  })

  describe('Security dimension', () => {
    it('penalises hardcoded secrets', () => {
      write(root, 'src/config.ts', `const apiKey = 'sk-supersecretkey1234567890'`)
      const { dimensions } = assess(root)
      const d = dimensions.find((d) => d.name === 'Security')!
      expect(d.gaps.some((g) => /hardcoded secret|potential/.test(g))).toBe(true)
    })

    it('rewards dependabot config', () => {
      write(root, '.github/dependabot.yml', 'version: 2\nupdates: []')
      const { dimensions } = assess(root)
      const d = dimensions.find((d) => d.name === 'Security')!
      expect(d.signals.some((s) => /Dependabot/.test(s))).toBe(true)
    })
  })

  describe('CI/CD dimension', () => {
    it('scores 0 with no CI config', () => {
      const { dimensions } = assess(root)
      const d = dimensions.find((d) => d.name === 'CI/CD')!
      expect(d.score).toBe(0)
    })

    it('scores above 1 with a GitHub Actions workflow', () => {
      write(root, '.github/workflows/ci.yml', `
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
      - run: npm run lint
      - run: npm run build
`)
      const { dimensions } = assess(root)
      const d = dimensions.find((d) => d.name === 'CI/CD')!
      expect(d.score).toBeGreaterThan(1)
    })
  })

  describe('Documentation dimension', () => {
    it('rewards README.md', () => {
      write(root, 'README.md', 'A'.repeat(600))
      const { dimensions } = assess(root)
      const d = dimensions.find((d) => d.name === 'Documentation')!
      expect(d.signals.some((s) => /README/.test(s))).toBe(true)
    })

    it('rewards CLAUDE.md', () => {
      write(root, 'CLAUDE.md', 'System context for AI agents')
      const { dimensions } = assess(root)
      const d = dimensions.find((d) => d.name === 'Documentation')!
      expect(d.signals.some((s) => /CLAUDE\.md/.test(s))).toBe(true)
    })
  })

  describe('Technical Debt dimension', () => {
    it('penalises many TODOs', () => {
      const todos = Array(55).fill('// TODO: fix this\n').join('')
      write(root, 'src/app.ts', todos)
      const { dimensions } = assess(root)
      const d = dimensions.find((d) => d.name === 'Technical Debt')!
      expect(d.score).toBeLessThan(4)
      expect(d.gaps.length).toBeGreaterThan(0)
    })

    it('starts near 4 with clean files', () => {
      write(root, 'src/app.ts', 'export const x = 1')
      const { dimensions } = assess(root)
      const d = dimensions.find((d) => d.name === 'Technical Debt')!
      expect(d.score).toBeGreaterThanOrEqual(3)
    })
  })

  describe('Type Safety dimension', () => {
    it('gives neutral score for non-TS project', () => {
      write(root, 'app.py', 'def main(): pass')
      const { dimensions } = assess(root)
      const d = dimensions.find((d) => d.name === 'Type Safety')!
      expect(d.score).toBe(2)
    })

    it('rewards strict tsconfig', () => {
      write(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { strict: true } }))
      write(root, 'src/app.ts', 'export const x: number = 1')
      const { dimensions } = assess(root)
      const d = dimensions.find((d) => d.name === 'Type Safety')!
      expect(d.signals.some((s) => /strict/.test(s))).toBe(true)
    })

    it('penalises @ts-ignore usage', () => {
      write(root, 'tsconfig.json', '{}')
      write(root, 'src/app.ts', Array(10).fill('// @ts-ignore\nconst x = 1').join('\n'))
      const { dimensions } = assess(root)
      const d = dimensions.find((d) => d.name === 'Type Safety')!
      expect(d.gaps.some((g) => /@ts-ignore/.test(g))).toBe(true)
    })
  })
})
