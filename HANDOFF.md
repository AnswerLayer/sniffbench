# Handoff Notes

## Current state

The `add-glm-agent` branch (PR #48) adds an opencode agent integration to sniffbench. It works end-to-end: spawns an opencode server, sends prompts via the SDK, streams events via SSE, captures tool calls and file snapshots, evaluates with the rubric, and saves results.

**To test:**
```bash
pnpm run build
npx sniff run --agent opencode --cases bootstrap-005
npx sniff closed-issues run --agent opencode --local
```

## Test results (GLM-4.7-4bit via opencode)

### Bootstrap cases

| Case | Score | Verdict | Notes |
|------|-------|---------|-------|
| bootstrap-003 (Python Unit Tests) | 100% | **False pass** | Starter code already passes all tests — no-op |
| bootstrap-004 (Palindrome Checker) | 0% | Fail | Agent edited file but tests failed. JS test runner (`node *.test.js`) was missing from rubric command chain — now fixed |
| bootstrap-005 (Binary Search) | 100% | **Legit pass** | Agent implemented full binary search from `pass` stub |
| bootstrap-006 (Refactor Bad Code) | 0% | Fail | Agent refactored and renamed function `c`, breaking `require('./shipping_calculator').c` in test file. Also hit missing JS test runner issue |
| bootstrap-007 (CSV Parser) | 100% | **Legit pass** | Agent implemented CSV parser from empty `return []` stub |
| simple-001 (Simple math) | 0% | Fail | Code already passes — should be free win. Failed because JS test runner was missing from rubric |
| fail-001 (Intentionally failing) | 0% | Expected fail | Case exists to verify failure reporting works |

**Key fix:** Added `node *.test.js` to the test command chain in `defaults.ts`. All JS cases were failing because the rubric only tried `npm test` (no package.json) then fell through to Python/Go runners.

### Closed-issues cases (real GitHub issues)

| Case | Score | Notes |
|------|-------|-------|
| #12 (Add --compare flag) | 10/100 | 0 files changed. Agent explored but produced no edits. Hard task: 363 additions across 2 files |
| #38 (Split variant/variants) | 10/100 | Created new `variants.ts` instead of modifying existing files. Understood intent but wrong approach |

These are significantly harder than bootstrap cases — require understanding a real codebase and making coordinated multi-file changes. Likely beyond a 4-bit quantized local model's capability.

## What's next

### 1. Bootstrap test cases need work
- **bootstrap-003 (python-unit-test):** No-op — starter code already passes all tests. Make it actually buggy (e.g., `text.split(' ')` instead of `text.split()`).
- **bootstrap-006 (refactor):** Test file imports `c` by name. If the agent renames it (the whole point of refactoring), tests break. Either update tests to import by new name, or make the test more flexible.

### 2. Re-run JS cases
After the `node *.test.js` fix, bootstrap-004 and simple-001 should be re-run to get accurate scores.

### 3. CodeRabbit review items
- Remove unused `randombytes` dependency from package.json
- Remove redundant `allowSyntheticDefaultImports` from tsconfig.json
- Remove redundant `"dist/**/*"` from tsconfig exclude

### 4. Hardcoded model config
The local-glm provider config (baseURL, model path, API key) is hardcoded in `src/agents/opencode.ts` constructor default. Should be externalized — read from opencode config file or a sniffbench config file.

### 5. Comprehension cases
The 12 comp-* cases reference a `comprehension` rubric that doesn't exist yet. These are Q&A tasks that need LLM-judge or human evaluation, not test suites.

## Key technical details

- **ESM wrapper:** The `@opencode-ai/sdk` is ESM-only but the project is CommonJS. The `.mjs` wrapper in `src/agents/opencode-sdk.mjs` bridges this. tsc doesn't copy `.mjs` files, so the build script includes a manual `cp` step.
- **Port management:** `nextPort` counter in opencode.ts increments per run to avoid collisions. Resets on process restart.
- **Server lifecycle:** Each agent run spawns a real opencode server process on a unique port, with the case's temp dir as cwd. The server is killed in the `finally` block.
- **Event streaming:** Uses `client.event.subscribe()` (SSE) + `session.promptAsync()`. The stream object is at `sseResult.stream` (not `.data`). Events arrive as `message.part.updated` (tool calls, text, reasoning), `message.updated` (final tokens/cost), `session.status` (idle = done).
- **File snapshots:** After agent runs, `snapshotFiles()` in runner.ts walks the host tempDir and captures all files with a `changed` flag vs originals. Skips node_modules, .git, __pycache__, files >100KB.
- **Agent config:** `DEFAULT_AGENT` constant in `src/agents/registry.ts` is used across all CLI commands. No more hardcoded `'claude-code'` strings.
- **Closed-issues runner:** Now routes through agent wrappers (supports `--agent` and `--model` flags) instead of shelling out directly to `claude` CLI.

## Git conventions
- Do NOT include `Co-Authored-By` or Anthropic email in commits
- Include model version (e.g., `claude-opus-4-6`) in commit body if desired
- Never amend commits — always create new ones
