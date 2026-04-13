import { watch } from 'chokidar'
import chalk from 'chalk'
import { loadConfig } from '../config/index.js'
import { runAnalyse } from '../cli/analyse.js'

const DEBOUNCE_MS = 2000

export async function runWatch(cwd: string = process.cwd()): Promise<void> {
  const config = await loadConfig(cwd)

  console.log(chalk.bold('\nLegibly watch mode'))
  console.log(chalk.dim(`Watching ${config.source} for changes...\n`))

  // Run once immediately
  await runAnalyse(cwd, { force: false })

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let running = false

  const ignored = [
    '**/node_modules/**',
    '**/.legibly-cache/**',
    '**/legibly/**',
    '**/.git/**',
    ...config.ignore,
  ]

  const watcher = watch(config.source, {
    ignored,
    ignoreInitial: true,
    persistent: true,
  })

  async function onFileEvent(filePath: string, label: string): Promise<void> {
    if (running) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      console.log(chalk.dim(`\n${label}: ${filePath}`))
      running = true
      try {
        await runAnalyse(cwd, { force: true })
      } finally {
        running = false
      }
    }, DEBOUNCE_MS)
  }

  watcher
    .on('change', (filePath) => { void onFileEvent(filePath, 'Change detected') })
    .on('add', (filePath) => { void onFileEvent(filePath, 'New file') })

  console.log(chalk.dim('Press Ctrl+C to stop watching.\n'))

  process.on('SIGINT', () => {
    void watcher.close()
    console.log(chalk.dim('\nWatch mode stopped.'))
    process.exit(0)
  })
}
