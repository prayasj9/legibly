import fs from 'fs'
import path from 'path'
import type { ChunkAnalysis } from '../analyser/types.js'
import type { CheckpointState, LoadedCheckpoint } from './types.js'

export type { CheckpointState, LoadedCheckpoint, CheckpointStatus } from './types.js'

const STATE_FILE = 'state.json'
const CHUNKS_DIR = 'chunks'

function statePath(cacheDir: string): string {
  return path.join(cacheDir, STATE_FILE)
}

function chunkPath(cacheDir: string, chunkId: string): string {
  return path.join(cacheDir, CHUNKS_DIR, `${chunkId}.json`)
}

function now(): string {
  return new Date().toISOString()
}

/**
 * Creates a fresh checkpoint. Overwrites any existing one.
 */
export function initCheckpoint(totalChunks: number, cacheDir: string): CheckpointState {
  fs.mkdirSync(path.join(cacheDir, CHUNKS_DIR), { recursive: true })

  const state: CheckpointState = {
    status: 'in_progress',
    totalChunks,
    completedChunkIds: [],
    startedAt: now(),
    updatedAt: now(),
  }

  fs.writeFileSync(statePath(cacheDir), JSON.stringify(state, null, 2))
  return state
}

/**
 * Saves a single chunk result and updates the state file.
 */
export function saveChunk(
  chunkId: string,
  analysis: ChunkAnalysis,
  cacheDir: string
): void {
  fs.writeFileSync(chunkPath(cacheDir, chunkId), JSON.stringify(analysis, null, 2))

  const state = readState(cacheDir)
  if (!state.completedChunkIds.includes(chunkId)) {
    state.completedChunkIds.push(chunkId)
  }
  state.updatedAt = now()

  if (state.completedChunkIds.length >= state.totalChunks) {
    state.status = 'complete'
  }

  fs.writeFileSync(statePath(cacheDir), JSON.stringify(state, null, 2))
}

/**
 * Marks the run as complete regardless of chunk count (e.g. after stitching).
 */
export function completeCheckpoint(cacheDir: string): void {
  const state = readState(cacheDir)
  state.status = 'complete'
  state.updatedAt = now()
  fs.writeFileSync(statePath(cacheDir), JSON.stringify(state, null, 2))
}

/**
 * Loads state + all persisted chunk results.
 */
export function loadCheckpoint(cacheDir: string): LoadedCheckpoint {
  const state = readState(cacheDir)
  const results = new Map<string, ChunkAnalysis>()

  for (const chunkId of state.completedChunkIds) {
    const p = chunkPath(cacheDir, chunkId)
    try {
      const raw = fs.readFileSync(p, 'utf-8')
      results.set(chunkId, JSON.parse(raw) as ChunkAnalysis)
    } catch {
      // Chunk file missing or corrupt — treat as not completed
    }
  }

  // Re-sync: only count chunks whose files were actually loaded
  state.completedChunkIds = [...results.keys()]

  return { state, results }
}

/**
 * Returns true when an in_progress checkpoint exists.
 */
export function hasCheckpoint(cacheDir: string): boolean {
  try {
    const state = readState(cacheDir)
    return state.status === 'in_progress' && state.completedChunkIds.length > 0
  } catch {
    return false
  }
}

/**
 * Deletes the entire cache directory.
 */
export function clearCheckpoint(cacheDir: string): void {
  fs.rmSync(cacheDir, { recursive: true, force: true })
}

function readState(cacheDir: string): CheckpointState {
  const raw = fs.readFileSync(statePath(cacheDir), 'utf-8')
  return JSON.parse(raw) as CheckpointState
}
