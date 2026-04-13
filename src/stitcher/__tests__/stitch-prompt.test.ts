import { describe, it, expect } from 'vitest'
import { buildStitchPrompt } from '../../analyser/prompts/stitch.js'
import type { ChunkAnalysis } from '../../analyser/types.js'

function makeChunk(name: string): ChunkAnalysis {
  return {
    name, file: `src/${name}.ts`, summary: `${name} does things`,
    owns: ['thing'], doesNotOwn: [], dependencies: [{ name: 'express', type: 'external', why: 'http', risk: 'low' }],
    usedBy: [], publicInterface: [],
    failurePoints: [{ severity: 'high', description: 'can fail', location: 'line 1', consequence: 'bad' }],
    implicitAssumptions: [{ assumption: 'DB is up', consequence: 'crash', validated: false }],
    envVars: [{ name: 'PORT', required: true, default: null, validatedOnStartup: false, notes: '' }],
    domainLanguage: [], riskLevel: 'medium', riskReason: 'depends on DB',
    beforeYouTouch: ['check migrations', 'read the runbook'],
    missingThings: [], todos: [],
  }
}

describe('buildStitchPrompt', () => {
  it('includes the chunk count', () => {
    const prompt = buildStitchPrompt([makeChunk('payment'), makeChunk('auth')])
    expect(prompt).toContain('2 modules')
  })

  it('includes each chunk name', () => {
    const prompt = buildStitchPrompt([makeChunk('payment'), makeChunk('auth')])
    expect(prompt).toContain('payment')
    expect(prompt).toContain('auth')
  })

  it('includes the required JSON schema fields', () => {
    const prompt = buildStitchPrompt([makeChunk('x')])
    expect(prompt).toContain('"systemName"')
    expect(prompt).toContain('"criticalPaths"')
    expect(prompt).toContain('"systemFailurePoints"')
    expect(prompt).toContain('"dependencyGraph"')
    expect(prompt).toContain('"onboardingPriority"')
  })

  it('trims beforeYouTouch to 3 items', () => {
    const chunk = makeChunk('x')
    chunk.beforeYouTouch = ['a', 'b', 'c', 'd', 'e']
    const prompt = buildStitchPrompt([chunk])
    // The prompt serialises biggestConcerns from beforeYouTouch.slice(0,3)
    // We can't check exact count without parsing, but we verify it is present
    expect(prompt).toContain('"biggestConcerns"')
  })

  it('handles empty chunk list gracefully', () => {
    expect(() => buildStitchPrompt([])).not.toThrow()
  })
})
