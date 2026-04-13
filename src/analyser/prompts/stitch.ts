import type { ChunkAnalysis } from '../types.js'
import type { FileEntry } from '../../crawler/types.js'

/**
 * Compact per-chunk summary sent to the stitch prompt.
 * We don't send full file contents — just structured analysis.
 */
function summariseChunk(c: ChunkAnalysis): object {
  return {
    name: c.name,
    file: c.file,
    summary: c.summary,
    owns: c.owns,
    riskLevel: c.riskLevel,
    riskReason: c.riskReason,
    dependencies: c.dependencies.map((d) => ({ name: d.name, type: d.type, risk: d.risk })),
    failurePoints: c.failurePoints.map((f) => ({ severity: f.severity, description: f.description })),
    implicitAssumptions: c.implicitAssumptions.map((a) => a.assumption),
    biggestConcerns: c.beforeYouTouch.slice(0, 3),
    envVars: c.envVars.map((e) => e.name),
  }
}

export function buildStitchPrompt(chunks: ChunkAnalysis[]): string {
  const summaries = chunks.map(summariseChunk)

  return `You are analysing a complete system made up of ${chunks.length} modules.

Below is structured analysis for each module. Your job is to synthesise a system-level understanding.

## Module Analyses

${JSON.stringify(summaries, null, 2)}

Return a JSON object with EXACTLY this structure:

{
  "systemName": "short name for this system or codebase",
  "whatItDoes": "2-4 sentence plain English description of what the whole system does",
  "services": [
    {
      "name": "module name",
      "file": "entry point file",
      "oneLiner": "one sentence description",
      "riskLevel": "high | medium | low"
    }
  ],
  "criticalPaths": [
    {
      "path": "description of the execution path (e.g. 'HTTP request → auth → payment → DB')",
      "why": "why this path is critical",
      "risk": "high | medium | low"
    }
  ],
  "systemFailurePoints": [
    {
      "severity": "critical | high | medium | low",
      "description": "what can fail at the system level",
      "affectedModules": ["module names affected"]
    }
  ],
  "dependencyGraph": {
    "nodes": [
      { "id": "unique id (use file path)", "label": "module name", "layer": "core_business | infrastructure | api | utility | external" }
    ],
    "edges": [
      { "from": "node id", "to": "node id", "label": "depends on | calls | reads | writes" }
    ]
  },
  "domainGlossary": [
    { "term": "domain term used across the codebase", "meaning": "what it means here" }
  ],
  "onboardingPriority": [
    "ordered list: which modules a new engineer should read first and why"
  ],
  "systemAssumptions": [
    "assumptions the whole system makes that are never validated"
  ],
  "biggestRisks": [
    "top risks to the system, ordered by severity"
  ]
}`
}
