import fs from 'fs'
import path from 'path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { loadConfig } from '../config/index.js'
import { addAnnotation, loadAnnotations } from '../annotations/index.js'

function readFileSafe(p: string): string | null {
  try { return fs.readFileSync(p, 'utf-8') } catch { return null }
}

function listMarkdownFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(dir, f))
  } catch { return [] }
}

function scoreMatch(filename: string, query: string): number {
  const lower = filename.toLowerCase()
  const q = query.toLowerCase()
  if (lower === q + '.md') return 3
  if (lower.startsWith(q)) return 2
  if (lower.includes(q)) return 1
  return 0
}

function findServiceFile(outputDir: string, name: string): string | null {
  const servicesDir = path.join(outputDir, 'services')
  let files: string[]
  try { files = fs.readdirSync(servicesDir) } catch { return null }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const scored = files
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ file: f, score: scoreMatch(f.replace('.md', ''), slug) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.length > 0 ? path.join(servicesDir, scored[0].file) : null
}

function searchDocs(outputDir: string, query: string): Array<{ file: string; excerpt: string }> {
  const q = query.toLowerCase()
  const dirs = [
    outputDir,
    path.join(outputDir, 'services'),
    path.join(outputDir, 'specs'),
    path.join(outputDir, 'runbooks'),
  ]

  const results: Array<{ file: string; score: number; excerpt: string }> = []

  for (const dir of dirs) {
    for (const filePath of listMarkdownFiles(dir)) {
      const content = readFileSafe(filePath)
      if (!content) continue
      const lower = content.toLowerCase()
      if (!lower.includes(q)) continue

      const idx = lower.indexOf(q)
      const start = Math.max(0, idx - 100)
      const end = Math.min(content.length, idx + 200)
      const excerpt = content.slice(start, end).replace(/\n+/g, ' ').trim()

      results.push({
        file: path.relative(outputDir, filePath),
        score: (lower.match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length,
        excerpt,
      })
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ file, excerpt }) => ({ file, excerpt }))
}

export async function runServe(cwd: string = process.cwd()): Promise<void> {
  let outputDir = path.join(cwd, 'legibly')
  try {
    const config = await loadConfig(cwd)
    outputDir = config.output
  } catch { /* use default */ }

  const server = new McpServer({
    name: 'legibly',
    version: '0.1.0',
  })

  // ── list_services ──────────────────────────────────────────────────────────
  server.tool(
    'list_services',
    'List all services analysed in this codebase',
    {},
    async () => {
      const servicesDir = path.join(outputDir, 'services')
      let files: string[]
      try { files = fs.readdirSync(servicesDir) } catch {
        return { content: [{ type: 'text' as const, text: 'No legibly output found. Run `legibly analyse` first.' }] }
      }
      const names = files.filter((f) => f.endsWith('.md')).map((f) => f.replace('.md', ''))
      return { content: [{ type: 'text' as const, text: names.join('\n') }] }
    }
  )

  // ── get_service ────────────────────────────────────────────────────────────
  server.tool(
    'get_service',
    'Get full documentation for a service (failure points, assumptions, env vars, etc.)',
    { name: z.string().describe('Service name — partial match is fine, e.g. "chart" or "auth"') },
    async ({ name }) => {
      const file = findServiceFile(outputDir, name)
      if (!file) {
        return { content: [{ type: 'text' as const, text: `No service matching "${name}" found. Use list_services to see available services.` }] }
      }
      const content = readFileSafe(file)
      if (!content) return { content: [{ type: 'text' as const, text: 'Could not read service file.' }] }

      // Merge annotations
      const store = loadAnnotations(outputDir)
      const annotations = store.entries.filter((e) =>
        path.basename(file, '.md').includes(e.service.toLowerCase().replace(/[^a-z0-9]+/g, '-')) ||
        e.service.toLowerCase().includes(name.toLowerCase())
      )
      const annotationBlock = annotations.length > 0
        ? `\n\n## Team notes\n\n${annotations.map((a) => `- **${a.date}**: ${a.note}`).join('\n')}`
        : ''

      return { content: [{ type: 'text' as const, text: content + annotationBlock }] }
    }
  )

  // ── get_overview ───────────────────────────────────────────────────────────
  server.tool(
    'get_overview',
    'Get the system onboarding guide — what the codebase does, where to start, critical paths',
    {},
    async () => {
      const content = readFileSafe(path.join(outputDir, 'onboarding.md'))
      if (!content) return { content: [{ type: 'text' as const, text: 'No onboarding.md found. Run `legibly analyse` first.' }] }
      return { content: [{ type: 'text' as const, text: content }] }
    }
  )

  // ── get_repos_touched ──────────────────────────────────────────────────────
  server.tool(
    'get_repos_touched',
    'Look up what else you need to check when changing a service — blast radius lookup',
    { service: z.string().describe('Service name to look up').optional() },
    async ({ service }) => {
      const content = readFileSafe(path.join(outputDir, 'REPOS_TOUCHED.md'))
      if (!content) return { content: [{ type: 'text' as const, text: 'No REPOS_TOUCHED.md found. Run `legibly analyse` first.' }] }
      if (!service) return { content: [{ type: 'text' as const, text: content }] }

      // Filter to just relevant lines
      const lower = service.toLowerCase()
      const lines = content.split('\n')
      const relevant = lines.filter((l) => l.toLowerCase().includes(lower))
      return { content: [{ type: 'text' as const, text: relevant.length > 0 ? relevant.join('\n') : `No entries found for "${service}" in repos-touched lookup.` }] }
    }
  )

  // ── get_assessment ─────────────────────────────────────────────────────────
  server.tool(
    'get_assessment',
    'Get the AI development level assessment — safe zones, hard blockers, what requires human review',
    {},
    async () => {
      const content = readFileSafe(path.join(outputDir, 'AI_READINESS.md'))
      if (!content) return { content: [{ type: 'text' as const, text: 'No assessment found. Run `legibly analyse` or `legibly assess` first.' }] }
      return { content: [{ type: 'text' as const, text: content }] }
    }
  )

  // ── search ─────────────────────────────────────────────────────────────────
  server.tool(
    'search',
    'Search across all service docs, runbooks, and specs',
    { query: z.string().describe('Search term — searches file content, service names, env vars, etc.') },
    async ({ query }) => {
      const results = searchDocs(outputDir, query)
      if (results.length === 0) {
        return { content: [{ type: 'text' as const, text: `No results found for "${query}".` }] }
      }
      const text = results
        .map((r) => `**${r.file}**\n> ${r.excerpt}`)
        .join('\n\n')
      return { content: [{ type: 'text' as const, text: text }] }
    }
  )

  // ── annotate ───────────────────────────────────────────────────────────────
  server.tool(
    'annotate',
    'Record a team learning or gotcha for a service — persisted to annotations.json',
    {
      service: z.string().describe('Service name'),
      note: z.string().describe('The learning or gotcha to record'),
    },
    async ({ service, note }) => {
      const entry = addAnnotation(outputDir, service, note)
      return { content: [{ type: 'text' as const, text: `Annotation saved for "${entry.service}" on ${entry.date}.\nRun \`legibly analyse --stitch-only\` to merge into service docs.` }] }
    }
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
