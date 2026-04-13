import path from 'path'
import chalk from 'chalk'
import { loadConfig } from '../config/index.js'
import { addAnnotation, loadAnnotations } from '../annotations/index.js'

export async function runAnnotate(
  service: string,
  note: string,
  cwd: string = process.cwd(),
  opts: { author?: string; list?: boolean } = {}
): Promise<void> {
  let config: Awaited<ReturnType<typeof loadConfig>>
  try {
    config = await loadConfig(cwd)
  } catch {
    // Fall back to default output dir if no config found
    config = { source: './src', ignore: [], language: 'auto', provider: 'anthropic', concurrency: 3, output: path.join(cwd, 'legibly') }
  }

  const outputDir = config.output

  if (opts.list) {
    const store = loadAnnotations(outputDir)
    if (store.entries.length === 0) {
      console.log(chalk.dim('No annotations yet. Add one with: legibly annotate "<service>" "<note>"'))
      return
    }
    console.log(chalk.bold(`\n${store.entries.length} annotation${store.entries.length !== 1 ? 's' : ''}:\n`))
    for (const e of store.entries) {
      console.log(`  ${chalk.white(e.service)} ${chalk.dim(`(${e.date}${e.author ? ` · ${e.author}` : ''})`)}`)
      console.log(`  ${chalk.dim('→')} ${e.note}\n`)
    }
    return
  }

  const entry = addAnnotation(outputDir, service, note, opts.author)
  console.log(chalk.green(`✔ Annotation saved for "${entry.service}":`))
  console.log(chalk.dim(`  ${entry.note}`))
  console.log(chalk.dim(`\nRun \`legibly analyse --stitch-only\` to merge into service docs.`))
}
