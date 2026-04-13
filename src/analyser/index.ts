import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import type { Chunk } from '../chunker/types.js'
import type { LegiblyConfig } from '../config/index.js'
import { SYSTEM_PROMPT } from './prompts/system.js'
import { buildServicePrompt } from './prompts/service.js'
import { parseChunkAnalysis } from './parser.js'
import type { ChunkAnalysis } from './types.js'

export type { ChunkAnalysis } from './types.js'
export { ParseError } from './parser.js'

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

export async function analyseChunk(
  chunk: Chunk,
  config: LegiblyConfig
): Promise<ChunkAnalysis> {
  const model = buildModel(config)

  const { text } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: buildServicePrompt(chunk),
    maxOutputTokens: 4096,
  })

  return parseChunkAnalysis(text)
}
