import fs from 'fs'
import path from 'path'
import type { DimensionScore, Assessment, Level } from './types.js'
import { LEVELS } from './types.js'

export type { Assessment, DimensionScore, Level, LevelName } from './types.js'
export { LEVELS } from './types.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function exists(p: string): boolean {
  try { fs.accessSync(p); return true } catch { return false }
}

function readSafe(p: string): string {
  try { return fs.readFileSync(p, 'utf-8') } catch { return '' }
}

function globCount(dir: string, predicate: (name: string) => boolean): number {
  let count = 0
  function walk(d: string): void {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      if (e.isDirectory()) walk(path.join(d, e.name))
      else if (e.isFile() && predicate(e.name)) count++
    }
  }
  walk(dir)
  return count
}

function grepCount(dir: string, pattern: RegExp, fileExt: RegExp): number {
  let count = 0
  function walk(d: string): void {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      if (e.isDirectory()) walk(path.join(d, e.name))
      else if (e.isFile() && fileExt.test(e.name)) {
        const content = readSafe(path.join(d, e.name))
        const matches = content.match(pattern)
        if (matches) count += matches.length
      }
    }
  }
  walk(dir)
  return count
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

// ─── Dimension scorers ───────────────────────────────────────────────────────

function scoreTestCoverage(root: string): DimensionScore {
  const signals: string[] = []
  const gaps: string[] = []
  let score = 0

  const sourceFiles = globCount(root, (n) => /\.(ts|tsx|js|mjs|py|go|java|php)$/.test(n) && !/\.(test|spec)\.(ts|tsx|js)$/.test(n))
  const testFiles = globCount(root, (n) => /\.(test|spec)\.(ts|tsx|js|mjs|py)$/.test(n) || /(_test\.go|Test\.java|test_.*\.py)$/.test(n))

  if (testFiles === 0) {
    gaps.push('No test files found')
  } else {
    score += 1
    signals.push(`${testFiles} test file${testFiles > 1 ? 's' : ''} found`)
    const ratio = sourceFiles > 0 ? testFiles / sourceFiles : 0
    if (ratio >= 0.1) { score += 1; signals.push(`Test/source ratio: ${Math.round(ratio * 100)}%`) }
    else gaps.push(`Test/source ratio is low (${Math.round(ratio * 100)}%) — aim for 30%+`)
    if (ratio >= 0.3) { score += 0.5; signals.push('Strong test coverage ratio (30%+)') }
  }

  const pkg = readSafe(path.join(root, 'package.json'))
  if (pkg) {
    if (/"coverage"/.test(pkg) || /--coverage/.test(pkg)) {
      score += 0.5; signals.push('Coverage script in package.json')
    } else {
      gaps.push('Add a coverage script to package.json (e.g. vitest --coverage)')
    }
    if (/c8|nyc|istanbul/.test(pkg)) {
      score += 0.5; signals.push('Coverage threshold tool configured (c8/nyc)')
    } else {
      gaps.push('Enforce a coverage threshold (c8 --lines 80, nyc --lines 80)')
    }
  }

  if (exists(path.join(root, '.nycrc')) || exists(path.join(root, '.nycrc.json'))) {
    score += 0.5; signals.push('.nycrc threshold config found')
  }

  return { name: 'Test Coverage', score: clamp(score, 0, 4), signals, gaps }
}

