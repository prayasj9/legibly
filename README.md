# Legibly

**Autonomous AI development isn't blocked by model capability. It's blocked by missing context.**

AI agents can write code, run tests, and open PRs. But they can't do it *safely* in a codebase they don't understand — they don't know which modules are fragile, which assumptions will silently break, or how a change in one place cascades to five others.

Legibly creates the missing context layer: a structured, always-current understanding of your codebase that every engineer and every AI agent can act on. It also scores how safely you can delegate work to AI *right now*, and tells you exactly what's blocking you from going further.

---

## How it works

```bash
legibly analyse
```

Legibly crawls your source code, builds an import graph, groups related files into logical chunks, and sends each chunk to an LLM for deep analysis. The results are stitched into a system-level picture and written as a structured bundle — documents your team can read, tools AI agents can query.

The same run also produces your **AI Readiness Score**: a five-level assessment of how safely AI can operate in this codebase right now, with hard blockers, safe zones, and a concrete path to unlocking the next level.

---

## AI Readiness Score

```bash
legibly assess   # no API key needed — runs in seconds
```

Six dimensions of engineering readiness, scored 0–4. Hard blockers automatically cap your level when critical safety nets are missing. Safe zone guidance tells AI agents exactly where they can operate freely vs where a human needs to be in the loop.

| Level | Name | What AI can safely do |
|-------|------|-----------------------|
| 1 | ⚙️ Manual | Explain code and answer questions |
| 2 | 💡 Assisted | Suggest changes — human applies and reviews everything |
| 3 | 🤝 Paired | Write and apply changes — human reviews before commit |
| 4 | 🎯 Trusted | Write, test, and commit — human reviews PRs |
| 5 | 🤖 Autonomous | Operate end-to-end — human monitors outcomes |

Scored dimensions: **Test Coverage · Security · CI/CD · Documentation · Technical Debt · Type Safety**

Output: `legibly/AI_READINESS.md`

---

## The context bundle

Run `legibly analyse` once. Get a complete, queryable picture of your codebase:

| File | What it is |
|------|-----------|
| `legibly/onboarding.md` | System overview — what it does, where to start, critical paths, failure points, domain glossary |
| `legibly/SERVICE_RELATIONSHIP_MAP.md` | Cross-module dependency map with risk levels |
| `legibly/REPOS_TOUCHED.md` | Blast radius lookup — "if you change X, also check Y" |
| `legibly/ALIAS_RESOLUTION.md` | Name disambiguation — maps every alias and legacy name to its canonical module |
| `legibly/PROXY_CHAINS.md` | Multi-hop dependency chains — A → B → C blast radius paths |
| `legibly/AI_READINESS.md` | AI Readiness Score — safe zones, hard blockers, what to fix to go further |
| `legibly/annotations.json` | Persistent team notes — added via `legibly annotate`, merged into service docs |
| `legibly/services/*.md` | Per-module doc — owns, failure points, implicit assumptions, env vars, `beforeYouTouch` list |
| `legibly/specs/*.md` | Compact AI-agent-ready context cards (structured for RAG / tool use) |
| `legibly/runbooks/*.md` | Operational runbook — deploy, rollback, debug guide for each module |

Commit the `legibly/` directory. Your team and every AI tool you add shares the same baseline — no onboarding gap, no hallucinations from missing context.

---

## AI tool integration

### MCP server

`legibly serve` exposes the full context bundle as queryable tools via the [Model Context Protocol](https://modelcontextprotocol.io). Add it to Claude Code, Cursor, or any MCP-compatible client:

```json
{
  "mcpServers": {
    "legibly": {
      "command": "npx",
      "args": ["legibly", "serve"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

| Tool | What it does |
|------|-------------|
| `get_overview` | System onboarding guide |
| `list_services` | All modules with risk levels |
| `get_service(name)` | Full module doc — failure points, assumptions, env vars, team notes |
| `get_repos_touched(service?)` | Blast radius lookup |
| `get_assessment` | AI Readiness Score and safe zones |
| `search(query)` | Search across all docs and specs |
| `annotate(service, note)` | Record a team learning |

### Specs for RAG

`legibly/specs/` contains compact, structured context cards for each module — designed for RAG pipelines and LLM tool use.

Example `CLAUDE.md` for your project:
```markdown
Codebase context lives in ./legibly/. Start with onboarding.md, then check
the relevant service doc in services/ before touching any module.
Use REPOS_TOUCHED.md before any cross-module change.
```

---

## Quick start

```bash
npm install -g legibly
cd your-project
legibly init          # creates legibly.config.json
legibly assess        # AI Readiness Score — no API key needed
legibly analyse       # full analysis and context bundle
```

Set your API key before running `analyse`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # Anthropic (default — uses claude-sonnet-4-5)
export OPENAI_API_KEY=sk-...          # or OpenAI (uses gpt-4o)
```

---

## Configuration

`legibly.config.json` (all fields optional — sensible defaults):

```json
{
  "source": "./src",
  "ignore": ["node_modules", "dist", "*.test.js"],
  "language": "auto",
  "provider": "anthropic",
  "apiKey": "env:ANTHROPIC_API_KEY",
  "concurrency": 3,
  "output": "./legibly"
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `source` | `./src` | Directory to analyse |
| `ignore` | `["node_modules","dist","*.test.js","*.spec.js"]` | Glob patterns to exclude |
| `language` | `auto` | `auto` detects per file. Or fix to: `nodejs`, `typescript`, `python`, `php`, `java`, `go` |
| `provider` | `anthropic` | `anthropic` or `openai` |
| `apiKey` | *(env fallback)* | API key or `"env:VAR_NAME"` reference |
| `concurrency` | `3` | Parallel LLM requests |
| `output` | `./legibly` | Output directory |

---

## Commands

```bash
legibly init                    # Create legibly.config.json
legibly analyse                 # Full analysis — crawl, chunk, analyse, stitch, write
legibly analyse --force         # Ignore checkpoint, start fresh
legibly analyse --stitch-only   # Re-run docs from cached chunk results (no LLM calls)
legibly analyse --watch         # Watch mode — re-analyse on file changes
legibly assess                  # AI Readiness Score (no API calls, instant)

legibly annotate "<module>" "<note>"          # Record a team learning
legibly annotate "<module>" "<note>" --author "Alex"
legibly annotate --list                       # List all annotations

legibly platform [workspace]    # Cross-repo view (scans workspace for legibly outputs)
legibly platform --output ./docs

legibly serve                   # Start MCP server for AI agent access
```

### Resuming interrupted runs

Large codebases can take time. If `legibly analyse` is interrupted, the checkpoint is preserved in `.legibly-cache/`. Re-running resumes from where it stopped — only unfinished chunks are re-processed.

### Team annotations

Record learnings during debugging so neither humans nor AI agents repeat the same mistakes:

```bash
legibly annotate "Payment" "Always call clearPendingState() before retrying — idempotency is not guaranteed"
legibly annotate "Auth" "Token expiry differs between environments — test both before shipping"
```

Annotations merge into service docs on the next `legibly analyse --stitch-only`.

### Multi-repo platform map

If multiple repos each have a `legibly/` output, synthesise a cross-repo view:

```bash
cd ~/Developer          # workspace containing repo-a/, repo-b/, repo-c/
legibly platform .      # reads */legibly/graph.json, writes PLATFORM_MAP.md
```

---

## Supported languages

`auto` mode detects all of these per file:

- Node.js / JavaScript
- TypeScript
- Python
- PHP
- Java
- Go

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

MIT
