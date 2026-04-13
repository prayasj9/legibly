#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getVersion(): string {
  try {
    // Walk up from dist/cli/ to find package.json
    const pkgPath = path.resolve(__dirname, '../../package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      return pkg.version ?? '0.1.0'
    }
  } catch {}
  return '0.1.0'
}

const program = new Command()

program
  .name('legibly')
  .description('Turn legacy codebases into a living, structured context layer.')
  .version(getVersion())

// ── init ────────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('One-time setup — creates legibly.config.json')
  .action(async () => {
    const { runInit } = await import('./init.js')
    await runInit(process.cwd())
  })

// ── analyse ──────────────────────────────────────────────────────────────────
program
  .command('analyse')
  .alias('analyze')
  .description('Full codebase analysis — generates /legibly context bundle')
  .option('-f, --force', 'Ignore any existing checkpoint and start fresh')
  .option('--stitch-only', 'Skip chunk analysis — re-run stitch, assess, and write from cached results')
  .option('--watch', 'Re-analyse on file changes (incremental)')
  .action(async (opts: { force?: boolean; stitchOnly?: boolean; watch?: boolean }) => {
    if (opts.watch) {
      const { runWatch } = await import('../watcher/index.js')
      await runWatch(process.cwd())
    } else {
      const { runAnalyse } = await import('./analyse.js')
      await runAnalyse(process.cwd(), { force: opts.force, stitchOnly: opts.stitchOnly })
    }
  })

// ── annotate ─────────────────────────────────────────────────────────────────
program
  .command('annotate [service] [note]')
  .description('Add a team note or gotcha to a service doc')
  .option('--author <name>', 'Your name (optional)')
  .option('-l, --list', 'List all annotations')
  .action(async (service: string | undefined, note: string | undefined, opts: { author?: string; list?: boolean }) => {
    const { runAnnotate } = await import('./annotate.js')
    if (opts.list) {
      await runAnnotate('', '', process.cwd(), { list: true })
    } else if (service && note) {
      await runAnnotate(service, note, process.cwd(), { author: opts.author })
    } else {
      console.error('Usage: legibly annotate "<service>" "<note>" [--author <name>]')
      console.error('       legibly annotate --list')
      process.exit(1)
    }
  })

// ── platform ──────────────────────────────────────────────────────────────────
program
  .command('platform [workspace]')
  .description('Synthesise a cross-repo platform map from multiple legibly outputs')
  .option('-o, --output <dir>', 'Output directory (default: workspace root)')
  .action(async (workspace: string | undefined, opts: { output?: string }) => {
    const { runPlatform } = await import('./platform.js')
    await runPlatform(workspace ?? process.cwd(), { output: opts.output })
  })

// ── serve ─────────────────────────────────────────────────────────────────────
program
  .command('serve')
  .description('Start MCP server — exposes legibly output to AI agents via Model Context Protocol')
  .action(async () => {
    const { runServe } = await import('../mcp/index.js')
    await runServe(process.cwd())
  })

// ── assess ───────────────────────────────────────────────────────────────────
program
  .command('assess')
  .description('AI readiness score — scans codebase structure, no API calls needed')
  .action(async () => {
    const { assess } = await import('../assessor/index.js')
    const { renderAssessment } = await import('../writer/assessment.js')

    const assessment = assess(process.cwd())
    const md = renderAssessment(assessment)

    // Print a clean terminal version (strip markdown formatting)
    console.log()
    console.log(chalk.bold(`${assessment.level.name} — ${assessment.overallScore.toFixed(2)} / 4.00`))
    console.log(chalk.dim(`Level ${assessment.level.number}: ${assessment.level.meaning}\n`))

    for (const d of assessment.dimensions) {
      const bar = buildBar(d.score)
      const colour = d.score >= 3 ? chalk.green : d.score >= 2 ? chalk.yellow : chalk.red
      console.log(`  ${colour(bar)} ${d.score.toFixed(1)}  ${d.name}`)
    }

    if (assessment.nextLevel) {
      console.log(chalk.bold(`\nTo reach ${assessment.nextLevel.name}:\n`))
      for (const action of assessment.toNextLevel) {
        console.log(`  • ${action}`)
      }
    }

    console.log(chalk.dim('\nRun `legibly analyse` to generate the full context bundle and merge this into it.\n'))

    // Also write the markdown file
    const outputDir = path.join(process.cwd(), 'legibly')
    fs.mkdirSync(outputDir, { recursive: true })
    const outPath = path.join(outputDir, 'AI_READINESS.md')
    fs.writeFileSync(outPath, md)
    console.log(chalk.dim(`Assessment written to ${outPath}`))
  })

function buildBar(score: number, width = 20): string {
  const filled = Math.round((score / 4) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

program.parse()
