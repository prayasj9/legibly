import { cosmiconfig } from 'cosmiconfig'
import { z } from 'zod'
import path from 'path'

const ApiKeySchema = z.string().refine(
  (val) => val.startsWith('env:') || val.length > 0,
  { message: 'apiKey must be a non-empty string or "env:<VAR_NAME>"' }
)

export const LegiblyConfigSchema = z.object({
  source: z.string().default('./src'),
  ignore: z.array(z.string()).default(['node_modules', 'dist', '*.test.js', '*.spec.js']),
  language: z.enum(['auto', 'nodejs', 'typescript', 'python', 'php', 'java', 'go']).default('auto'),
  provider: z.enum(['anthropic', 'openai']).default('anthropic'),
  apiKey: ApiKeySchema.optional(),
  concurrency: z.number().int().min(1).max(10).default(3),
  output: z.string().default('./legibly'),
})

export type LegiblyConfig = z.infer<typeof LegiblyConfigSchema>

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'ConfigError'
  }
}

function resolveApiKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  if (raw.startsWith('env:')) {
    const varName = raw.slice(4)
    const value = process.env[varName]
    if (!value) {
      throw new ConfigError(
        `API key references environment variable "${varName}" but it is not set`
      )
    }
    return value
  }
  return raw
}

export async function loadConfig(cwd: string = process.cwd()): Promise<LegiblyConfig> {
  const explorer = cosmiconfig('legibly', {
    searchPlaces: [
      'legibly.config.json',
      'legibly.config.js',
      'legibly.config.ts',
      '.legiblyrc',
      '.legiblyrc.json',
    ],
  })

  const result = await explorer.search(cwd)

  const raw = result?.config ?? {}

  const parsed = LegiblyConfigSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new ConfigError(`Invalid legibly config:\n${issues}`)
  }

  const config = parsed.data

  // Resolve source relative to config file location or cwd
  const configDir = result?.filepath ? path.dirname(result.filepath) : cwd
  config.source = path.resolve(configDir, config.source)
  config.output = path.resolve(configDir, config.output)

  // Resolve API key from env var reference
  config.apiKey = resolveApiKey(config.apiKey)

  // Fall back to provider-specific env vars if apiKey not in config
  if (!config.apiKey) {
    if (config.provider === 'anthropic') {
      config.apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.LEGIBLY_API_KEY
    } else if (config.provider === 'openai') {
      config.apiKey = process.env.OPENAI_API_KEY ?? process.env.LEGIBLY_API_KEY
    }
  }

  return config
}

export function requireApiKey(config: LegiblyConfig): string {
  if (!config.apiKey) {
    throw new ConfigError(
      'No API key found. Set it in legibly.config.json as "apiKey": "env:ANTHROPIC_API_KEY" ' +
        'or export ANTHROPIC_API_KEY in your environment.'
    )
  }
  return config.apiKey
}
