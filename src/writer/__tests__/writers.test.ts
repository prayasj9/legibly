import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs'
import path from 'path'
import os from 'os'
import { renderOnboarding } from '../onboarding.js'
import { renderServiceDoc } from '../service.js'
import { renderSpec } from '../spec.js'
import { renderRunbook } from '../runbook.js'
import { renderCodebaseMap } from '../codebase-map.js'
import { renderAssessment } from '../assessment.js'
import { buildGraphOutput, buildFreshnessOutput } from '../graph.js'
import { writeOutput } from '../index.js'
import type { SystemAnalysis } from '../../stitcher/types.js'
import type { ChunkAnalysis } from '../../analyser/types.js'
import type { Assessment } from '../../assessor/types.js'
import type { AliasEntry } from '../../stitcher/types.js'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeChunk(name: string): ChunkAnalysis {
  return {
    name, file: `src/${name.toLowerCase()}.ts`, summary: `${name} handles core operations.`,
    owns: ['processing', 'validation'], doesNotOwn: ['notifications'],
    dependencies: [
      { name: 'Database', type: 'database', why: 'persistence', risk: 'high' },
      { name: 'express', type: 'external', why: 'http', risk: 'low' },
    ],
    usedBy: [{ file: 'src/api.ts', function: 'processRequest', context: 'main request handler' }],
    publicInterface: [{ function: 'process(input: Input): Result', returns: 'Result', notes: 'throws on invalid input' }],
    failurePoints: [
      { severity: 'critical', description: 'DB connection lost', location: 'line 42', consequence: 'all requests fail' },
      { severity: 'low', description: 'Slow query', location: 'line 88', consequence: 'timeout' },
    ],
    implicitAssumptions: [
      { assumption: 'DB is always available', consequence: 'unhandled crash', validated: false },
    ],
    envVars: [
      { name: 'DATABASE_URL', required: true, default: null, validatedOnStartup: false, notes: 'postgres connection string' },
    ],
    domainLanguage: [{ term: 'Widget', meaning: 'a unit of work in this system' }],
    riskLevel: 'high', riskReason: 'touches the database directly',
    beforeYouTouch: ['Read the DB migration docs', 'Check for active transactions'],
    missingThings: [{ what: 'Retry logic', impact: 'transient failures cause data loss' }],
    todos: [{ location: 'src/payment.ts:55', comment: 'TODO: add idempotency key', age: '3 months' }],
  }
}

function makeAlias(name: string, dependents = 3): AliasEntry {
  return {
    canonical: name,
    file: `src/${name.toLowerCase()}.ts`,
    aliases: [`${name}Service`, `${name.toLowerCase()}-svc`],
    dependents,
    classification: dependents >= 5 ? 'core' : dependents >= 2 ? 'supporting' : 'utility',
  }
}

function makeSystem(): SystemAnalysis {
  const payment = makeChunk('Payment')
  const auth = makeChunk('Auth')
  return {
    systemName: 'Acme Platform',
    whatItDoes: 'Handles payments and authentication for the Acme e-commerce platform.',
    services: [
      { name: 'Payment', file: 'src/payment.ts', oneLiner: 'Processes payments', riskLevel: 'high' },
      { name: 'Auth', file: 'src/auth.ts', oneLiner: 'Handles authentication', riskLevel: 'medium' },
    ],
    criticalPaths: [{ path: 'Request → Auth → Payment → DB', why: 'main revenue path', risk: 'high' }],
    systemFailurePoints: [{ severity: 'critical', description: 'DB outage', affectedModules: ['Payment', 'Auth'] }],
    dependencyGraph: {
      nodes: [
        { id: 'src/payment.ts', label: 'Payment', layer: 'core_business' },
        { id: 'src/auth.ts', label: 'Auth', layer: 'infrastructure' },
      ],
      edges: [{ from: 'src/payment.ts', to: 'src/auth.ts', label: 'depends on' }],
    },
    domainGlossary: [{ term: 'Widget', meaning: 'a unit of work' }],
    onboardingPriority: ['Start with Auth — it gates everything', 'Then read Payment'],
    systemAssumptions: ['All services share one database'],
    biggestRisks: ['Single DB is a SPOF'],
    aliases: [makeAlias('Payment'), makeAlias('Auth', 1)],
    chunkAnalyses: [payment, auth],
  }
}

