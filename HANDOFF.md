# Handoff Notes

## Current state

The `add-glm-agent` branch (PR #48) adds an opencode agent integration to sniffbench. It works end-to-end: spawns an opencode server, sends prompts via the SDK, streams events via SSE, captures tool calls and file snapshots, evaluates with the rubric, and saves results.

**To test:**
```bash
pnpm run build
npx sniff run --agent opencode --cases bootstrap-005
```

## What's next

### 1. Bootstrap test cases need work
- **bootstrap-003 (python-unit-test):** No-op — starter code already passes all tests. Make it actually buggy (e.g., `text.split(' ')` instead of `text.split()`).
- **bootstrap-007 (csv-parser):** YAML block-scalar indentation embeds leading whitespace in CSV test data. Assertions will fail.

### 2. CodeRabbit review items
- Remove unused `randombytes` dependency from package.json
- Remove redundant `allowSyntheticDefaultImports` from tsconfig.json
- Remove redundant `"dist/**/*"` from tsconfig exclude

### 3. Hardcoded model config
The local-glm provider config (baseURL, model path, API key) is hardcoded in `src/agents/opencode.ts` constructor default. Should be externalized — read from opencode config file or a sniffbench config file.

## Key technical details

- **ESM wrapper:** The `@opencode-ai/sdk` is ESM-only but the project is CommonJS. The `.mjs` wrapper in `src/agents/opencode-sdk.mjs` bridges this. tsc doesn't copy `.mjs` files, so the build script includes a manual `cp` step.
- **Port management:** `nextPort` counter in opencode.ts increments per run to avoid collisions. Resets on process restart.
- **Server lifecycle:** Each agent run spawns a real opencode server process on a unique port, with the case's temp dir as cwd. The server is killed in the `finally` block.
- **Event streaming:** Uses `client.event.subscribe()` (SSE) + `session.promptAsync()`. The stream object is at `sseResult.stream` (not `.data`). Events arrive as `message.part.updated` (tool calls, text, reasoning), `message.updated` (final tokens/cost), `session.status` (idle = done).
- **File snapshots:** After agent runs, `snapshotFiles()` in runner.ts walks the host tempDir and captures all files with a `changed` flag vs originals. Skips node_modules, .git, __pycache__, files >100KB.
- **Score math:** `weightedScore = rawScore * weight / 100`. Overall score normalizes by participating weight fraction so excluded optional-only criteria don't affect the result.

## Git conventions
- Do NOT include `Co-Authored-By` or Anthropic email in commits
- Include model version (e.g., `claude-opus-4-6`) in commit body if desired
- Never amend commits — always create new ones
