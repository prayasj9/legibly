import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import path from 'path'
import os from 'os'
import { readFileSync, writeFileSync } from 'fs'
import {
  initCheckpoint,
  saveChunk,
  loadCheckpoint,
  hasCheckpoint,
  clearCheckpoint,
  completeCheckpoint,
} from '../index.js'
import type { ChunkAnalysis } from '../../analyser/types.js'

function makeCacheDir(): string {
  const dir = path.join(os.tmpdir(), `legibly-cp-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeAnalysis(name: string): ChunkAnalysis {
  return {
    name,
    file: `src/${name}.ts`,
    summary: 'test',
    owns: [],
    doesNotOwn: [],
    dependencies: [],
    usedBy: [],
    publicInterface: [],
    failurePoints: [],
    implicitAssumptions: [],
    envVars: [],
    domainLanguage: [],
    riskLevel: 'low',
    riskReason: 'test',
    beforeYouTouch: [],
    missingThings: [],
    todos: [],
  }
}

describe('checkpoint system', () => {
  let cacheDir: string

  beforeEach(() => { cacheDir = makeCacheDir() })
  afterEach(() => { rmSync(cacheDir, { recursive: true, force: true }) })

  describe('initCheckpoint', () => {
    it('creates state with in_progress status', () => {
      const state = initCheckpoint(10, cacheDir)
      expect(state.status).toBe('in_progress')
      expect(state.totalChunks).toBe(10)
      expect(state.completedChunkIds).toHaveLength(0)
    })

    it('sets startedAt and updatedAt as ISO strings', () => {
      const state = initCheckpoint(5, cacheDir)
      expect(() => new Date(state.startedAt)).not.toThrow()
      expect(() => new Date(state.updatedAt)).not.toThrow()
    })

    it('overwrites an existing checkpoint', () => {
      initCheckpoint(5, cacheDir)
      saveChunk('chunk-001', makeAnalysis('a'), cacheDir)
      initCheckpoint(3, cacheDir)
      const { state } = loadCheckpoint(cacheDir)
      expect(state.totalChunks).toBe(3)
      expect(state.completedChunkIds).toHaveLength(0)
    })
  })

  describe('saveChunk / loadCheckpoint', () => {
    it('persists a chunk and reflects it in loaded state', () => {
      initCheckpoint(3, cacheDir)
      saveChunk('chunk-001', makeAnalysis('payment'), cacheDir)

      const { state, results } = loadCheckpoint(cacheDir)
      expect(state.completedChunkIds).toContain('chunk-001')
      expect(results.get('chunk-001')?.name).toBe('payment')
    })

    it('does not duplicate a chunk id saved twice', () => {
      initCheckpoint(3, cacheDir)
      saveChunk('chunk-001', makeAnalysis('payment'), cacheDir)
      saveChunk('chunk-001', makeAnalysis('payment'), cacheDir)

      const { state } = loadCheckpoint(cacheDir)
      const count = state.completedChunkIds.filter((id) => id === 'chunk-001').length
      expect(count).toBe(1)
    })

    it('automatically sets status to complete when all chunks saved', () => {
      initCheckpoint(2, cacheDir)
      saveChunk('chunk-001', makeAnalysis('a'), cacheDir)
      saveChunk('chunk-002', makeAnalysis('b'), cacheDir)

      const { state } = loadCheckpoint(cacheDir)
      expect(state.status).toBe('complete')
    })

    it('loads multiple chunk results correctly', () => {
      initCheckpoint(3, cacheDir)
      saveChunk('chunk-001', makeAnalysis('auth'), cacheDir)
      saveChunk('chunk-002', makeAnalysis('payment'), cacheDir)

      const { results } = loadCheckpoint(cacheDir)
      expect(results.size).toBe(2)
      expect(results.get('chunk-002')?.name).toBe('payment')
    })
  })

  describe('hasCheckpoint', () => {
    it('returns false when no cache dir exists', () => {
      expect(hasCheckpoint(path.join(os.tmpdir(), 'nonexistent-dir'))).toBe(false)
    })

    it('returns false after init but before any chunks saved', () => {
      initCheckpoint(5, cacheDir)
      expect(hasCheckpoint(cacheDir)).toBe(false)
    })

    it('returns true once a chunk is saved', () => {
      initCheckpoint(5, cacheDir)
      saveChunk('chunk-001', makeAnalysis('a'), cacheDir)
      expect(hasCheckpoint(cacheDir)).toBe(true)
    })

    it('returns false after run is complete', () => {
      initCheckpoint(1, cacheDir)
      saveChunk('chunk-001', makeAnalysis('a'), cacheDir)
      // status auto-completes at 1/1
      expect(hasCheckpoint(cacheDir)).toBe(false)
    })
  })

  describe('completeCheckpoint', () => {
    it('marks an in_progress run as complete', () => {
      initCheckpoint(5, cacheDir)
      saveChunk('chunk-001', makeAnalysis('a'), cacheDir)
      completeCheckpoint(cacheDir)

      const { state } = loadCheckpoint(cacheDir)
      expect(state.status).toBe('complete')
    })
  })

  describe('clearCheckpoint', () => {
    it('removes the cache directory', () => {
      initCheckpoint(3, cacheDir)
      clearCheckpoint(cacheDir)
      expect(hasCheckpoint(cacheDir)).toBe(false)
    })

    it('does not throw if cache dir does not exist', () => {
      expect(() => clearCheckpoint(path.join(os.tmpdir(), 'no-such-dir'))).not.toThrow()
    })
  })

  describe('loadCheckpoint resilience', () => {
    it('skips chunk files that are missing from disk and re-syncs completedChunkIds', () => {
      initCheckpoint(3, cacheDir)
      saveChunk('chunk-001', makeAnalysis('a'), cacheDir)
      saveChunk('chunk-002', makeAnalysis('b'), cacheDir)

      // Manually corrupt state to reference a chunk with no file
      const stateFile = path.join(cacheDir, 'state.json')
      const state = JSON.parse(readFileSync(stateFile, 'utf-8'))
      state.completedChunkIds.push('chunk-ghost')
      writeFileSync(stateFile, JSON.stringify(state))

      const { results, state: loaded } = loadCheckpoint(cacheDir)
      expect(results.size).toBe(2)
      expect(loaded.completedChunkIds).not.toContain('chunk-ghost')
    })
  })
})
