import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import path from 'path'
import os from 'os'

// Stub analyseChunk before importing runner
vi.mock('../index.js', () => ({
  analyseChunk: vi.fn(),
}))

import { analyseChunk } from '../index.js'
import { runChunks } from '../runner.js'
import { initCheckpoint, saveChunk } from '../../checkpoint/index.js'
import type { Chunk } from '../../chunker/types.js'
import type { LegiblyConfig } from '../../config/index.js'
import type { ChunkAnalysis } from '../types.js'
import type { FileEntry } from '../../crawler/types.js'

const mockedAnalyse = vi.mocked(analyseChunk)

function makeCacheDir(): string {
  const dir = path.join(os.tmpdir(), `legibly-runner-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeChunk(id: string): Chunk {
  return {
    id,
    files: [{ path: `/src/${id}.ts`, relativePath: `${id}.ts`, language: 'typescript', size: 100, lastModified: new Date() } as FileEntry],
    entryPoint: `/src/${id}.ts`,
    externalDeps: [],
  }
}

function makeAnalysis(name: string): ChunkAnalysis {
  return {
    name, file: `src/${name}.ts`, summary: 'test', owns: [], doesNotOwn: [],
    dependencies: [], usedBy: [], publicInterface: [], failurePoints: [],
    implicitAssumptions: [], envVars: [], domainLanguage: [],
    riskLevel: 'low', riskReason: 'ok', beforeYouTouch: [], missingThings: [], todos: [],
  }
}

const BASE_CONFIG: LegiblyConfig = {
  source: '/src', ignore: [], language: 'typescript', provider: 'anthropic',
  apiKey: 'sk-test', concurrency: 3, output: '/out',
}

describe('runChunks', () => {
  let cacheDir: string

  beforeEach(() => {
    cacheDir = makeCacheDir()
    mockedAnalyse.mockReset()
  })

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true })
  })

  it('analyses all chunks and returns results', async () => {
    const chunks = [makeChunk('chunk-001'), makeChunk('chunk-002')]
    mockedAnalyse
      .mockResolvedValueOnce(makeAnalysis('a'))
      .mockResolvedValueOnce(makeAnalysis('b'))

    const { results, failed } = await runChunks({ chunks, config: BASE_CONFIG, cacheDir })

    expect(results.size).toBe(2)
    expect(failed).toHaveLength(0)
    expect(mockedAnalyse).toHaveBeenCalledTimes(2)
  })

  it('calls onProgress for each completed chunk', async () => {
    const chunks = [makeChunk('chunk-001'), makeChunk('chunk-002')]
    mockedAnalyse.mockResolvedValue(makeAnalysis('x'))

    const progress: Array<[number, number, string]> = []
    await runChunks({
      chunks, config: BASE_CONFIG, cacheDir,
      onProgress: (done, total, id) => progress.push([done, total, id]),
    })

    expect(progress).toHaveLength(2)
    expect(progress[0][1]).toBe(2) // total always 2
  })

  it('skips already-completed chunks on resume', async () => {
    const chunks = [makeChunk('chunk-001'), makeChunk('chunk-002'), makeChunk('chunk-003')]

    // Pre-populate checkpoint with chunk-001 already done
    initCheckpoint(3, cacheDir)
    saveChunk('chunk-001', makeAnalysis('pre'), cacheDir)

    mockedAnalyse.mockResolvedValue(makeAnalysis('new'))

    const { results } = await runChunks({ chunks, config: BASE_CONFIG, cacheDir })

    // analyseChunk should only be called for the 2 remaining chunks
    expect(mockedAnalyse).toHaveBeenCalledTimes(2)
    expect(results.size).toBe(3)
    expect(results.get('chunk-001')?.name).toBe('pre')
  })

  it('records failed chunks and continues the run', async () => {
    const chunks = [makeChunk('chunk-001'), makeChunk('chunk-002')]
    mockedAnalyse
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValueOnce(makeAnalysis('b'))

    const errors: string[] = []
    const { results, failed } = await runChunks({
      chunks, config: BASE_CONFIG, cacheDir,
      onError: (id) => errors.push(id),
    })

    expect(failed).toContain('chunk-001')
    expect(results.has('chunk-002')).toBe(true)
    expect(errors).toContain('chunk-001')
  })

  it('retries a failing chunk once before giving up', async () => {
    const chunks = [makeChunk('chunk-001')]
    mockedAnalyse
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValueOnce(makeAnalysis('recovered'))

    const { results, failed } = await runChunks({ chunks, config: BASE_CONFIG, cacheDir })

    expect(failed).toHaveLength(0)
    expect(results.get('chunk-001')?.name).toBe('recovered')
    expect(mockedAnalyse).toHaveBeenCalledTimes(2)
  })

  it('respects concurrency — never exceeds config.concurrency in-flight', async () => {
    const N = 6
    const chunks = Array.from({ length: N }, (_, i) => makeChunk(`chunk-00${i + 1}`))

    let inFlight = 0
    let maxInFlight = 0

    mockedAnalyse.mockImplementation(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 10))
      inFlight--
      return makeAnalysis('x')
    })

    await runChunks({ chunks, config: { ...BASE_CONFIG, concurrency: 2 }, cacheDir })

    expect(maxInFlight).toBeLessThanOrEqual(2)
  })

  it('handles an empty chunk list', async () => {
    const { results, failed } = await runChunks({ chunks: [], config: BASE_CONFIG, cacheDir })
    expect(results.size).toBe(0)
    expect(failed).toHaveLength(0)
    expect(mockedAnalyse).not.toHaveBeenCalled()
  })
})
