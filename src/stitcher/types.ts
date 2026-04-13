import type { ChunkAnalysis } from '../analyser/types.js'

export interface ServiceSummary {
  name: string
  file: string
  oneLiner: string
  riskLevel: 'high' | 'medium' | 'low'
}

export interface CriticalPath {
  path: string
  why: string
  risk: 'high' | 'medium' | 'low'
}

export interface SystemFailurePoint {
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  affectedModules: string[]
}

export interface GraphNode {
  id: string
  label: string
  layer: string
}

export interface GraphEdge {
  from: string
  to: string
  label: string
}

export interface AliasEntry {
  canonical: string
  file: string
  aliases: string[]
  dependents: number
  classification: 'core' | 'supporting' | 'utility' | 'unknown'
}

export interface SystemAnalysis {
  systemName: string
  whatItDoes: string
  services: ServiceSummary[]
  criticalPaths: CriticalPath[]
  systemFailurePoints: SystemFailurePoint[]
  dependencyGraph: { nodes: GraphNode[]; edges: GraphEdge[] }
  domainGlossary: Array<{ term: string; meaning: string }>
  onboardingPriority: string[]
  systemAssumptions: string[]
  biggestRisks: string[]
  /** Populated by the alias dedup pass — not from the AI response */
  aliases: AliasEntry[]
  /** All individual chunk analyses that fed into this */
  chunkAnalyses: ChunkAnalysis[]
}
