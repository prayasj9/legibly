import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import type { ChunkAnalysis } from '../analyser/types.js'
import type { LegiblyConfig } from '../config/index.js'
import { SYSTEM_PROMPT } from '../analyser/prompts/system.js'
import { buildStitchPrompt } from '../analyser/prompts/stitch.js'
import { buildAliasTable } from './aliases.js'
import type { SystemAnalysis } from './types.js'

export type { SystemAnalysis, AliasEntry } from './types.js'

function buildModel(config: LegiblyConfig): LanguageModel {
  const apiKey = config.apiKey!
  if (config.provider === 'anthropic') {
    return createAnthropic({ apiKey })('claude-sonnet-4-5')
  }
  if (config.provider === 'openai') {
    return createOpenAI({ apiKey })('gpt-4o')
  }
  throw new Error(`Unsupported provider: ${config.provider}`)
}

class StitchError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message)
    this.name = 'StitchError'
  }
}


function parseSystemAnalysis(raw: string): Omit<SystemAnalysis, 'aliases' | 'chunkAnalyses'> {
  let text = raw.trim()
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fence) text = fence[1].trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new StitchError(`Stitch response is not valid JSON: ${(e as Error).message}`, raw)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new StitchError('Stitch response must be a JSON object', raw)
  }

  const obj = parsed as Record<string, unknown>

  const required = [
    'systemName', 'whatItDoes', 'services', 'criticalPaths',
    'systemFailurePoints', 'dependencyGraph', 'domainGlossary',
    'onboardingPriority', 'systemAssumptions', 'biggestRisks',
  ]
  const missing = required.filter((k) => !(k in obj))
  if (missing.length > 0) {
    throw new StitchError(`Stitch response missing keys: ${missing.join(', ')}`, raw)
  }

  // Coerce nulls to empty arrays
  const arrayKeys = [
    'services', 'criticalPaths', 'systemFailurePoints',
    'domainGlossary', 'onboardingPriority', 'systemAssumptions', 'biggestRisks',
  ]
  for (const key of arrayKeys) {
    if (obj[key] === null) obj[key] = []
  }

  return obj as unknown as Omit<SystemAnalysis, 'aliases' | 'chunkAnalyses'>
}

export async function stitch(
  chunkAnalyses: ChunkAnalysis[],
  config: LegiblyConfig
): Promise<SystemAnalysis> {
  const model = buildModel(config)

  const { text } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: buildStitchPrompt(chunkAnalyses),
    maxOutputTokens: 4096,
  })

  const systemAnalysis = parseSystemAnalysis(text)
  const aliases = buildAliasTable(chunkAnalyses)

  return {
    ...systemAnalysis,
    aliases,
    chunkAnalyses,
  }
}
