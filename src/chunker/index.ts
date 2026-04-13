import { buildGraph } from './graph.js'
import { groupIntoChunks } from './grouper.js'
import { REGISTRY } from '../crawler/languages/index.js'
import type { FileMap } from '../crawler/types.js'
import type { Chunk } from './types.js'

export type { Chunk } from './types.js'
export { buildGraph } from './graph.js'

export function chunk(fileMap: FileMap): Chunk[] {
  const graph = buildGraph(fileMap, REGISTRY)
  return groupIntoChunks(fileMap, graph)
}
