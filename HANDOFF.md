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

9. **Implemented event streaming** — Switched from `session.prompt()` (blocking, returns only final message) to `session.promptAsync()` + `client.event.subscribe()` (SSE). Now captures all intermediate tool calls, text deltas, reasoning, and step-finish events in real-time. Falls back to fetching final messages if the stream didn't capture the answer text.

10. **Implemented sandbox file snapshots** — After agent runs, before rubric evaluation, walks the workspace directory and captures all files. Compares against original case files to flag `changed: true/false`. Results JSON now includes `agentFiles` array with `{ path, content, changed }`. Skips `node_modules`, `.git`, `__pycache__`, and files over 100KB.

## What's next (not yet done)

### 1. Bootstrap test cases need work
- **bootstrap-003 (python-unit-test):** No-op — starter code already passes all tests. Make it actually buggy (e.g., `text.split(' ')` instead of `text.split()`).
- **bootstrap-007 (csv-parser):** YAML block-scalar indentation embeds leading whitespace in CSV test data. Assertions will fail.

### 2. CodeRabbit review items
- Remove unused `randombytes` dependency from package.json
- Remove redundant `allowSyntheticDefaultImports` from tsconfig.json
- Remove redundant `"dist/**/*"` from tsconfig exclude

### 3. Hardcoded model config
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

**Important:** This was the old approach. We now use `promptAsync()` + `event.subscribe()` instead.

### Event streaming (current approach)

```
// Subscribe to SSE events first
const eventResult = await client.event.subscribe({});

// Send prompt asynchronously (returns immediately)
await client.session.promptAsync({ path: { id }, body: { parts: [...] } });

// Process events until session goes idle
for await (const event of eventResult.data) {
  // event.type: "message.part.updated" | "message.updated" | "session.status" | ...
  // event.properties.part.type: "text" | "tool" | "reasoning" | "step-finish"
  // event.properties.part.state.status: "pending" | "running" | "completed" | "error"
}
```

Key event types: `message.part.updated` (tool calls, text, reasoning), `message.updated` (final message with tokens/cost), `session.status` (idle = done).

## Key technical details

- **ESM wrapper:** The `@opencode-ai/sdk` is ESM-only but the project is CommonJS. The `.mjs` wrapper in `src/agents/opencode-sdk.mjs` bridges this. tsc doesn't copy `.mjs` files, so the build script includes a manual `cp` step.
- **Port management:** `nextPort` counter in opencode.ts increments per run to avoid collisions. Resets on process restart.
- **The SDK spawns a real opencode server process** per agent run. Each run gets its own server on a unique port, with the case's temp dir as cwd. The server is killed in the `finally` block.
- **Score math:** `weightedScore = rawScore * weight / 100`. Overall score normalizes by participating weight fraction so excluded optional-only criteria don't affect the result.

## Git conventions
- Do NOT include `Co-Authored-By` or Anthropic email in commits
- Include model version (e.g., `claude-opus-4-6`) in commit body if desired
- Never amend commits — always create new ones
