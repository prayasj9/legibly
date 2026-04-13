import path from 'path'
import readline from 'readline'
import ora from 'ora'
import chalk from 'chalk'
import { loadConfig, requireApiKey } from '../config/index.js'
import { crawl } from '../crawler/index.js'
import { chunk } from '../chunker/index.js'
import { runChunks } from '../analyser/runner.js'
import { stitch } from '../stitcher/index.js'
import { assess } from '../assessor/index.js'
import { writeOutput } from '../writer/index.js'
import { hasCheckpoint, loadCheckpoint } from '../checkpoint/index.js'
import type { ChunkAnalysis } from '../analyser/types.js'

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer: string) => { rl.close(); resolve(answer) })
  })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

export async function runAnalyse(
  cwd: string = process.cwd(),
  opts: { force?: boolean; stitchOnly?: boolean } = {}
): Promise<void> {
  // ── Config ──────────────────────────────────────────────────────────────
  const spinner = ora('Loading config...').start()
  let config!: Awaited<ReturnType<typeof loadConfig>>
  try {
    config = await loadConfig(cwd)
    requireApiKey(config)
    spinner.succeed(chalk.dim(`Config loaded — source: ${config.source}, provider: ${config.provider}`))
  } catch (e) {
    spinner.fail((e as Error).message)
    process.exit(1)
  }

  const cacheDir = path.join(cwd, '.legibly-cache')

  // ── Stitch-only shortcut ──────────────────────────────────────────────────
  if (opts.stitchOnly) {
    if (!hasCheckpoint(cacheDir)) {
      console.log(chalk.red('No cached analysis found. Run `legibly analyse` first.'))
      process.exit(1)
    }
    const { results: saved } = loadCheckpoint(cacheDir)
    if (saved.size === 0) {
      console.log(chalk.red('Checkpoint exists but contains no completed chunks.'))
      process.exit(1)
    }
    const chunkAnalyses = [...saved.values()] as ChunkAnalysis[]
    spinner.succeed(chalk.dim(`Loaded ${chunkAnalyses.length} cached chunk analyses`))
    await stitchAssessWrite(spinner, chunkAnalyses, config, cwd, [])
    return
  }

  // ── Resume check ─────────────────────────────────────────────────────────
  if (!opts.force && hasCheckpoint(cacheDir)) {
    const answer = await prompt(
      chalk.yellow('\nA previous run was interrupted. Resume it? (Y/n) ')
    )
    if (answer.trim().toLowerCase() === 'n') {
      const { clearCheckpoint } = await import('../checkpoint/index.js')
      clearCheckpoint(cacheDir)
      console.log(chalk.dim('Starting fresh.\n'))
    } else {
      console.log(chalk.dim('Resuming previous run.\n'))
    }
  }

  // ── Crawl ────────────────────────────────────────────────────────────────
  spinner.start('Crawling source files...')
  const fileMap = crawl(config)
  spinner.succeed(chalk.dim(`Found ${fileMap.length} source file${fileMap.length !== 1 ? 's' : ''}`))

  if (fileMap.length === 0) {
    console.log(chalk.yellow(`No source files found in ${config.source}.`))
    console.log(chalk.dim('Check your "source" and "language" settings in legibly.config.json.'))
    process.exit(0)
  }

  // ── Chunk ────────────────────────────────────────────────────────────────
  spinner.start('Building import graph and chunking...')
  const chunks = chunk(fileMap)
  spinner.succeed(chalk.dim(`Split into ${chunks.length} chunk${chunks.length !== 1 ? 's' : ''}`))

  // ── Analyse ──────────────────────────────────────────────────────────────
  console.log(chalk.bold(`\nAnalysing ${chunks.length} chunks (concurrency: ${config.concurrency})...\n`))

  const failed: string[] = []
  let progressSpinner = ora(`0 / ${chunks.length} chunks analysed`).start()

  const { results } = await runChunks({
    chunks,
    config,
    cacheDir,
    onProgress: (done, total) => {
      progressSpinner.text = `${done} / ${total} chunks analysed`
    },
    onError: (chunkId, error) => {
      failed.push(chunkId)
      progressSpinner.warn(chalk.yellow(`Chunk ${chunkId} failed: ${error.message}`))
      progressSpinner = ora(`... / ${chunks.length} chunks analysed`).start()
    },
  })

  progressSpinner.succeed(chalk.dim(
    `${results.size} / ${chunks.length} chunks analysed${failed.length > 0 ? ` (${failed.length} failed)` : ''}`
  ))

  if (results.size === 0) {
    console.log(chalk.red('\nAll chunks failed. Check your API key and network connection.'))
    process.exit(1)
  }

  const chunkAnalyses = [...results.values()] as ChunkAnalysis[]
  await stitchAssessWrite(spinner, chunkAnalyses, config, cwd, failed)
}

