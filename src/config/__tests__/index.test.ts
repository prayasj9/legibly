import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import path from 'path'
import os from 'os'
import {
  loadConfig,
  requireApiKey,
  ConfigError,
  LegiblyConfig,
} from '../index.js'

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `legibly-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeConfig(dir: string, config: object): void {
  writeFileSync(
    path.join(dir, 'legibly.config.json'),
    JSON.stringify(config, null, 2)
  )
}

describe('loadConfig', () => {
  let tmpDir: string
  const originalEnv = { ...process.env }

  beforeEach(() => {
    tmpDir = makeTmpDir()
    // Wipe provider env vars so they don't bleed between tests
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.OPENAI_API_KEY
    delete process.env.LEGIBLY_API_KEY
    delete process.env.MY_CUSTOM_KEY
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    process.env = { ...originalEnv }
  })

  it('returns defaults when no config file exists', async () => {
    const config = await loadConfig(tmpDir)
    expect(config.language).toBe('auto')
    expect(config.provider).toBe('anthropic')
    expect(config.concurrency).toBe(3)
    expect(config.ignore).toContain('node_modules')
  })

  it('accepts "auto" as a language value', async () => {
    writeConfig(tmpDir, { language: 'auto' })
    const config = await loadConfig(tmpDir)
    expect(config.language).toBe('auto')
  })

  it('loads and validates a valid config file', async () => {
    writeConfig(tmpDir, {
      source: './app',
      language: 'python',
      provider: 'openai',
      concurrency: 5,
    })
    const config = await loadConfig(tmpDir)
    expect(config.language).toBe('python')
    expect(config.provider).toBe('openai')
    expect(config.concurrency).toBe(5)
    expect(config.source).toBe(path.join(tmpDir, 'app'))
  })

  it('resolves source and output paths relative to config file', async () => {
    writeConfig(tmpDir, { source: './src', output: './out' })
    const config = await loadConfig(tmpDir)
    expect(config.source).toBe(path.join(tmpDir, 'src'))
    expect(config.output).toBe(path.join(tmpDir, 'out'))
  })

  it('throws ConfigError on invalid language value', async () => {
    writeConfig(tmpDir, { language: 'ruby' })
    await expect(loadConfig(tmpDir)).rejects.toThrow(ConfigError)
  })

  it('throws ConfigError when concurrency is out of range', async () => {
    writeConfig(tmpDir, { concurrency: 99 })
    await expect(loadConfig(tmpDir)).rejects.toThrow(ConfigError)
  })

  it('resolves env: prefixed API key', async () => {
    process.env.MY_CUSTOM_KEY = 'sk-test-123'
    writeConfig(tmpDir, { apiKey: 'env:MY_CUSTOM_KEY' })
    const config = await loadConfig(tmpDir)
    expect(config.apiKey).toBe('sk-test-123')
  })

  it('throws ConfigError when env: var is not set', async () => {
    writeConfig(tmpDir, { apiKey: 'env:MISSING_KEY' })
    await expect(loadConfig(tmpDir)).rejects.toThrow(ConfigError)
  })

  it('falls back to ANTHROPIC_API_KEY env var for anthropic provider', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-fallback'
    const config = await loadConfig(tmpDir)
    expect(config.apiKey).toBe('sk-ant-fallback')
  })

  it('falls back to OPENAI_API_KEY for openai provider', async () => {
    process.env.OPENAI_API_KEY = 'sk-openai-fallback'
    writeConfig(tmpDir, { provider: 'openai' })
    const config = await loadConfig(tmpDir)
    expect(config.apiKey).toBe('sk-openai-fallback')
  })

  it('falls back to LEGIBLY_API_KEY when provider-specific key is absent', async () => {
    process.env.LEGIBLY_API_KEY = 'sk-legibly-fallback'
    const config = await loadConfig(tmpDir)
    expect(config.apiKey).toBe('sk-legibly-fallback')
  })
})

describe('requireApiKey', () => {
  it('returns the key when present', () => {
    const config = { apiKey: 'sk-test' } as LegiblyConfig
    expect(requireApiKey(config)).toBe('sk-test')
  })

  it('throws ConfigError when apiKey is missing', () => {
    const config = {} as LegiblyConfig
    expect(() => requireApiKey(config)).toThrow(ConfigError)
  })
})
