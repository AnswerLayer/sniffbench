# Sniffbench Usage Guide

This guide covers all sniffbench commands and workflows in detail.

## Table of Contents

- [Getting Started](#getting-started)
- [Running Interviews](#running-interviews)
- [Managing Runs](#managing-runs)
- [Using Variants](#using-variants)
- [Comparing Results](#comparing-results)
- [Managing Cases](#managing-cases)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Installation

```bash
# Global install (recommended)
npm install -g sniffbench

# Or from source
git clone https://github.com/answerlayer/sniffbench.git
cd sniffbench
npm install
npm run build
npm link
```

### Verify Installation

```bash
# Check CLI is available
sniff --help

# Run diagnostics
sniff doctor

# Check status in your project
cd /path/to/your/project
sniff status
```

### Project Setup

Sniffbench works in any directory. Data is stored in `.sniffbench/`:

```
your-project/
├── .sniffbench/
│   ├── runs.json       # Run data
│   └── variants.json   # Registered variants
└── ... your code ...
```

## Running Interviews

The `sniff interview` command runs comprehension questions against your agent.

### Basic Interview

```bash
sniff interview
```

This will:
1. Load comprehension cases (12 questions about codebase architecture)
2. Run each question through Claude Code
3. Display the agent's answer
4. Prompt you to grade (1-10)
5. Save results to a new run

### Interview with Label

```bash
sniff interview --run "baseline"
```

Labels make runs easier to reference later:
- `sniff runs show baseline`
- `sniff compare baseline experiment`

### Running Specific Cases

```bash
# Single case
sniff interview --cases comp-001

# Multiple cases
sniff interview --cases comp-001,comp-002,comp-003
```

### Linking to a Variant

```bash
# Explicit variant link
sniff interview --variant control

# Auto-linking (default behavior)
# If your current config matches a registered variant, it auto-links
sniff interview
#   Auto-linked to variant: control
```

### Compare Mode

Compare new responses against existing baselines:

```bash
sniff interview --compare
```

This shows metrics deltas without requiring new grading.

## Managing Runs

Runs store evaluation results along with the agent configuration that produced them.

### List Runs

```bash
sniff runs list

# Output:
# ╭─ Runs ─────────────────────────────────────────────────────────╮
# │ 3 runs                                                          │
# │                                                                 │
# │ ID                    Label      Date         Agent    Grade    │
# │ ─────────────────────────────────────────────────────────────   │
# │ run-1734567890-abc123 baseline   Dec 11, 2025 claude   8.5/10   │
# │ run-1734567891-def456 experiment Dec 11, 2025 claude   9.0/10   │
# ╰─────────────────────────────────────────────────────────────────╯
```

### Show Run Details

```bash
# By ID
sniff runs show run-1734567890-abc123

# By label
sniff runs show baseline

# As JSON (for scripting)
sniff runs show baseline --json
```

Output includes:
- Run metadata (ID, label, date)
- Agent configuration (version, model, MCP servers, tools)
- Per-case results (answer, grade, metrics)

### Delete a Run

```bash
# Interactive confirmation
sniff runs delete run-1734567890-abc123

# Force delete
sniff runs delete baseline --force
```

## Using Variants

Variants are named snapshots of your agent configuration. They enable scientific A/B testing.

### Register a Variant

```bash
# Basic registration
sniff variant register "control"

# With description
sniff variant register "control" --description "Stock Claude Code configuration"

# With declared changes (for documentation)
sniff variant register "with-mcp" \
  --description "Added Linear MCP server" \
  --changes "Added Linear MCP" "Updated CLAUDE.md"
```

### What Gets Captured

When you register a variant, sniffbench captures:

| Field | Source |
|-------|--------|
| Agent name | `claude-code` |
| Version | `claude --version` |
| Model | Last known from runs |
| CLAUDE.md hash | SHA256 of file content |
| MCP servers | `~/.claude.json` project config |
| Allowed tools | `~/.claude.json` project config |
| Disallowed tools | `~/.claude.json` project config |
| Permission mode | `.claude/settings.json` |
| Thinking mode | `~/.claude/settings.json` |

### List Variants

```bash
sniff variant list

# As JSON
sniff variant list --json
```

### Show Variant Details

```bash
sniff variant show control

# Output:
# ╭─ Variant: control ─────────────────────────────────────────────╮
# │ Variant Details                                                 │
# │                                                                 │
# │ ID: var-1734567890-abc123                                       │
# │ Name: control                                                   │
# │ Description: Stock Claude Code configuration                    │
# │ Created: Dec 11, 2025, 07:34 PM                                 │
# │ Config Hash: 3d9b5ca6f87c6cc3                                   │
# │                                                                 │
# │ Configuration Snapshot:                                         │
# │ Agent: claude-code                                              │
# │ Version: 2.0.55                                                 │
# │ Model: unknown                                                  │
# │ MCP Servers: Linear(stdio), linear(stdio)                       │
# │ Allowed Tools: 1 configured                                     │
# │ Thinking: enabled                                               │
# ╰─────────────────────────────────────────────────────────────────╯
```

### Compare Variants (Config Only)

```bash
sniff variant diff control treatment

# Shows configuration differences without run data
# Useful for verifying what changed before running tests
```

### Delete a Variant

```bash
sniff variant delete old-config

# Force delete
sniff variant delete old-config --force
```

### Auto-Linking

When you run an interview, sniffbench automatically links to a matching variant:

1. Captures your current config
2. Computes a hash of the config
3. Checks if any registered variant has the same hash
4. If yes, links the run to that variant

This means you don't need to specify `--variant` every time—just keep your variants registered.

## Comparing Results

### Compare Two Runs

```bash
sniff compare baseline experiment
```

Output shows:
1. **Run Information**: IDs, dates, agents, variants
2. **Configuration Changes**: What's different between configs
3. **Case Comparison**: Per-case metrics with deltas
4. **Aggregate Summary**: Total tokens, cost, grades

### Reading the Output

```
Configuration Changes:
  MCP: Linear: none → stdio        # New MCP server added
  Allowed Tools: none → 1 tools    # Tools were allowlisted

Case Comparison:
  Case ID        Grade 1   Grade 2   Tokens          Cost
  ─────────────────────────────────────────────────────────
  comp-001       8/10      9/10      10,959 → 8,234  ↓ -24.9%
  comp-002       7/10      8/10      15,000 → 12,000 ↓ -20.0%

Aggregate Summary:
  Cases compared: 2
  Average grade: 7.5 → 8.5 ↑ +13.3%
  Total tokens: 25,959 → 20,234 ↓ -22.1%
  Total cost: $0.30 → $0.24 ↓ -20.0%
```

Color coding:
- **Green** (↑/↓): Improvement (higher grade, lower cost/tokens)
- **Red** (↑/↓): Regression
- **Dim** (→): No change

## Managing Cases

### List Cases

```bash
# All cases
sniff cases

# Filter by category
sniff cases --category comprehension

# Filter by language
sniff cases --language typescript

# As JSON
sniff cases --json
```

### Show Case Details

```bash
sniff cases show comp-001

# Open in editor
sniff cases show comp-001 --edit
```

### List Categories

```bash
sniff cases categories
```

### List Languages

```bash
sniff cases languages
```

## Troubleshooting

### "No comprehension cases found"

Make sure you're in a directory with cases, or that cases are installed:

```bash
sniff status  # Check cases directory
sniff doctor  # Run diagnostics
```

### "Claude Code is not available"

Ensure Claude Code is installed and in your PATH:

```bash
claude --version
```

### "Variant not found"

Check registered variants:

```bash
sniff variant list
```

### Runs not auto-linking to variants

This happens when your config changed since registering the variant. Re-register:

```bash
sniff variant register "my-variant" --description "Updated config"
```

### Migration from baselines.json

Old baselines are automatically migrated on first use. The original file is preserved as backup.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SNIFFBENCH_CASES_DIR` | Override default cases directory |
| `EDITOR` | Editor for `sniff cases show --edit` |

## Data Files

| File | Description |
|------|-------------|
| `.sniffbench/runs.json` | All runs with results and config |
| `.sniffbench/variants.json` | Registered variants |
| `.sniffbench/baselines.json` | Legacy format (auto-migrated) |

## Next Steps

- [Variant System Deep Dive](VARIANTS.md)
- [Run Tracking Details](RUNS.md)
- [Contributing Guide](../CONTRIBUTING.md)
