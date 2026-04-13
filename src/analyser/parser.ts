import type { ChunkAnalysis } from './types.js'

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly raw: string
  ) {
    super(message)
    this.name = 'ParseError'
  }
}

const REQUIRED_KEYS: (keyof ChunkAnalysis)[] = [
  'name', 'file', 'summary', 'owns', 'doesNotOwn', 'dependencies',
  'usedBy', 'publicInterface', 'failurePoints', 'implicitAssumptions',
  'envVars', 'domainLanguage', 'riskLevel', 'riskReason',
  'beforeYouTouch', 'missingThings', 'todos',
]

/**
 * Strips markdown code fences the model sometimes wraps JSON in,
 * then parses and validates the structure.
 */
export function parseChunkAnalysis(raw: string): ChunkAnalysis {
  let text = raw.trim()

  // Strip ```json ... ``` or ``` ... ``` (handles trailing text after closing fence)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) text = fenceMatch[1].trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new ParseError(`Model response is not valid JSON: ${(e as Error).message}`, raw)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ParseError('Model response must be a JSON object', raw)
  }

  const obj = parsed as Record<string, unknown>

  const missing = REQUIRED_KEYS.filter((k) => !(k in obj))
  if (missing.length > 0) {
    throw new ParseError(`Model response missing required keys: ${missing.join(', ')}`, raw)
  }

  // Coerce arrays to empty array if model returned null
  const arrayKeys: (keyof ChunkAnalysis)[] = [
    'owns', 'doesNotOwn', 'dependencies', 'usedBy', 'publicInterface',
    'failurePoints', 'implicitAssumptions', 'envVars', 'domainLanguage',
    'beforeYouTouch', 'missingThings', 'todos',
  ]
  for (const key of arrayKeys) {
    if (obj[key] === null) obj[key] = []
  }

  return obj as unknown as ChunkAnalysis
}
