export interface FileEntry {
  path: string       // absolute path
  relativePath: string // relative to source root
  language: string
  size: number       // bytes
  lastModified: Date
}

export type FileMap = FileEntry[]
