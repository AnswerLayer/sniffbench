# Run Tracking

Runs are the core unit of evaluation in sniffbench. Every interview creates a run that captures results alongside the agent configuration that produced them.

## What is a Run?

A run is a single evaluation session containing:

1. **Metadata**: ID, optional label, timestamp
2. **Agent Configuration**: Full snapshot at run time
3. **Case Results**: Answers, grades, and metrics for each case

```
Run: run-1734567890-abc123
├── ID: run-1734567890-abc123
├── Label: "baseline" (optional)
├── Created: 2025-12-11T22:59:36Z
├── Agent Config:
│   ├── name: claude-code
│   ├── version: 2.0.55
│   ├── model: claude-sonnet-4-20250514
│   ├── claudeMdHash: 8b28a4e5...
│   ├── mcpServers: { Linear: stdio }
│   ├── allowedTools: ["Bash(osgrep:*)"]
│   ├── variantId: var-123... (if linked)
│   └── thinkingEnabled: true
└── Cases:
    ├── comp-001:
    │   ├── answer: "The authentication flow..."
    │   ├── grade: 8
    │   ├── gradedBy: human
    │   └── behaviorMetrics: { tokens: 10959, cost: 0.12, ... }
    └── comp-002:
        └── ...
```

## Creating Runs

Every `sniff interview` creates a run automatically.

### Without Label

```bash
sniff interview
```

Creates a run with auto-generated ID like `run-1734567890-abc123`.

### With Label

```bash
sniff interview --run "baseline"
```

Creates a run with the label "baseline" for easy reference.

### Partial Runs

If you quit early (Ctrl+C or 'q'), the run is still saved with whatever cases were completed.

## Commands

### List Runs

```bash
sniff runs list

# As JSON
sniff runs list --json
```

Output:

```
╭─ Runs ─────────────────────────────────────────────────────────────────╮
│ 3 runs                                                                  │
│                                                                         │
│ ID                    Label       Date          Agent     Cases  Grade  │
│ ───────────────────────────────────────────────────────────────────────│
│ run-1734567891-def456 experiment  Dec 11, 2025  claude    5/5    9.0/10 │
│ run-1734567890-abc123 baseline    Dec 11, 2025  claude    5/5    8.5/10 │
│ run-1734567889-xyz789 (none)      Dec 10, 2025  claude    3/5    7.0/10 │
╰─────────────────────────────────────────────────────────────────────────╯
```

### Show Run Details

```bash
# By full ID
sniff runs show run-1734567890-abc123

# By label
sniff runs show baseline

# By partial ID (if unique)
sniff runs show run-173456

# As JSON
sniff runs show baseline --json
```

Output:

```
╭─ Run: run-1734567890-abc123 ─────────────────────────────────────────╮
│ Run Details                                                           │
│                                                                       │
│ ID: run-1734567890-abc123                                             │
│ Label: baseline                                                       │
│ Created: Dec 11, 2025, 07:34 PM                                       │
│                                                                       │
│ Agent Configuration:                                                  │
│ Agent: claude-code                                                    │
│ Version: 2.0.55                                                       │
│ Model: claude-sonnet-4-20250514                                       │
│ CLAUDE.md: 8b28a4e5...                                                │
│ MCP Servers: Linear(stdio)                                            │
│ Thinking: enabled                                                     │
│ Variant: control                                                      │
│                                                                       │
│ Summary:                                                              │
│ Cases: 5/5 graded                                                     │
│ Average Grade: 8.5/10                                                 │
╰───────────────────────────────────────────────────────────────────────╯

  Case Results:

  Case ID        Grade    Graded By    Notes
  ──────────────────────────────────────────────────────
  comp-001       8/10     human        Good overview
  comp-002       9/10     human        Excellent detail
  comp-003       8/10     human        -
```

### Delete Run

```bash
# Interactive confirmation
sniff runs delete run-1734567890-abc123

# By label
sniff runs delete baseline

# Skip confirmation
sniff runs delete baseline --force
```

## Agent Configuration

Every run captures comprehensive agent configuration.

### Basic Fields

| Field | Source | Example |
|-------|--------|---------|
| `name` | Agent type | `claude-code` |
| `version` | `claude --version` | `2.0.55` |
| `model` | API response | `claude-sonnet-4-20250514` |

### CLAUDE.md Tracking

```
claudeMdHash: 8b28a4e560654a1a645bc50b99093ced57cb35...
```

The hash changes when you edit CLAUDE.md, letting you track prompt changes.

