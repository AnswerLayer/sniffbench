# Handoff Notes

## What was accomplished

### PR #48: add-glm-agent branch

Starting from the other agent's work (opencode SDK integration + 5 bootstrap test cases), we:

1. **Fixed the SDK empty response blocker** — Root cause: the SDK's `createOpencodeServer` spawns `opencode serve` without passing `cwd`. The server inherits the parent's working directory. When the runner passes a temp dir via `session.create({ directory })`, the SDK silently returns `{}` for non-project directories. Fix: spawn the server ourselves with `cwd` set to the case directory, then connect with `createOpencodeClient`.

2. **Fixed false-pass rubric** — Multiple paths silently passed when evaluation wasn't performed:
   - Test command chain fell back to `echo "No test runner found"` (exit 0)
   - Pattern evaluator stub returned `passed: true`
   - Unknown evaluator types returned `passed: true`
   - Criteria with only optional evaluators scored 1.0

3. **Fixed test runner discovery** — Added `python *.test.py` and `python *_test.py` to the command chain so bootstrap cases' test files are found.

4. **Fixed score normalization** — When optional-only criteria are excluded, the percentage was wrong (showed 1% instead of 100%). Fixed formula: `(totalWeightedScore / participatingFraction) * 100`.

5. **Added --model CLI flag** — `npx sniff run --agent opencode --model provider/model-id`

6. **Added agent response saving** — Results JSON now includes `agentResponse`, `agentToolCalls`, `agentModel`, `agentTokens`.

7. **Updated pnpm lockfile** — CI was failing because lockfile was out of date after new deps were added.

8. **Added build copy step** — `.mjs` ESM wrapper wasn't being copied to `dist/` by tsc. Added `cp` to build script.

### Commits on add-glm-agent (ours)
- `2e481c4` — SDK cwd fix, null guards, variable shadowing, PATH resolution
- `1f555b2` — Rubric false-pass fixes, HANDOFF.md
- `16d48e2` — pnpm lockfile, test runner discovery, defaults.ts syntax fix
- `581a80c` — Score normalization fix
- `57749cd` — --model flag, agent response saving

## What's next (not yet done)

### 1. Event streaming from opencode agent
The `session.prompt()` call is single-shot — it returns only the final assistant message. All intermediate tool calls (file reads, writes, test runs) happen inside the opencode server's agent loop and are invisible to us. `agentToolCalls` comes back empty.

The SDK likely has event streaming capabilities (SSE or similar). Need to investigate:
- Check if `client.session` has a `subscribe` or `events` method
- Look at the SDK's generated types for event-related endpoints
- The opencode server may expose a `/session/{id}/events` endpoint

### 2. Sandbox file snapshots
Before destroying the sandbox, read back the case files and save them in the results. This gives us the actual code the agent produced, which is what we really care about. Approach:
- After agent runs, before rubric evaluation, read all files from sandbox
- Diff against starting files to identify what changed
- Save in results as `agentFiles` or similar

### 3. Bootstrap test cases need work
- **bootstrap-003 (python-unit-test):** No-op — starter code already passes all tests. Make it actually buggy (e.g., `text.split(' ')` instead of `text.split()`).
- **bootstrap-007 (csv-parser):** YAML block-scalar indentation embeds leading whitespace in CSV test data. Assertions will fail.

### 4. CodeRabbit review items
- Remove unused `randombytes` dependency from package.json
- Remove redundant `allowSyntheticDefaultImports` from tsconfig.json
- Remove redundant `"dist/**/*"` from tsconfig exclude

### 5. Hardcoded model config
The local-glm provider config (baseURL, model path, API key) is hardcoded in `src/agents/opencode.ts`. Should be externalized — read from opencode config file or a sniffbench config file.

## SDK response structure reference

From `client.session.prompt()`:

```
promptResult.data = {
  info: {
    id, sessionID, role, time: { created, completed },
    modelID, providerID, cost,
    tokens: { total, input, output, reasoning, cache: { read, write } },
    finish: "stop"
  },
  parts: [
    { type: "step-start", snapshot },
    { type: "reasoning", text, time: { start, end } },
    { type: "text", text, time: { start, end } },
    { type: "tool", tool, callID, state: { status: "pending"|"completed" } },
    { type: "step-finish", reason, snapshot, cost, tokens }
  ]
}
```

**Important:** This is the FINAL message only. Intermediate steps (tool calls, file edits) happen inside the opencode server and are NOT returned here. The `parts` array for a typical run contains `step-start`, maybe `reasoning`, a `text` summary, and `step-finish` — no tool parts because tools were used in earlier turns.

## Key technical details

- **ESM wrapper:** The `@opencode-ai/sdk` is ESM-only but the project is CommonJS. The `.mjs` wrapper in `src/agents/opencode-sdk.mjs` bridges this. tsc doesn't copy `.mjs` files, so the build script includes a manual `cp` step.
- **Port management:** `nextPort` counter in opencode.ts increments per run to avoid collisions. Resets on process restart.
- **The SDK spawns a real opencode server process** per agent run. Each run gets its own server on a unique port, with the case's temp dir as cwd. The server is killed in the `finally` block.
- **Score math:** `weightedScore = rawScore * weight / 100`. Overall score normalizes by participating weight fraction so excluded optional-only criteria don't affect the result.

## Git conventions
- Do NOT include `Co-Authored-By` or Anthropic email in commits
- Include model version (e.g., `claude-opus-4-6`) in commit body if desired
- Never amend commits — always create new ones
