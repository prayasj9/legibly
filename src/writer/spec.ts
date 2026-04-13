import type { ChunkAnalysis } from '../analyser/types.js'

/**
 * Generates a machine-readable behavioural spec for AI agents.
 * Structured for consumption by Cursor, Claude Code, Copilot, etc.
 */
export function renderSpec(analysis: ChunkAnalysis): string {
  const interfaceBlock = analysis.publicInterface.length > 0
    ? analysis.publicInterface
        .map((i) => `- \`${i.function}\` → ${i.returns}\n  ${i.notes ? `> ${i.notes}` : ''}`)
        .join('\n')
    : '_No public interface documented._'

  const contractsList = [
    ...analysis.implicitAssumptions
      .filter((a) => !a.validated)
      .map((a) => `- ASSUMES: ${a.assumption} (unvalidated — consequence: ${a.consequence})`),
    ...analysis.failurePoints
      .filter((f) => f.severity === 'critical' || f.severity === 'high')
      .map((f) => `- CAN FAIL: ${f.description} at \`${f.location}\` → ${f.consequence}`),
  ]

  const envBlock = analysis.envVars.length > 0
    ? analysis.envVars
        .map((e) => `- \`${e.name}\`${e.required ? ' (required)' : ' (optional)'}: ${e.notes}${e.default ? ` [default: ${e.default}]` : ''}`)
        .join('\n')
    : '_No environment variables._'

  const constraintsList = analysis.beforeYouTouch
    .map((b) => `- ${b}`)
    .join('\n') || '_No constraints documented._'

  const missingList = analysis.missingThings.length > 0
    ? analysis.missingThings.map((m) => `- ${m.what}: ${m.impact}`).join('\n')
    : '_None documented._'

  return `# Spec: ${analysis.name}

> This is a machine-readable behavioural spec for AI agents.
> Source: \`${analysis.file}\`
> Risk: **${analysis.riskLevel.toUpperCase()}**

## Purpose

${analysis.summary}

## Owns

${analysis.owns.map((o) => `- ${o}`).join('\n') || '_Not documented._'}

## Does NOT own

${analysis.doesNotOwn.map((o) => `- ${o}`).join('\n') || '_Not documented._'}

## Public interface

${interfaceBlock}

## Behavioural contracts

${contractsList.length > 0 ? contractsList.join('\n') : '_No critical contracts documented._'}

## Environment variables

${envBlock}

## Constraints — read before modifying

${constraintsList}

## Known gaps

${missingList}

## Domain terms used here

${analysis.domainLanguage.length > 0
  ? analysis.domainLanguage.map((t) => `- \`${t.term}\`: ${t.meaning}`).join('\n')
  : '_None documented._'}
`
}
