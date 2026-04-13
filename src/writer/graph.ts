import type { SystemAnalysis } from '../stitcher/types.js'

export interface GraphOutput {
  generatedAt: string
  systemName: string
  services: Array<{
    canonical: string
    file: string
    aliases: string[]
    layer: string
    dependents: number
    classification: string
    riskLevel: string
  }>
  nodes: SystemAnalysis['dependencyGraph']['nodes']
  edges: SystemAnalysis['dependencyGraph']['edges']
}

export interface FreshnessOutput {
  generatedAt: string
  systemName: string
  files: Array<{
    file: string
    service: string
    generatedAt: string
  }>
}

export function buildGraphOutput(system: SystemAnalysis): GraphOutput {
  const nodeLayerMap = new Map(
    system.dependencyGraph.nodes.map((n) => [n.id, n.layer])
  )

  const serviceRiskMap = new Map(
    system.services.map((s) => [s.name, s.riskLevel])
  )

  return {
    generatedAt: new Date().toISOString(),
    systemName: system.systemName,
    services: system.aliases.map((a) => ({
      canonical: a.canonical,
      file: a.file,
      aliases: a.aliases,
      layer: nodeLayerMap.get(a.file) ?? 'unknown',
      dependents: a.dependents,
      classification: a.classification,
      riskLevel: serviceRiskMap.get(a.canonical) ?? 'unknown',
    })),
    nodes: system.dependencyGraph.nodes,
    edges: system.dependencyGraph.edges,
  }
}

export function buildFreshnessOutput(
  system: SystemAnalysis,
  outputFiles: string[]
): FreshnessOutput {
  const now = new Date().toISOString()

  // Map output file names back to services where possible
  const serviceByFile = new Map(system.chunkAnalyses.map((c) => [c.file, c.name]))

  return {
    generatedAt: now,
    systemName: system.systemName,
    files: outputFiles.map((f) => {
      const baseName = f.replace(/\.md$/, '')
      const matchingAnalysis = system.chunkAnalyses.find((c) =>
        c.file.includes(baseName) || c.name.toLowerCase().replace(/\s+/g, '-') === baseName
      )
      return {
        file: f,
        service: matchingAnalysis?.name ?? serviceByFile.get(f) ?? 'unknown',
        generatedAt: now,
      }
    }),
  }
}