function scoreSecurityDimension(root: string): DimensionScore {
  const signals: string[] = []
  const gaps: string[] = []
  let score = 2  // start neutral

  // Check for hardcoded secrets (crude but effective heuristic)
  const SECRET_PATTERN = /(?:password|secret|api[_-]?key|private[_-]?key)\s*[:=]\s*['"][^'"]{8,}/gi
  const secretHits = grepCount(root, SECRET_PATTERN, /\.(ts|tsx|js|py|go|java|php)$/)
  if (secretHits > 0) {
    score -= 2
    gaps.push(`${secretHits} potential hardcoded secret${secretHits > 1 ? 's' : ''} detected — move to environment variables`)
  } else {
    signals.push('No obvious hardcoded secrets detected')
  }

  const pkg = readSafe(path.join(root, 'package.json'))
  if (/"audit"/.test(pkg)) {
    score += 0.5; signals.push('npm audit script configured')
  } else if (pkg) {
    gaps.push('Add an npm audit script to package.json')
  }

  if (exists(path.join(root, '.snyk'))) {
    score += 0.5; signals.push('Snyk config found')
  }
  if (exists(path.join(root, '.github', 'dependabot.yml'))) {
    score += 0.5; signals.push('Dependabot configured')
  } else {
    gaps.push('Add .github/dependabot.yml for automated dependency updates')
  }

  // Check for security step in CI
  const ciDir = path.join(root, '.github', 'workflows')
  if (exists(ciDir)) {
    const ciFiles = fs.readdirSync(ciDir).filter((f: string) => /\.ya?ml$/.test(f))
    const hasAudit = ciFiles.some((f: string) => /audit|security|snyk/.test(readSafe(path.join(ciDir, f))))
    if (hasAudit) {
      score += 0.5; signals.push('Security/audit step in CI pipeline')
    } else {
      gaps.push('Add a security audit step to your CI pipeline')
    }
  }

  return { name: 'Security', score: clamp(score, 0, 4), signals, gaps }
}

function scoreCICD(root: string): DimensionScore {
  const signals: string[] = []
  const gaps: string[] = []
  let score = 0

  const ghWorkflows = path.join(root, '.github', 'workflows')
  const hasGHA = exists(ghWorkflows) && fs.readdirSync(ghWorkflows).some((f: string) => /\.ya?ml$/.test(f))
  const hasGitlab = exists(path.join(root, '.gitlab-ci.yml'))
  const hasJenkins = exists(path.join(root, 'Jenkinsfile'))
  const hasCircle = exists(path.join(root, '.circleci', 'config.yml'))

  const hasCi = hasGHA || hasGitlab || hasJenkins || hasCircle
  if (!hasCi) {
    gaps.push('No CI pipeline found — add GitHub Actions, GitLab CI, or similar')
    return { name: 'CI/CD', score: 0, signals, gaps }
  }

  score += 1
  if (hasGHA) signals.push('GitHub Actions configured')
  if (hasGitlab) signals.push('GitLab CI configured')
  if (hasJenkins) signals.push('Jenkinsfile found')
  if (hasCircle) signals.push('CircleCI configured')

  // Read all CI files and look for stages
  const ciContent = hasGHA
    ? fs.readdirSync(ghWorkflows).map((f: string) => readSafe(path.join(ghWorkflows, f))).join('\n')
    : hasGitlab ? readSafe(path.join(root, '.gitlab-ci.yml'))
    : hasJenkins ? readSafe(path.join(root, 'Jenkinsfile'))
    : readSafe(path.join(root, '.circleci', 'config.yml'))

  if (/\btest\b|\bspec\b|\bvitest\b|\bjest\b|\bpytest\b/.test(ciContent)) {
    score += 0.5; signals.push('Tests run in CI')
  } else { gaps.push('Run tests in CI') }

  if (/\blint\b|\beslint\b|\bflake8\b|\bruff\b/.test(ciContent)) {
    score += 0.5; signals.push('Linting in CI')
  } else { gaps.push('Add linting to CI') }

  if (/\bbuild\b|\bcompile\b|\btsc\b/.test(ciContent)) {
    score += 0.5; signals.push('Build step in CI')
  } else { gaps.push('Add a build/compile step to CI') }

  if (/\bdeploy\b|\brelease\b|\bpublish\b/.test(ciContent)) {
    score += 1; signals.push('Deployment automation in CI')
  } else { gaps.push('Automate deployment from CI (deploy on merge to main)') }

  if (/\brollback\b|\bblue.?green\b|\bcanary\b/.test(ciContent)) {
    score += 0.5; signals.push('Rollback or canary deployment strategy present')
  }

  return { name: 'CI/CD', score: clamp(score, 0, 4), signals, gaps }
}

function scoreDocumentation(root: string): DimensionScore {
  const signals: string[] = []
  const gaps: string[] = []
  let score = 0

  if (exists(path.join(root, 'README.md'))) {
    const size = fs.statSync(path.join(root, 'README.md')).size
    if (size > 500) { score += 1; signals.push('README.md present and non-trivial') }
    else { score += 0.5; signals.push('README.md present (but very short)'); gaps.push('Expand README.md with setup, usage, and architecture overview') }
  } else {
    gaps.push('Add a README.md')
  }

  if (exists(path.join(root, 'CLAUDE.md'))) {
    score += 1; signals.push('CLAUDE.md present — AI-ready context file')
  } else {
    gaps.push('Add CLAUDE.md for AI agent context (describes the system for Cursor/Claude Code)')
  }

  if (exists(path.join(root, 'docs')) && fs.statSync(path.join(root, 'docs')).isDirectory()) {
    score += 0.5; signals.push('docs/ directory found')
  }

  const hasOpenApi = ['openapi.yaml', 'openapi.yml', 'openapi.json', 'swagger.yaml', 'swagger.json']
    .some((f) => exists(path.join(root, f)) || exists(path.join(root, 'docs', f)))
  if (hasOpenApi) {
    score += 1; signals.push('OpenAPI/Swagger spec found')
  } else {
    gaps.push('Add an OpenAPI spec if this service exposes an HTTP API')
  }

  const hasArchDocs = ['ARCHITECTURE.md', 'DESIGN.md', 'docs/architecture.md', 'docs/ARCHITECTURE.md']
    .some((f) => exists(path.join(root, f)))
  if (hasArchDocs) {
    score += 0.5; signals.push('Architecture documentation found')
  } else {
    gaps.push('Add ARCHITECTURE.md describing the system design')
  }

  if (exists(path.join(root, 'CHANGELOG.md'))) {
    score += 0.5; signals.push('CHANGELOG.md present')
  }

  return { name: 'Documentation', score: clamp(score, 0, 4), signals, gaps }
}

function scoreTechnicalDebt(root: string): DimensionScore {
  const signals: string[] = []
  const gaps: string[] = []

  const todoCount = grepCount(root, /\b(TODO|FIXME|HACK|XXX)\b/g, /\.(ts|tsx|js|mjs|py|go|java|php)$/)
  const pkg = readSafe(path.join(root, 'package.json'))

  // Score inversely — fewer TODOs = higher score
  let score = 4
  if (todoCount > 100) { score -= 2; gaps.push(`${todoCount} TODO/FIXME comments — significant unresolved debt`) }
  else if (todoCount > 50) { score -= 1.5; gaps.push(`${todoCount} TODO/FIXME comments — consider a debt sprint`) }
  else if (todoCount > 20) { score -= 1; gaps.push(`${todoCount} TODO/FIXME comments`) }
  else if (todoCount > 5) { score -= 0.5; gaps.push(`${todoCount} TODO/FIXME comments`) }
  else signals.push(`Low TODO count (${todoCount})`)

  // Check for EOL/outdated signals
  if (pkg) {
    const engines = pkg.match(/"node"\s*:\s*"([^"]+)"/)
    if (engines) {
      const ver = parseInt(engines[1].replace(/[^0-9]/, ''), 10)
      if (ver < 18) { score -= 1; gaps.push(`Node.js engine "${engines[1]}" is EOL — upgrade to 20+`) }
      else signals.push(`Node.js engine: ${engines[1]}`)
    }

    if (/"dependencies"\s*:\s*\{/.test(pkg)) {
      signals.push('package.json dependencies present')
    }
  }

  if (exists(path.join(root, 'CHANGELOG.md'))) {
    score += 0.5; signals.push('CHANGELOG.md — changes are tracked')
  } else {
    gaps.push('Add CHANGELOG.md to track notable changes')
  }

  return { name: 'Technical Debt', score: clamp(score, 0, 4), signals, gaps }
}

function scoreTypeSafety(root: string): DimensionScore {
  const signals: string[] = []
  const gaps: string[] = []
  let score = 0

  const hasTsConfig = exists(path.join(root, 'tsconfig.json'))
  const hasPyTypes = grepCount(root, /^from\s+__future__\s+import\s+annotations|:\s*\w+\s*[=\-]>/gm, /\.py$/) > 0

  if (!hasTsConfig && !hasPyTypes) {
    const hasAnyTs = globCount(root, (n) => /\.tsx?$/.test(n)) > 0
    if (hasAnyTs) {
      gaps.push('TypeScript files found but no tsconfig.json')
    } else {
      signals.push('No TypeScript (type safety N/A for this language — score normalised)')
      return { name: 'Type Safety', score: 2, signals, gaps }  // neutral for non-TS
    }
  }

  if (hasTsConfig) {
    score += 1; signals.push('tsconfig.json present')
    const tsconfig = readSafe(path.join(root, 'tsconfig.json'))
    if (/"strict"\s*:\s*true/.test(tsconfig)) {
      score += 1; signals.push('strict: true in tsconfig')
    } else {
      gaps.push('Enable strict: true in tsconfig.json')
    }
  }

  const tsIgnoreCount = grepCount(root, /@ts-ignore|@ts-nocheck/g, /\.tsx?$/)
  if (tsIgnoreCount === 0) {
    score += 1; signals.push('No @ts-ignore suppressions')
  } else if (tsIgnoreCount <= 5) {
    score += 0.5; signals.push(`Minimal @ts-ignore usage (${tsIgnoreCount})`)
    gaps.push(`Remove ${tsIgnoreCount} @ts-ignore comment${tsIgnoreCount > 1 ? 's' : ''}`)
  } else {
    gaps.push(`${tsIgnoreCount} @ts-ignore suppressions — address these to strengthen type safety`)
  }

  const anyCount = grepCount(root, /:\s*any\b/g, /\.tsx?$/)
  if (anyCount === 0) {
    score += 1; signals.push('No explicit any usage')
  } else if (anyCount <= 10) {
    score += 0.5; signals.push(`Low explicit any usage (${anyCount})`)
    gaps.push(`Replace ${anyCount} explicit any type${anyCount > 1 ? 's' : ''} with proper types`)
  } else {
    gaps.push(`${anyCount} explicit any types — replace with proper types`)
  }

  return { name: 'Type Safety', score: clamp(score, 0, 4), signals, gaps }
}

// ─── Level resolution ────────────────────────────────────────────────────────

function resolveLevel(score: number): Level {
  for (const level of LEVELS) {
    if (score >= level.scoreRange[0] && score <= level.scoreRange[1]) return level
  }
  return score < LEVELS[0].scoreRange[0] ? LEVELS[0] : LEVELS[LEVELS.length - 1]
}

function buildToNextLevel(dimensions: DimensionScore[], nextLevel: Level | null): string[] {
  if (!nextLevel) return ['You have reached Autonomous level. Maintain coverage, security, and documentation as the codebase evolves.']

  // Collect all gaps, sort by dimension score ascending (lowest-scoring first)
  const sorted = [...dimensions].sort((a, b) => a.score - b.score)
  const actions: string[] = []
  for (const dim of sorted) {
    for (const gap of dim.gaps.slice(0, 2)) {
      actions.push(`[${dim.name}] ${gap}`)
      if (actions.length >= 5) break
    }
    if (actions.length >= 5) break
  }
  return actions
}

// ─── Hard blockers ───────────────────────────────────────────────────────────

function computeHardBlockers(dimensions: DimensionScore[]): { blockers: string[]; cappedLevel: number } {
  const blockers: string[] = []
  let cappedLevel = 5  // default: no cap

  const tests = dimensions.find((d) => d.name === 'Test Coverage')!
  const security = dimensions.find((d) => d.name === 'Security')!
  const cicd = dimensions.find((d) => d.name === 'CI/CD')!

  if (tests.score === 0) {
    blockers.push('No tests — AI-generated logic has no regression safety net')
    cappedLevel = Math.min(cappedLevel, 1)
  }

  if (cicd.score === 0) {
    blockers.push('No CI/CD pipeline — changes are not automatically validated')
    cappedLevel = Math.min(cappedLevel, 1)
  }

  if (security.gaps.some((g) => g.includes('hardcoded secret'))) {
    blockers.push('Hardcoded secrets detected in source code')
    cappedLevel = Math.min(cappedLevel, 1)
  }

  if (tests.score > 0 && tests.score < 2 && cicd.score > 0) {
    blockers.push('Test coverage too low to safely auto-apply AI changes')
    cappedLevel = Math.min(cappedLevel, 2)
  }

  return { blockers, cappedLevel }
}

// ─── AI safe zones ───────────────────────────────────────────────────────────

function computeAIZones(dimensions: DimensionScore[]): {
  safeForAI: string[]
  requiresReview: string[]
  avoidAI: string[]
} {
  const tests = dimensions.find((d) => d.name === 'Test Coverage')!
  const security = dimensions.find((d) => d.name === 'Security')!
  const cicd = dimensions.find((d) => d.name === 'CI/CD')!
  const typeSafety = dimensions.find((d) => d.name === 'Type Safety')!
  const docs = dimensions.find((d) => d.name === 'Documentation')!

  const safeForAI: string[] = []
  const requiresReview: string[] = []
  const avoidAI: string[] = []

  // Safe zones — where the safety net is strong
  if (tests.score >= 3) safeForAI.push('Writing and extending tests — good test infrastructure will catch regressions')
  if (typeSafety.score >= 3) safeForAI.push('Adding typed utilities and helpers — strict types prevent silent mistakes')
  if (cicd.score >= 3) safeForAI.push('Refactoring well-tested modules — CI will catch breakage automatically')
  if (docs.score >= 2) safeForAI.push('Generating and updating documentation — docs are tracked and maintained')
  if (tests.score >= 2 && cicd.score >= 2) safeForAI.push('New feature work in isolated modules with test coverage')

  // Requires review — risky enough to need a human eye before merge
  if (security.score < 3) requiresReview.push('Auth, permissions, and security-sensitive code — no automated security scanning')
  if (tests.score < 2) requiresReview.push('Any business logic change — test coverage too low to catch regressions automatically')
  if (typeSafety.score < 2) requiresReview.push('Interfaces and shared types — weak typing means silent breakage is likely')
  if (cicd.score < 2) requiresReview.push('All changes — no CI to validate correctness before merge')

  // Avoid AI — too dangerous without discussion
  if (security.gaps.some((g) => g.includes('hardcoded secret'))) {
    avoidAI.push('Files containing credentials or secrets — clean these up before delegating')
  }
  if (tests.score === 0) {
    avoidAI.push('Core business logic — no tests means AI changes are completely unvalidated')
  }
  if (security.score < 2) {
    avoidAI.push('Authentication flows and access control — security posture is too weak for autonomous changes')
  }

  return { safeForAI, requiresReview, avoidAI }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function assess(root: string): Assessment {
  const dimensions = [
    scoreTestCoverage(root),
    scoreSecurityDimension(root),
    scoreCICD(root),
    scoreDocumentation(root),
    scoreTechnicalDebt(root),
    scoreTypeSafety(root),
  ]

  const rawScore = dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length
  const { blockers, cappedLevel } = computeHardBlockers(dimensions)

  // Apply hard blockers — cap the score so it can't resolve above the blocked level
  const maxScore = LEVELS.find((l) => l.number === cappedLevel)?.scoreRange[1] ?? 4.0
  const overallScore = parseFloat(Math.min(rawScore, maxScore).toFixed(2))

  const level = resolveLevel(overallScore)
  const nextLevel = LEVELS.find((l) => l.number === level.number + 1) ?? null
  const toNextLevel = buildToNextLevel(dimensions, nextLevel)
  const { safeForAI, requiresReview, avoidAI } = computeAIZones(dimensions)

  return {
    overallScore,
    level,
    nextLevel,
    dimensions,
    toNextLevel,
    hardBlockers: blockers,
    safeForAI,
    requiresReview,
    avoidAI,
  }
}
