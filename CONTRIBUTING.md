# Contributing to Legibly

Thanks for your interest in contributing. Here's what you need to know.

## Development setup

```bash
git clone https://github.com/prayasjain/legibly.git
cd legibly
npm install
npm run build
```

Run the tests:
```bash
npm test
```

Run in watch mode during development:
```bash
npm run test:watch
```

## Project structure

```
src/
  config/       Config loading and validation (cosmiconfig + zod)
  crawler/      File walker + language detection
    languages/  Per-language import resolver (nodejs, typescript, python, php, java, go)
  chunker/      Import graph builder (union-find) → logical chunk grouping
  analyser/     Per-chunk LLM analysis
    prompts/    Prompt builders for chunk analysis and stitching
  checkpoint/   Resumable run state (JSON on disk)
  stitcher/     System-level synthesis from chunk analyses
  assessor/     AI readiness scoring across 6 dimensions (no API calls)
  writer/       Markdown doc generators (onboarding, services, specs, runbooks, etc.)
  watcher/      File watch mode (chokidar)
  cli/          Commander.js entry points
```

## Adding a new language

1. Create `src/crawler/languages/<lang>.ts` implementing the `LanguageConfig` interface:

```typescript
import type { LanguageConfig } from './types.js'

export const myLangConfig: LanguageConfig = {
  extensions: ['.ext'],
  importResolver: (line: string, filePath: string) => {
    // Return the resolved import path if the line is an import, else null
  },
}
```

2. Register it in `src/crawler/languages/index.ts`.

3. Add the language name to the `language` enum in `src/config/index.ts`.

4. Add tests in `src/crawler/languages/__tests__/`.

## Adding a new AI provider

Legibly uses the [Vercel AI SDK](https://sdk.vercel.ai/). Any provider with a compatible SDK package can be added:

1. Add the provider enum value to `src/config/index.ts`.
2. Add the `buildModel` case in `src/analyser/index.ts` and `src/stitcher/index.ts`.
3. Add the env var fallback in `src/config/index.ts`.

## Running against a real codebase

```bash
cd your-project
node /path/to/legibly/dist/cli/index.js analyse
```

Or link the package locally:
```bash
cd legibly && npm link
cd your-project && legibly analyse
```

## Adding a new MCP tool

MCP tools are defined in `src/mcp/index.ts` using `server.tool(name, description, schema, handler)`. Each tool reads from the `legibly/` output directory — no AI calls, just file reads.

## Adding a new output document

1. Create `src/writer/<name>.ts` with a `render<Name>(system: SystemAnalysis): string` function.
2. Import and call it in `src/writer/index.ts` — add the output path to `WrittenFiles` and `writeOutput`.
3. Add the filename to the `allRelativeFiles` array so it appears in `freshness.json`.

## Pull requests

- Keep PRs focused — one thing at a time.
- All tests must pass: `npm test`.
- Build must be clean: `npm run build`.
- No new dependencies without discussion.

## Reporting bugs

Open an issue at https://github.com/prayasjain/legibly/issues with:
- The command you ran
- The error message or unexpected output
- Your `legibly.config.json` (redact the API key)
- Node.js version (`node --version`)
