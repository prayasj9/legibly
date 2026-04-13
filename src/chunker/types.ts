import type { FileEntry } from '../crawler/types.js'

export interface Chunk {
  id: string
  files: FileEntry[]
  entryPoint: string    // path of the most-imported file in the chunk
  externalDeps: string[] // external package names referenced by files in this chunk
}
