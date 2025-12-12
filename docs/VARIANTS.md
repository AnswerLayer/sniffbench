# Variant System

Variants enable scientific A/B testing of agent configurations. This guide explains how they work and when to use them.

## Concept

A **variant** is a named snapshot of your agent configuration at a specific point in time. Think of it like a git tag for your AI setup.

```
Variant: "control"
├── Agent: claude-code 2.0.55
├── CLAUDE.md: sha256:8b28a4e5...
├── MCP Servers: (none)
├── Allowed Tools: (none)
└── Registered: 2025-12-11
```

## Why Use Variants?

### The Problem

Without variants, you might run:

```bash
sniff interview --run "before"
# ... make changes ...
sniff interview --run "after"
sniff compare before after
```

The comparison shows metrics changed, but:
- What exactly changed in your config?
- Was it the MCP server? The CLAUDE.md update? Both?
- Can you reproduce the "before" state?

### The Solution

With variants:

```bash
sniff variant register "control"        # Snapshot current config
# ... make changes ...
sniff variant register "treatment"      # Snapshot new config
sniff variant diff control treatment    # See exactly what changed
```

Now your runs are linked to variants, and you know exactly what config produced each result.

## Workflow

### Scientific A/B Testing

```bash
# 1. Establish baseline
sniff variant register "control" -d "Stock Claude Code"
sniff interview --run "control-1"
sniff interview --run "control-2"
sniff interview --run "control-3"

# 2. Make ONE change
# Example: Add an MCP server to ~/.claude.json

# 3. Register treatment
sniff variant register "with-linear" \
  -d "Added Linear MCP server" \
  --changes "Added Linear MCP to project config"

# 4. Run treatment tests
sniff interview --run "treatment-1"
sniff interview --run "treatment-2"
sniff interview --run "treatment-3"

# 5. Analyze
sniff compare control-1 treatment-1
sniff variant diff control with-linear
```

### Iterative Improvement

```bash
# Version your configs as you improve
sniff variant register "v1" -d "Initial setup"
# ... iterate ...
sniff variant register "v2" -d "Tuned prompts"
# ... iterate ...
sniff variant register "v3" -d "Added semantic search"

# Compare any two versions
sniff variant diff v1 v3
```

## Commands

### Register

```bash
sniff variant register <name> [options]

Options:
  -d, --description <text>    Description of the variant
  -c, --changes <items...>    List of changes in this variant
```

Examples:

```bash
# Simple
sniff variant register "baseline"

# With description
sniff variant register "control" -d "Stock configuration"

# With declared changes
sniff variant register "experiment" \
  -d "Testing Linear integration" \
  -c "Added Linear MCP" "Updated CLAUDE.md prompts"
```

### List

```bash
sniff variant list [--json]
```

### Show

```bash
sniff variant show <name|id> [--json]
```

### Diff

Compare configuration between two variants (no run data needed):

```bash
sniff variant diff <variant1> <variant2> [--json]
```

Output:

```
Variants:
  Variant 1: control (var-176549966521)
  Variant 2: with-linear (var-176550029989)

Variant 2 Declared Changes:
  - Added Linear MCP server

Configuration Differences:
  MCP: Linear: none → stdio
  Allowed Tools: none → 1 tools
```

### Delete

```bash
sniff variant delete <name|id> [--force]
```

## What Gets Captured

| Field | Source | Purpose |
|-------|--------|---------|
| `name` | User provided | Human-readable identifier |
| `version` | `claude --version` | Track agent updates |
| `claudeMdHash` | SHA256 of CLAUDE.md | Detect prompt changes |
| `mcpServers` | `~/.claude.json` | Track MCP integrations |
| `allowedTools` | `~/.claude.json` | Track tool permissions |
| `disallowedTools` | `~/.claude.json` | Track blocked tools |
| `permissionMode` | Settings | Track permission level |
| `thinkingEnabled` | Settings | Track thinking mode |

### What's NOT Captured

For security, we don't capture:
- MCP server environment variables (may contain secrets)
- Full MCP server command arguments
- API keys or tokens

## Auto-Linking

When you run an interview, sniffbench automatically links to matching variants.

### How It Works

1. Interview starts, captures current config
2. Computes hash of config (normalized, sorted)
3. Checks all registered variants for matching hash
4. If exactly one matches, auto-links

```bash
sniff interview
#   Auto-linked to variant: control
```

### When Auto-Link Fails

- **No registered variants**: Nothing to link to
- **Config changed**: Hash doesn't match any variant
- **Multiple matches**: Ambiguous (shouldn't happen with unique configs)

Solution: Register your current config as a new variant.

## Storage

Variants are stored in `.sniffbench/variants.json`:

```json
{
  "version": "1.0",
  "repoPath": "/path/to/project",
  "createdAt": "2025-12-11T22:59:36.054Z",
  "variants": {
    "var-1734567890-abc123": {
      "id": "var-1734567890-abc123",
      "name": "control",
      "description": "Stock Claude Code config",
      "createdAt": "2025-12-11T22:59:36.054Z",
      "changes": [],
      "snapshot": {
        "name": "claude-code",
        "version": "2.0.55",
        "model": "unknown",
        "claudeMdHash": "8b28a4e5...",
        "mcpServers": {
          "Linear": { "type": "stdio", "enabled": true }
        },
        "allowedTools": ["Bash(osgrep:*)"],
        "thinkingEnabled": true
      }
    }
  }
}
```

## Best Practices

### 1. Register Before Changes

Always register your current config before making changes:

```bash
sniff variant register "before-change"
# Now make changes
sniff variant register "after-change"
```

### 2. One Change at a Time

For scientific comparison, change one thing at a time:

```bash
# Good: isolated changes
sniff variant register "v1-base"
# Add MCP server
sniff variant register "v2-with-mcp"
# Update CLAUDE.md
sniff variant register "v3-new-prompts"

# Bad: multiple changes at once
sniff variant register "before"
# Add MCP + update prompts + change model
sniff variant register "after"  # Can't tell what helped!
```

### 3. Use Descriptive Names

```bash
# Good
sniff variant register "with-linear-mcp"
sniff variant register "optimized-prompts-v2"

# Less good
sniff variant register "test1"
sniff variant register "new"
```

### 4. Document Changes

Use `--changes` to document what you changed:

```bash
sniff variant register "v2" \
  --description "Performance optimization" \
  --changes "Added caching hints to CLAUDE.md" \
            "Enabled thinking mode"
```

## Limitations

### No Sandboxing (Yet)

Currently, variants only **capture** configuration—they don't **apply** it. To test a different variant, you must manually reconfigure your environment.

This is tracked in [ANS-459: Variant Sandboxing](https://linear.app/answerlayer/issue/ANS-459).

### Project-Scoped

Variants are stored per-project (in `.sniffbench/`). Different projects have different variant registries.

## Related

- [Run Tracking](RUNS.md)
- [Usage Guide](USAGE.md)
