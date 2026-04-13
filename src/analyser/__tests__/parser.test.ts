import { describe, it, expect } from 'vitest'
import { parseChunkAnalysis, ParseError } from '../parser.js'

const VALID: Record<string, unknown> = {
  name: 'Payment Service',
  file: 'src/payment.ts',
  summary: 'Handles payment processing.',
  owns: ['charge', 'refund'],
  doesNotOwn: ['email'],
  dependencies: [],
  usedBy: [],
  publicInterface: [],
  failurePoints: [{ severity: 'high', description: 'No retry', location: 'line 42', consequence: 'lost payment' }],
  implicitAssumptions: [{ assumption: 'DB is up', consequence: 'crash', validated: false }],
  envVars: [],
  domainLanguage: [],
  riskLevel: 'high',
  riskReason: 'Touches money.',
  beforeYouTouch: ['Read the Stripe docs'],
  missingThings: [],
  todos: [],
}

describe('parseChunkAnalysis', () => {
  it('parses a valid JSON string', () => {
    const result = parseChunkAnalysis(JSON.stringify(VALID))
    expect(result.name).toBe('Payment Service')
    expect(result.riskLevel).toBe('high')
  })

  it('strips markdown code fences', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\``
    const result = parseChunkAnalysis(fenced)
    expect(result.name).toBe('Payment Service')
  })

  it('strips plain code fences', () => {
    const fenced = `\`\`\`\n${JSON.stringify(VALID)}\n\`\`\``
    const result = parseChunkAnalysis(fenced)
    expect(result.name).toBe('Payment Service')
  })

  it('throws ParseError on invalid JSON', () => {
    expect(() => parseChunkAnalysis('not json')).toThrow(ParseError)
    expect(() => parseChunkAnalysis('not json')).toThrowError(/not valid JSON/)
  })

  it('throws ParseError when response is an array', () => {
    expect(() => parseChunkAnalysis('[]')).toThrow(ParseError)
  })

  it('throws ParseError when required keys are missing', () => {
    const { name: _, ...withoutName } = VALID
    expect(() => parseChunkAnalysis(JSON.stringify(withoutName))).toThrow(ParseError)
    expect(() => parseChunkAnalysis(JSON.stringify(withoutName))).toThrowError(/name/)
  })

  it('coerces null arrays to empty arrays', () => {
    const withNulls = { ...VALID, owns: null, beforeYouTouch: null, todos: null }
    const result = parseChunkAnalysis(JSON.stringify(withNulls))
    expect(result.owns).toEqual([])
    expect(result.beforeYouTouch).toEqual([])
    expect(result.todos).toEqual([])
  })

  it('exposes the raw string on ParseError', () => {
    try {
      parseChunkAnalysis('bad')
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError)
      expect((e as ParseError).raw).toBe('bad')
    }
  })
})