async function stitchAssessWrite(
  spinner: ReturnType<typeof ora>,
  chunkAnalyses: ChunkAnalysis[],
  config: Awaited<ReturnType<typeof loadConfig>>,
  cwd: string,
  failed: string[]
): Promise<void> {
  const start = Date.now()

  // ── Stitch ───────────────────────────────────────────────────────────────
  spinner.start('Stitching system-level picture...')
  let systemAnalysis
  try {
    systemAnalysis = await stitch(chunkAnalyses, config)
    spinner.succeed(chalk.dim(`System: "${systemAnalysis.systemName}" — ${systemAnalysis.services.length} services identified`))
  } catch (e) {
    spinner.fail(`Stitch failed: ${(e as Error).message}`)
    process.exit(1)
  }

  // ── Assess ───────────────────────────────────────────────────────────────
  spinner.start('Running dark factory assessment...')
  const assessment = assess(cwd)
  spinner.succeed(chalk.dim(`Assessment: Level ${assessment.level.number} (${assessment.level.name}) — score ${assessment.overallScore.toFixed(2)}/4.00`))

  // ── Write ────────────────────────────────────────────────────────────────
  spinner.start(`Writing output to ${config.output}...`)
  const written = writeOutput({ outputDir: config.output, system: systemAnalysis, assessment })
  spinner.succeed(chalk.dim(`Output written to ${config.output}/`))

  // ── Summary ──────────────────────────────────────────────────────────────
  const duration = formatDuration(Date.now() - start)
  const highRisk = chunkAnalyses.filter((c) => c.riskLevel === 'high').length

  console.log(chalk.bold(`\n✓ Analysis complete in ${duration}\n`))
  console.log(`  ${chalk.white(written.onboarding.replace(cwd + '/', ''))}`)
  console.log(`  ${chalk.white(written.relationshipMap.replace(cwd + '/', ''))}`)
  console.log(`  ${chalk.white(written.reposTouched.replace(cwd + '/', ''))}`)
  console.log(`  ${chalk.white(written.aliasResolution.replace(cwd + '/', ''))}`)
  console.log(`  ${chalk.white(written.proxyChains.replace(cwd + '/', ''))}`)
  if (written.assessment) console.log(`  ${chalk.white(written.assessment.replace(cwd + '/', ''))}`)
  console.log(`  ${chalk.dim(`${written.services.length} service docs, ${written.specs.length} specs, ${written.runbooks.length} runbooks`)}`)

  if (highRisk > 0) {
    console.log(chalk.yellow(`\n  ⚠  ${highRisk} high-risk service${highRisk > 1 ? 's' : ''} identified — check service docs before making changes.`))
  }

  if (failed.length > 0) {
    console.log(chalk.yellow(`\n  ${failed.length} chunk${failed.length > 1 ? 's' : ''} failed to analyse: ${failed.join(', ')}`))
    console.log(chalk.dim('  Re-run `legibly analyse` to retry failed chunks.'))
  }

  console.log()
}
