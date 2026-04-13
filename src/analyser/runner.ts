import {
  initCheckpoint,
  saveChunk,
  loadCheckpoint,
  hasCheckpoint,
  completeCheckpoint,
} from '../checkpoint/index.js'
import { analyseChunk } from './index.js'
import type { Chunk } from '../chunker/types.js'
import type { LegiblyConfig } from '../config/index.js'
import type { ChunkAnalysis } from './types.js'

export interface RunnerOptions {
  chunks: Chunk[]
  config: LegiblyConfig
  cacheDir: string
  /** Called after each chunk completes (success or skip). */
  onProgress?: (completed: number, total: number, chunkId: string) => void
  /** Called when a chunk fails after retries. The run continues. */
  onError?: (chunkId: string, error: Error) => void
}

export interface RunnerResult {
  results: Map<string, ChunkAnalysis>
  /** Chunk ids that failed after retries and were skipped. */
  failed: string[]
}

const RETRY_LIMIT = 1

async function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let lastError: Error = new Error('unknown')
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e as Error
    }
  }
  throw lastError
}

/**
 * Runs a pool of at most `concurrency` promises in parallel.
 * Resolves once all tasks are settled.
 */
async function pool<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<Array<{ status: 'fulfilled'; value: T } | { status: 'rejected'; reason: Error }>> {
  const results: Array<{ status: 'fulfilled'; value: T } | { status: 'rejected'; reason: Error }> =
    []
  let index = 0

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++
      try {
        const value = await tasks[i]()
        results[i] = { status: 'fulfilled', value }
      } catch (e) {
        results[i] = { status: 'rejected', reason: e as Error }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  await Promise.all(workers)
  return results
}

export async function runChunks(options: RunnerOptions): Promise<RunnerResult> {
  const { chunks, config, cacheDir, onProgress, onError } = options
  const concurrency = config.concurrency ?? 3

  // Determine which chunks still need processing
  let pending = chunks
  const completed = new Map<string, ChunkAnalysis>()
  const failed: string[] = []

  if (hasCheckpoint(cacheDir)) {
    const { results: saved } = loadCheckpoint(cacheDir)
    for (const [id, analysis] of saved) {
      completed.set(id, analysis)
    }
    pending = chunks.filter((c) => !completed.has(c.id))
  } else {
    initCheckpoint(chunks.length, cacheDir)
  }

  let doneCount = completed.size

  const tasks = pending.map((chunk) => async () => {
    const analysis = await withRetry(() => analyseChunk(chunk, config), RETRY_LIMIT)
    saveChunk(chunk.id, analysis, cacheDir)
    completed.set(chunk.id, analysis)
    doneCount++
    onProgress?.(doneCount, chunks.length, chunk.id)
    return { id: chunk.id, analysis }
  })

  const settlements = await pool(tasks, concurrency)

  // Collect failures
  for (let i = 0; i < settlements.length; i++) {
    const s = settlements[i]
    if (s.status === 'rejected') {
      const chunkId = pending[i].id
      failed.push(chunkId)
      onError?.(chunkId, s.reason)
    }
  }

  completeCheckpoint(cacheDir)

  return { results: completed, failed }
}