### MCP Servers

```json
"mcpServers": {
  "Linear": { "type": "stdio", "enabled": true },
  "github": { "type": "sse", "enabled": true }
}
```

Captures which MCP servers are configured (type and enabled status only, no secrets).

### Tool Allowlists

```json
"allowedTools": ["Bash(osgrep:*)", "Bash(git:*)"],
"disallowedTools": ["Bash(rm:*)"]
```

### Other Settings

```json
"permissionMode": "default",
"thinkingEnabled": true
```

## Behavior Metrics

Each case result includes behavior metrics:

```json
"behaviorMetrics": {
  "totalTokens": 10959,
  "inputTokens": 8000,
  "cacheReadTokens": 5000,
  "cacheWriteTokens": 2000,
  "toolCount": 15,
  "readCount": 8,
  "costUsd": 0.12,
  "explorationRatio": 0.8,
  "cacheHitRatio": 0.45,
  "avgToolDurationMs": 250,
  "tokensPerTool": 730,
  "tokensPerRead": 1370
}
```

### Metrics Explained

| Metric | Description | Good Value |
|--------|-------------|------------|
| `totalTokens` | Total tokens consumed | Lower is better |
| `toolCount` | Number of tool calls | Fewer = more efficient |
| `readCount` | File read operations | Indicates exploration |
| `costUsd` | Estimated API cost | Lower is better |
| `explorationRatio` | Read tools / total tools | ~0.7-0.9 for comprehension |
| `cacheHitRatio` | Cache reads / total input | Higher is better |
| `tokensPerTool` | Avg tokens per tool call | Lower = efficient tools |

## Comparing Runs

```bash
sniff compare <run1> <run2>
```

See [USAGE.md](USAGE.md#comparing-results) for detailed comparison output.

## Variant Linking

Runs can be linked to variants for better tracking.

### Automatic Linking

If your config matches a registered variant, runs auto-link:

```bash
sniff interview
#   Auto-linked to variant: control
```

### Explicit Linking

Force link to a specific variant:

```bash
sniff interview --variant control
```

### Viewing Links

```bash
sniff runs show baseline
# ... output includes ...
# Variant: control
```

## Storage

Runs are stored in `.sniffbench/runs.json`:

```json
{
  "version": "2.0",
  "repoPath": "/path/to/project",
  "createdAt": "2025-12-11T00:00:00.000Z",
  "runs": {
    "run-1734567890-abc123": {
      "id": "run-1734567890-abc123",
      "label": "baseline",
      "createdAt": "2025-12-11T22:59:36.054Z",
      "agent": {
        "name": "claude-code",
        "version": "2.0.55",
        "model": "claude-sonnet-4-20250514",
        "claudeMdHash": "8b28a4e5...",
        "mcpServers": { ... },
        "variantId": "var-123..."
      },
      "cases": {
        "comp-001": {
          "answer": "The authentication flow...",
          "grade": 8,
          "gradedAt": "2025-12-11T23:05:00.000Z",
          "gradedBy": "human",
          "behaviorMetrics": { ... }
        }
      }
    }
  }
}
```

## Migration

If you have old `baselines.json` files, they're automatically migrated:

1. First command detects legacy format
2. Creates a "migrated-baseline" run with old data
3. Preserves original file as backup

## ID Resolution

Commands accept multiple ID formats:

| Format | Example |
|--------|---------|
| Full ID | `run-1734567890-abc123` |
| Label | `baseline` |
| Partial ID | `run-173456` (if unique) |

If a label matches multiple runs, the most recent is used.

## Best Practices

### 1. Always Use Labels for Important Runs

```bash
# Good
sniff interview --run "pre-refactor"
sniff interview --run "post-refactor"

# Less useful
sniff interview  # Just gets auto-ID
```

### 2. Register Variants First

Before important evaluations, register your config:

```bash
sniff variant register "my-config"
sniff interview --run "test-1"  # Auto-links to "my-config"
```

### 3. Run Multiple Times

For statistical significance, run the same test multiple times:

```bash
sniff interview --run "baseline-1"
sniff interview --run "baseline-2"
sniff interview --run "baseline-3"
```

### 4. Keep Runs Organized

Use consistent naming:

```bash
# By variant
sniff interview --run "control-1"
sniff interview --run "treatment-1"

# By date
sniff interview --run "2025-12-11-morning"

# By purpose
sniff interview --run "pre-deploy-check"
```

## Related

- [Variant System](VARIANTS.md)
- [Usage Guide](USAGE.md)
