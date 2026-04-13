import { walk } from './walker.js'
import { REGISTRY } from './languages/index.js'
import { getLanguageConfig } from './languages/index.js'
import type { FileMap } from './types.js'
import type { LegiblyConfig } from '../config/index.js'

export type { FileMap, FileEntry } from './types.js'

export function crawl(config: LegiblyConfig): FileMap {
  // When a specific language is set, validate it exists before touching the filesystem
  if (config.language !== 'auto') {
    getLanguageConfig(config.language)
  }

  return walk({
    source: config.source,
    configs: REGISTRY,
    extraIgnore: config.ignore,
  })
}
