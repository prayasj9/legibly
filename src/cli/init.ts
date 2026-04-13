import fs from 'fs'
import path from 'path'
import readline from 'readline'
import chalk from 'chalk'

const DEFAULT_CONFIG = {
  source: './src',
  ignore: ['node_modules', 'dist', '*.test.js', '*.spec.js'],
  language: 'nodejs',
  provider: 'anthropic',
  apiKey: 'env:ANTHROPIC_API_KEY',
  concurrency: 3,
  output: './legibly',
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

export async function runInit(cwd: string = process.cwd()): Promise<void> {
  const configPath = path.join(cwd, 'legibly.config.json')

  if (fs.existsSync(configPath)) {
    console.log(chalk.yellow('legibly.config.json already exists — skipping init.'))
    console.log(chalk.dim(`  Edit ${configPath} to change settings.`))
    return
  }

  console.log(chalk.bold('\nWelcome to Legibly.\n'))
  console.log('This will create legibly.config.json in your project root.\n')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  const source = await prompt(rl, chalk.cyan('Source directory') + chalk.dim(' [./src]: '))
  const language = await prompt(rl, chalk.cyan('Language') + chalk.dim(' (nodejs/typescript/python/php/java/go) [nodejs]: '))
  const provider = await prompt(rl, chalk.cyan('AI provider') + chalk.dim(' (anthropic/openai) [anthropic]: '))
  const apiKeyRef = await prompt(rl, chalk.cyan('API key env var') + chalk.dim(' [ANTHROPIC_API_KEY]: '))

  rl.close()

  const config = {
    ...DEFAULT_CONFIG,
    source: source.trim() || DEFAULT_CONFIG.source,
    language: language.trim() || DEFAULT_CONFIG.language,
    provider: (provider.trim() || DEFAULT_CONFIG.provider) as 'anthropic' | 'openai',
    apiKey: `env:${apiKeyRef.trim() || 'ANTHROPIC_API_KEY'}`,
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
  console.log(chalk.green('\n✓ Created legibly.config.json'))

  // Append .legibly-cache to .gitignore if it exists
  const gitignorePath = path.join(cwd, '.gitignore')
  if (fs.existsSync(gitignorePath)) {
    const existing = fs.readFileSync(gitignorePath, 'utf-8')
    if (!existing.includes('.legibly-cache')) {
      fs.appendFileSync(gitignorePath, '\n# Legibly analysis cache\n.legibly-cache/\n')
      console.log(chalk.green('✓ Added .legibly-cache/ to .gitignore'))
    }
  } else {
    fs.writeFileSync(gitignorePath, '# Legibly analysis cache\n.legibly-cache/\n')
    console.log(chalk.green('✓ Created .gitignore with .legibly-cache/'))
  }

  console.log(chalk.dim('\nNext: set your API key in the environment, then run:'))
  console.log(chalk.bold('  npx legibly analyse\n'))
}
