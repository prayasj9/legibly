import type { ChunkAnalysis } from '../analyser/types.js'
import type { AliasEntry } from '../stitcher/types.js'
import type { Annotation } from '../annotations/index.js'

function riskBadge(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1)
}

export function renderServiceDoc(
  analysis: ChunkAnalysis,
  aliasEntry: AliasEntry | undefined,
  annotations: Annotation[] = []
): string {
  const classification = aliasEntry
    ? `${aliasEntry.classification.charAt(0).toUpperCase() + aliasEntry.classification.slice(1)} — ${aliasEntry.dependents} dependent${aliasEntry.dependents !== 1 ? 's' : ''}`
    : 'Unknown'

  const blastRadius = aliasEntry && aliasEntry.dependents > 0
    ? `Changes here affect ${aliasEntry.dependents} dependent service${aliasEntry.dependents !== 1 ? 's' : ''}.`
    : 'No known dependents — changes are lower blast radius.'

  const aliasLine = aliasEntry && aliasEntry.aliases.length > 0
    ? `**Also known as:** ${aliasEntry.aliases.map((a) => `\`${a}\``).join(', ')}\n`
    : ''

  const ownsList = analysis.owns.map((o) => `- ${o}`).join('\n') || '_Nothing listed_'
  const doesNotOwnList = analysis.doesNotOwn.map((o) => `- ${o}`).join('\n') || '_Nothing listed_'

  const depsTable = analysis.dependencies.length > 0
    ? `| Name | Type | Why | Risk |\n|------|------|-----|------|\n` +
      analysis.dependencies.map((d) => `| ${d.name} | ${d.type} | ${d.why} | ${d.risk} |`).join('\n')
    : '_No dependencies identified._'

  const usedByList = analysis.usedBy.length > 0
    ? analysis.usedBy.map((u) => `- **${u.file}** → \`${u.function}\` — ${u.context}`).join('\n')
    : '_No known callers identified._'

  const interfaceTable = analysis.publicInterface.length > 0
    ? `| Function | Returns | Notes |\n|----------|---------|-------|\n` +
      analysis.publicInterface.map((i) => `| \`${i.function}\` | ${i.returns} | ${i.notes} |`).join('\n')
    : '_No public interface identified._'

  const failureList = analysis.failurePoints.length > 0
    ? analysis.failurePoints
        .sort((a, b) => { const order = { critical: 0, high: 1, medium: 2, low: 3 }; return order[a.severity] - order[b.severity] })
        .map((f) => `### [${f.severity.toUpperCase()}] ${f.description}\n- **Location:** ${f.location}\n- **Consequence:** ${f.consequence}`)
        .join('\n\n')
    : '_No failure points identified._'

  const assumptionList = analysis.implicitAssumptions.length > 0
    ? analysis.implicitAssumptions.map((a) =>
        `- **${a.assumption}**\n  - Consequence: ${a.consequence}\n  - Validated: ${a.validated ? 'Yes' : '**No**'}`
      ).join('\n')
    : '_No implicit assumptions identified._'

  const envTable = analysis.envVars.length > 0
    ? `| Variable | Required | Default | Validated on startup | Notes |\n|----------|----------|---------|----------------------|-------|\n` +
      analysis.envVars.map((e) =>
        `| \`${e.name}\` | ${e.required ? 'Yes' : 'No'} | ${e.default ?? '—'} | ${e.validatedOnStartup ? 'Yes' : 'No'} | ${e.notes} |`
      ).join('\n')
    : '_No environment variables identified._'

  const glossaryTable = analysis.domainLanguage.length > 0
    ? `| Term | Meaning |\n|------|--------|\n` +
      analysis.domainLanguage.map((t) => `| \`${t.term}\` | ${t.meaning} |`).join('\n')
    : '_No domain terms identified._'

  const beforeList = analysis.beforeYouTouch.map((b) => `- ${b}`).join('\n') || '_Nothing listed._'

  const missingList = analysis.missingThings.length > 0
    ? analysis.missingThings.map((m) => `- **${m.what}** — ${m.impact}`).join('\n')
    : '_Nothing identified as missing._'

  const todoList = analysis.todos.length > 0
    ? analysis.todos.map((t) => `- \`${t.location}\` — ${t.comment}${t.age ? ` _(${t.age})_` : ''}`).join('\n')
    : '_No TODOs found._'

  return `# ${analysis.name}

**Risk Level:** ${riskBadge(analysis.riskLevel)}
**Classification:** ${classification}
**Blast Radius:** ${blastRadius}
${aliasLine}
> ${analysis.riskReason}

## What this does

${analysis.summary}

## Owns / Does NOT own

**Owns:**
${ownsList}

**Does NOT own:**
${doesNotOwnList}

## Dependencies

${depsTable}

## Used by

${usedByList}

## Public interface

${interfaceTable}

## Failure points

${failureList}

## Implicit assumptions

${assumptionList}

## Environment variables

${envTable}

## Domain language

${glossaryTable}

## What to check before touching this

${beforeList}

## Missing things

${missingList}

## TODOs

${todoList}
${annotations.length > 0 ? `
## Team notes

${annotations.map((a) => `- **${a.date}${a.author ? ` · ${a.author}` : ''}:** ${a.note}`).join('\n')}
` : ''}`
}
