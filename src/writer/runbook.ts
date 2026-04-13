import type { ChunkAnalysis } from '../analyser/types.js'

export function renderRunbook(analysis: ChunkAnalysis): string {
  const envBlock = analysis.envVars.length > 0
    ? analysis.envVars.map((e) =>
        `| \`${e.name}\` | ${e.required ? 'Required' : 'Optional'} | ${e.default ?? '—'} | ${e.notes} |`
      ).join('\n')
    : '_No environment variables documented._'

  const failureSteps = analysis.failurePoints
    .sort((a, b) => { const o = { critical: 0, high: 1, medium: 2, low: 3 }; return o[a.severity] - o[b.severity] })
    .map((f) => `### ${f.description}\n\n- **Severity:** ${f.severity.toUpperCase()}\n- **Location:** \`${f.location}\`\n- **What happens:** ${f.consequence}\n- **Resolution:** _Document steps here_`)
    .join('\n\n')

  const assumptionsList = analysis.implicitAssumptions
    .filter((a) => !a.validated)
    .map((a) => `- **${a.assumption}** — if violated: ${a.consequence}`)
    .join('\n') || '_None documented._'

  const preflightList = analysis.beforeYouTouch
    .map((b) => `- [ ] ${b}`)
    .join('\n') || '_No preflight checks documented._'

  return `# Runbook: ${analysis.name}

> **Risk Level:** ${analysis.riskLevel.toUpperCase()}
> Source: \`${analysis.file}\`

## Overview

${analysis.summary}

## Environment variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
${envBlock}

## Pre-deployment checklist

${preflightList}

## Known failure modes

${failureSteps || '_No failure modes documented._'}

## Unvalidated assumptions

These assumptions are never checked at runtime — verify them before deploying changes:

${assumptionsList}

## Rollback steps

> _Document rollback procedure here._

1. Revert the deployment to the previous version
2. Verify environment variables are unchanged
3. Confirm downstream services are healthy
${analysis.dependencies.filter((d) => d.risk === 'high').length > 0
  ? `4. Check high-risk dependencies: ${analysis.dependencies.filter((d) => d.risk === 'high').map((d) => d.name).join(', ')}`
  : ''}

## Monitoring

> _Document what to watch after deployment._

- Confirm no errors in application logs
- Check that all required environment variables are set
${analysis.envVars.filter((e) => e.required && !e.validatedOnStartup).length > 0
  ? `- **Warning:** these vars are NOT validated on startup: ${analysis.envVars.filter((e) => e.required && !e.validatedOnStartup).map((e) => `\`${e.name}\``).join(', ')}`
  : ''}
`
}