function makeAssessment(): Assessment {
  return {
    overallScore: 1.8,
    level: { number: 2, name: 'Assisted', scoreRange: [1.1, 2.0], meaning: 'AI suggests; human reviews every change' },
    nextLevel: { number: 3, name: 'Paired', scoreRange: [2.1, 2.8], meaning: 'AI writes and applies; human reviews before commit' },
    dimensions: [
      { name: 'Test Coverage', score: 1.0, signals: ['10 test files found'], gaps: ['Add coverage threshold'] },
      { name: 'Security', score: 2.0, signals: ['No hardcoded secrets'], gaps: ['Add Dependabot'] },
      { name: 'CI/CD', score: 2.5, signals: ['GitHub Actions configured', 'Tests run in CI'], gaps: ['Automate deployment'] },
      { name: 'Documentation', score: 1.5, signals: ['README.md present'], gaps: ['Add CLAUDE.md'] },
      { name: 'Technical Debt', score: 2.5, signals: ['Low TODO count (3)'], gaps: [] },
      { name: 'Type Safety', score: 1.0, signals: ['tsconfig.json present'], gaps: ['Enable strict: true'] },
    ],
    toNextLevel: ['[Test Coverage] Add coverage threshold', '[Type Safety] Enable strict: true in tsconfig.json'],
    hardBlockers: [],
    safeForAI: ['Writing and extending tests'],
    requiresReview: ['Auth and security-sensitive code'],
    avoidAI: [],
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('renderOnboarding', () => {
  it('includes system name and description', () => {
    const md = renderOnboarding(makeSystem())
    expect(md).toContain('Acme Platform')
    expect(md).toContain('payments and authentication')
  })

  it('lists all services', () => {
    const md = renderOnboarding(makeSystem())
    expect(md).toContain('Payment')
    expect(md).toContain('Auth')
  })

  it('includes onboarding priority list', () => {
    const md = renderOnboarding(makeSystem())
    expect(md).toContain('Start with Auth')
  })

  it('includes domain glossary', () => {
    const md = renderOnboarding(makeSystem())
    expect(md).toContain('Widget')
  })
})

describe('renderServiceDoc', () => {
  it('includes blast radius and classification', () => {
    const md = renderServiceDoc(makeChunk('Payment'), makeAlias('Payment'))
    expect(md).toContain('Blast Radius')
    expect(md).toContain('Supporting')
  })

  it('shows aliases when present', () => {
    const md = renderServiceDoc(makeChunk('Payment'), makeAlias('Payment'))
    expect(md).toContain('PaymentService')
    expect(md).toContain('payment-svc')
  })

  it('sorts failure points by severity (critical first)', () => {
    const md = renderServiceDoc(makeChunk('Payment'), undefined)
    const critIdx = md.indexOf('[CRITICAL]')
    const lowIdx = md.indexOf('[LOW]')
    expect(critIdx).toBeLessThan(lowIdx)
  })

  it('marks unvalidated assumptions as bold No', () => {
    const md = renderServiceDoc(makeChunk('Payment'), undefined)
    expect(md).toContain('**No**')
  })

  it('includes env vars table', () => {
    const md = renderServiceDoc(makeChunk('Payment'), undefined)
    expect(md).toContain('DATABASE_URL')
  })
})

describe('renderSpec', () => {
  it('includes purpose and public interface', () => {
    const md = renderSpec(makeChunk('Payment'))
    expect(md).toContain('Purpose')
    expect(md).toContain('process(input')
  })

  it('includes ASSUMES and CAN FAIL contracts for high-severity items', () => {
    const md = renderSpec(makeChunk('Payment'))
    expect(md).toContain('ASSUMES')
    expect(md).toContain('CAN FAIL')
  })

  it('lists constraints', () => {
    const md = renderSpec(makeChunk('Payment'))
    expect(md).toContain('Read the DB migration docs')
  })
})

describe('renderRunbook', () => {
  it('includes env vars table', () => {
    const md = renderRunbook(makeChunk('Payment'))
    expect(md).toContain('DATABASE_URL')
  })

  it('includes pre-deployment checklist', () => {
    const md = renderRunbook(makeChunk('Payment'))
    expect(md).toContain('- [ ]')
  })

  it('warns about unvalidated env vars not checked on startup', () => {
    const md = renderRunbook(makeChunk('Payment'))
    expect(md).toContain('NOT validated on startup')
  })
})

describe('renderCodebaseMap', () => {
  it('includes system name and layer sections', () => {
    const md = renderCodebaseMap(makeSystem())
    expect(md).toContain('Acme Platform')
    expect(md).toContain('Core Business')
  })

  it('includes dependency relationships', () => {
    const md = renderCodebaseMap(makeSystem())
    expect(md).toContain('depends on')
  })

  it('includes alias table', () => {
    const md = renderCodebaseMap(makeSystem())
    expect(md).toContain('PaymentService')
  })
})

describe('renderAssessment', () => {
  it('includes current level and score', () => {
    const md = renderAssessment(makeAssessment())
    expect(md).toContain('Assisted')
    expect(md).toContain('1.80')
  })

  it('includes dimension breakdown', () => {
    const md = renderAssessment(makeAssessment())
    expect(md).toContain('Test Coverage')
    expect(md).toContain('Type Safety')
  })

  it('includes next level guidance', () => {
    const md = renderAssessment(makeAssessment())
    expect(md).toContain('Paired')
    expect(md).toContain('strict: true')
  })
})

describe('buildGraphOutput', () => {
  it('includes services with canonical names and aliases', () => {
    const graph = buildGraphOutput(makeSystem())
    expect(graph.systemName).toBe('Acme Platform')
    expect(graph.services.some((s) => s.canonical === 'Payment')).toBe(true)
    const payment = graph.services.find((s) => s.canonical === 'Payment')!
    expect(payment.aliases).toContain('PaymentService')
  })

  it('includes nodes and edges from dependency graph', () => {
    const graph = buildGraphOutput(makeSystem())
    expect(graph.nodes).toHaveLength(2)
    expect(graph.edges).toHaveLength(1)
  })
})

describe('writeOutput', () => {
  let outputDir: string

  beforeEach(() => {
    outputDir = path.join(os.tmpdir(), `legibly-write-${Date.now()}`)
    mkdirSync(outputDir, { recursive: true })
  })
  afterEach(() => { rmSync(outputDir, { recursive: true, force: true }) })

  it('creates all expected files', () => {
    const written = writeOutput({ outputDir, system: makeSystem(), assessment: makeAssessment() })

    expect(existsSync(written.onboarding)).toBe(true)
    expect(existsSync(written.codebaseMap)).toBe(true)
    expect(existsSync(written.blastRadius)).toBe(true)
    expect(existsSync(written.knownAs)).toBe(true)
    expect(existsSync(written.rippleMap)).toBe(true)
    expect(existsSync(written.assessment!)).toBe(true)
    expect(existsSync(written.graph)).toBe(true)
    expect(existsSync(written.freshness)).toBe(true)
    expect(written.services).toHaveLength(2)
    expect(written.specs).toHaveLength(2)
    expect(written.runbooks).toHaveLength(2)
    for (const f of [...written.services, ...written.specs, ...written.runbooks]) {
      expect(existsSync(f)).toBe(true)
    }
  })

  it('skips assessment file when no assessment provided', () => {
    const written = writeOutput({ outputDir, system: makeSystem() })
    expect(written.assessment).toBeNull()
    expect(existsSync(path.join(outputDir, 'AI_READINESS.md'))).toBe(false)
  })

  it('slugifies service names for file names', () => {
    const written = writeOutput({ outputDir, system: makeSystem() })
    expect(written.services.some((f) => f.endsWith('payment.md'))).toBe(true)
    expect(written.services.some((f) => f.endsWith('auth.md'))).toBe(true)
  })

  it('freshness.json lists all generated files', () => {
    writeOutput({ outputDir, system: makeSystem() })
    const freshness = JSON.parse(readFileSync(path.join(outputDir, 'freshness.json'), 'utf-8'))
    expect(freshness.files.some((f: { file: string }) => f.file === 'onboarding.md')).toBe(true)
    expect(freshness.files.some((f: { file: string }) => f.file.startsWith('services/'))).toBe(true)
  })
})
