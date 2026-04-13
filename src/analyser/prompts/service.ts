import type { Chunk } from '../../chunker/types.js'
import fs from 'fs'

// ~40k chars ≈ 10k tokens. Keeps a single file well within any model's context.
const MAX_FILE_CHARS = 40_000
// ~150k chars ≈ 37.5k tokens. Leaves headroom for the prompt scaffolding and response.
const MAX_CHUNK_CHARS = 150_000

function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return '(unreadable)'
  }
}

function truncate(content: string, maxChars: number, filePath: string): string {
  if (content.length <= maxChars) return content
  const lineCount = content.split('\n').length
  const kept = content.slice(0, maxChars)
  const keptLines = kept.split('\n').length
  return (
    kept +
    `\n\n[TRUNCATED — showing ${keptLines.toLocaleString()} of ${lineCount.toLocaleString()} lines` +
    ` in ${filePath}. Full file is ${(content.length / 1024).toFixed(0)} KB.]`
  )
}

export function buildServicePrompt(chunk: Chunk): string {
  // Collect unique languages present in this chunk
  const languages = [...new Set(chunk.files.map((f) => f.language))].sort()
  const languageLine =
    languages.length === 1
      ? `Language: ${languages[0]}`
      : `Languages present: ${languages.join(', ')}`

  // Build file blocks, truncating per-file first
  let totalChars = 0
  const fileBlocks: string[] = []

  for (const f of chunk.files) {
    const raw = readFileSafe(f.path)
    const content = truncate(raw, MAX_FILE_CHARS, f.relativePath)
    const block = `### ${f.relativePath} (${f.language})\n\`\`\`\n${content}\n\`\`\``

    // If adding this block would exceed the chunk cap, replace with a size note
    if (totalChars + block.length > MAX_CHUNK_CHARS) {
      fileBlocks.push(
        `### ${f.relativePath} (${f.language})\n` +
          `[OMITTED — chunk total exceeded ${(MAX_CHUNK_CHARS / 1024).toFixed(0)} KB limit. ` +
          `File is ${(raw.length / 1024).toFixed(0)} KB. Analyse based on other files and import relationships.]`
      )
    } else {
      fileBlocks.push(block)
      totalChars += block.length
    }
  }

  const externalDepsNote =
    chunk.externalDeps.length > 0
      ? `External packages referenced: ${chunk.externalDeps.join(', ')}`
      : 'No external packages detected.'

  return `Analyse the following code chunk. The entry point (most imported file) is: ${chunk.entryPoint}

${languageLine}
${externalDepsNote}

${fileBlocks.join('\n\n')}

Return a JSON object with EXACTLY this structure. Every field is required.
The three highest-priority sections are failurePoints, implicitAssumptions, and beforeYouTouch — be exhaustive here.

{
  "name": "human-readable service or module name",
  "file": "path of the entry point file",
  "summary": "2-3 sentence plain English description of what this module does and why it exists",
  "owns": ["list of responsibilities this module owns"],
  "doesNotOwn": ["list of things callers might assume it owns but it does not"],
  "dependencies": [
    {
      "name": "dependency name",
      "type": "internal | external | database | queue | cache | http",
      "why": "why this dependency exists",
      "risk": "high | medium | low"
    }
  ],
  "usedBy": [
    {
      "file": "file that uses this",
      "function": "specific function or method",
      "context": "what it uses and why"
    }
  ],
  "publicInterface": [
    {
      "function": "function or method name with signature",
      "returns": "what it returns",
      "notes": "gotchas, side effects, or important context"
    }
  ],
  "failurePoints": [
    {
      "severity": "critical | high | medium | low",
      "description": "what can go wrong",
      "location": "file and line or function name",
      "consequence": "what happens when it fails"
    }
  ],
  "implicitAssumptions": [
    {
      "assumption": "what this code assumes to be true",
      "consequence": "what breaks if the assumption is violated",
      "validated": false
    }
  ],
  "envVars": [
    {
      "name": "ENV_VAR_NAME",
      "required": true,
      "default": null,
      "validatedOnStartup": false,
      "notes": "what it controls"
    }
  ],
  "domainLanguage": [
    {
      "term": "domain-specific term used in this code",
      "meaning": "what it means in this codebase"
    }
  ],
  "riskLevel": "high | medium | low",
  "riskReason": "one sentence explaining the risk level",
  "beforeYouTouch": [
    "specific thing an engineer must know or check before modifying this code"
  ],
  "missingThings": [
    {
      "what": "what is absent",
      "impact": "what problems this causes"
    }
  ],
  "todos": [
    {
      "location": "file and line number",
      "comment": "the TODO comment text",
      "age": null
    }
  ]
}`
}
