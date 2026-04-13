import fs from 'fs'
import path from 'path'

export interface Annotation {
  service: string   // canonical service name (partial match supported)
  note: string
  author?: string
  date: string      // ISO date string
}

export interface AnnotationStore {
  version: 1
  entries: Annotation[]
}

function annotationsPath(outputDir: string): string {
  return path.join(outputDir, 'annotations.json')
}

export function loadAnnotations(outputDir: string): AnnotationStore {
  const p = annotationsPath(outputDir)
  try {
    const raw = fs.readFileSync(p, 'utf-8')
    return JSON.parse(raw) as AnnotationStore
  } catch {
    return { version: 1, entries: [] }
  }
}

export function saveAnnotations(outputDir: string, store: AnnotationStore): void {
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(annotationsPath(outputDir), JSON.stringify(store, null, 2), 'utf-8')
}

export function addAnnotation(
  outputDir: string,
  service: string,
  note: string,
  author?: string
): Annotation {
  const store = loadAnnotations(outputDir)
  const entry: Annotation = {
    service,
    note,
    ...(author ? { author } : {}),
    date: new Date().toISOString().slice(0, 10),
  }
  store.entries.push(entry)
  saveAnnotations(outputDir, store)
  return entry
}

/** Return all annotations whose service name matches (case-insensitive, partial). */
export function getAnnotationsForService(store: AnnotationStore, serviceName: string): Annotation[] {
  const lower = serviceName.toLowerCase()
  return store.entries.filter((e) => e.service.toLowerCase().includes(lower) || lower.includes(e.service.toLowerCase()))
}
