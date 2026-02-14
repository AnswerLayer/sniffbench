# Handoff Notes

## What was done

### SDK empty response fix (`2e481c4`)

**Root cause:** The opencode SDK's `createOpencodeServer` spawns `opencode serve` without passing a `cwd` option to `spawn()`. The server inherits the parent process's working directory and uses that as its project context. When the sniffbench runner creates a temp directory (via `mkdtempSync`) and passes it as `directory` in `session.create()`, the SDK silently returns an empty `{}` — no error, no parts, no info. This only happens for directories that opencode doesn't recognize as a project.

**Fix:** Bypass the SDK's `createOpencodeServer` entirely. Instead, spawn `opencode serve` ourselves with `cwd` set to the case's working directory, then connect using `createOpencodeClient`. This ensures the server treats the temp dir as its project root.

**Verification:** Tested with bootstrap-003 (trivial) and bootstrap-005 (binary search from `pass` stub) — both run successfully.

### Rubric false-pass fixes

The default rubric had multiple paths that silently passed when evaluation wasn't actually performed:

1. **`defaults.ts` line 33:** Test command chain `npm test || pytest || go test || echo "No test runner found"` — the `echo` fallback exits 0, so "no tests ran" counted as "all tests passed". Changed to `|| exit 1`.

2. **`runner.ts` lines 334-341:** Pattern evaluator (used for security checks like hardcoded secrets) was stubbed as `passed: true, score: 1.0`. Changed to `passed: false, score: 0.0` — unimplemented checks should fail, not pass.

3. **`runner.ts` lines 342-348:** Unknown evaluator types (llm_judge, benchmark, etc.) were also stubbed as passing. Changed to fail by default.

4. **`runner.ts` line 367:** When a criterion has only optional evaluators (evaluatorCount === 0), the score defaulted to `1.0` — a perfect score for doing nothing. Changed to `0.0`.

### Other fixes in the opencode agent
- Hardcoded `/opt/homebrew/bin/opencode` → PATH-resolved `opencode`
- Variable shadowing: inner `startTime` renamed to `toolStart`, outer to `runStartTime`
- Added null guards on `response.info` and `toolPart.state`
- Single-pass part iteration (was iterating parts twice)
- Cache tokens now read from `info.tokens.cache.read/write`
- Added `cp` step to build script for `.mjs` ESM wrapper (tsc doesn't copy it)

### Test runner discovery doesn't match case file naming

The default rubric runs `npm test || pytest || go test || exit 1` for correctness. But the bootstrap cases name their test files `*.test.py` (e.g., `binary_search.test.py`), which pytest doesn't discover by default — it expects `test_*.py` or `*_test.py`. So even when the agent writes correct code, the rubric can't verify it.

Options:
- Rename test files to pytest convention: `test_binary_search.py`
- Have cases specify inline rubrics with `python <testfile>` as the command
- Add `python *.test.py` to the default rubric's command chain

This is why bootstrap-005 scored 0% despite the agent likely producing a working implementation — the rubric literally couldn't run the tests.

## Still TODO for the other agent

### Test cases need work

- **bootstrap-003 (python-unit-test):** The "buggy" implementation already passes all tests — `text.split()` handles every edge case the tests check. Either make the starter code actually broken (e.g., `text.split(' ')` which fails on multiple spaces/newlines) or add tests the current impl fails (e.g., punctuation stripping).

- **bootstrap-007 (csv-parser):** CodeRabbit flagged that the YAML block-scalar indentation embeds leading whitespace in the CSV test data. Parsed values will be `'        Alice'` not `'Alice'`, so assertions will fail. Either dedent the data or use `textwrap.dedent()`.

### CodeRabbit review items not yet addressed

From PR #48 review:
- Unused `randombytes` dependency in package.json — not imported anywhere
- Redundant `allowSyntheticDefaultImports` in tsconfig.json — already implied by `esModuleInterop: true`
- Redundant `"dist/**/*"` in tsconfig exclude — `"dist"` already covers the tree

### Model config is hardcoded

The local-glm provider config (base URL, model path, API key) is embedded directly in `src/agents/opencode.ts`. This works for local testing but should be externalized — either read from the opencode config file or accept it as constructor options from a config file.

## SDK response structure reference

For future work on the opencode agent, here's the actual response shape from `client.session.prompt()`:

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
