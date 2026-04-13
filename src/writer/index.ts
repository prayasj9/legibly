import fs from 'fs'
import path from 'path'
import type { SystemAnalysis } from '../stitcher/types.js'
import type { Assessment } from '../assessor/types.js'
import { renderOnboarding } from './onboarding.js'
import { renderServiceDoc } from './service.js'
import { renderSpec } from './spec.js'
import { renderRunbook } from './runbook.js'
import { renderRelationshipMap } from './relationship-map.js'
import { renderAssessment } from './assessment.js'
import { renderReposTouched } from './repos-touched.js'
import { renderAliasResolution } from './alias-resolution.js'
import { renderProxyChains } from './proxy-chains.js'
import { buildGraphOutput, buildFreshnessOutput } from './graph.js'
import { loadAnnotations, getAnnotationsForService } from '../annotations/index.js'

export interface WriteOptions {
  outputDir: string
  system: SystemAnalysis
  assessment?: Assessment
}

export interface WrittenFiles {
  onboarding: string
  relationshipMap: string
  reposTouched: string
  aliasResolution: string
  proxyChains: string
  assessment: string | null
  graph: string
  freshness: string
  services: string[]
  specs: string[]
  runbooks: string[]
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function write(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
}

export function writeOutput(options: WriteOptions): WrittenFiles {
  const { outputDir, system, assessment } = options

  fs.mkdirSync(path.join(outputDir, 'services'), { recursive: true })
  fs.mkdirSync(path.join(outputDir, 'specs'), { recursive: true })
  fs.mkdirSync(path.join(outputDir, 'runbooks'), { recursive: true })

  // Top-level docs
  const onboardingPath = path.join(outputDir, 'onboarding.md')
  write(onboardingPath, renderOnboarding(system))

  const mapPath = path.join(outputDir, 'SERVICE_RELATIONSHIP_MAP.md')
  write(mapPath, renderRelationshipMap(system))

  const reposTouchedPath = path.join(outputDir, 'REPOS_TOUCHED.md')
  write(reposTouchedPath, renderReposTouched(system))

  const aliasResolutionPath = path.join(outputDir, 'ALIAS_RESOLUTION.md')
  write(aliasResolutionPath, renderAliasResolution(system))

  const proxyChainPath = path.join(outputDir, 'PROXY_CHAINS.md')
  write(proxyChainPath, renderProxyChains(system))

  // Load annotations so service docs can include team notes
  const annotationStore = loadAnnotations(outputDir)

  let assessmentPath: string | null = null
  if (assessment) {
    assessmentPath = path.join(outputDir, 'AI_READINESS.md')
    write(assessmentPath, renderAssessment(assessment))
  }

  // graph.json
  const graphPath = path.join(outputDir, 'graph.json')
  write(graphPath, JSON.stringify(buildGraphOutput(system), null, 2))

  // Per-service files
  const serviceFiles: string[] = []
  const specFiles: string[] = []
  const runbookFiles: string[] = []

  const aliasMap = new Map(system.aliases.map((a) => [a.canonical, a]))

  for (const chunk of system.chunkAnalyses) {
    const name = slug(chunk.name)
    const aliasEntry = aliasMap.get(chunk.name)

    const annotations = getAnnotationsForService(annotationStore, chunk.name)
    const servicePath = path.join(outputDir, 'services', `${name}.md`)
    write(servicePath, renderServiceDoc(chunk, aliasEntry, annotations))
    serviceFiles.push(servicePath)

    const specPath = path.join(outputDir, 'specs', `${name}.md`)
    write(specPath, renderSpec(chunk))
    specFiles.push(specPath)

    const runbookPath = path.join(outputDir, 'runbooks', `${name}.md`)
    write(runbookPath, renderRunbook(chunk))
    runbookFiles.push(runbookPath)
  }

  // freshness.json — after all files are known
  const allRelativeFiles = [
    'onboarding.md',
    'SERVICE_RELATIONSHIP_MAP.md',
    'REPOS_TOUCHED.md',
    'ALIAS_RESOLUTION.md',
    'PROXY_CHAINS.md',
    ...(assessmentPath != null ? ['AI_READINESS.md'] : []),
    ...serviceFiles.map((f) => path.relative(outputDir, f)),
    ...specFiles.map((f) => path.relative(outputDir, f)),
    ...runbookFiles.map((f) => path.relative(outputDir, f)),
  ]

  const freshnessPath = path.join(outputDir, 'freshness.json')
  write(freshnessPath, JSON.stringify(buildFreshnessOutput(system, allRelativeFiles), null, 2))

  return {
    onboarding: onboardingPath,
    relationshipMap: mapPath,
    reposTouched: reposTouchedPath,
    aliasResolution: aliasResolutionPath,
    proxyChains: proxyChainPath,
    assessment: assessmentPath,
    graph: graphPath,
    freshness: freshnessPath,
    services: serviceFiles,
    specs: specFiles,
    runbooks: runbookFiles,
  }
}
