import type { ChunkAnalysis } from '../analyser/types.js'

export type CheckpointStatus = 'in_progress' | 'complete'

export interface CheckpointState {
  status: CheckpointStatus
  totalChunks: number
  completedChunkIds: string[]
  startedAt: string   // ISO 8601
  updatedAt: string   // ISO 8601
}

export interface LoadedCheckpoint {
  state: CheckpointState
  /** Analyses already completed, keyed by chunk id */
  results: Map<string, ChunkAnalysis>
}
