# Sniffbench

> A benchmark suite for coding agents. Think pytest, but for evaluating AI assistants.

## What is this?

When you change your AI coding setup—switching models, adjusting prompts, adding MCP servers, or trying new tools—you're flying blind. Did it actually get better? Worse? Hard to say without data.

Sniffbench gives you that data. It runs your coding agent through evaluation tasks, captures your configuration, and measures what matters.

## Quick Start

```bash
# Install globally
npm install -g sniffbench

# Or clone and build
git clone https://github.com/answerlayer/sniffbench.git
cd sniffbench && npm install && npm run build && npm link

# Check it's working
sniff --help
sniff doctor
```

## Core Workflow

### 1. Run a Comprehension Interview

```bash
sniff interview
```

This runs your agent through comprehension questions about your codebase. You grade each answer (1-10) to establish baselines.

**Every interview automatically:**
- Creates a run with a unique ID
- Captures your agent configuration (version, model, MCP servers, tools)
- Auto-links to matching variants (if registered)

```bash
# With an optional label for easy reference
sniff interview --run "baseline"
```

### 2. Register Variants for A/B Testing

Before making configuration changes, snapshot your current setup:

```bash
sniff variant register "control" --description "Stock Claude Code config"
```

Make your changes (add MCP server, update CLAUDE.md, etc.), then register the new config:

```bash
sniff variant register "with-linear" --description "Added Linear MCP server"
```

### 3. Compare Results

```bash
# Compare two runs
sniff compare baseline after-changes

# Or by run ID
sniff compare run-1734567890-abc123 run-1734567891-def456
```

Shows both **config diff** (what changed) and **metrics diff** (did it help):

```
Configuration Changes:
  MCP: Linear: none → stdio
  Allowed Tools: none → 1 tools

Case Comparison:
  comp-001: Tokens 10,959 → 8,234 (-25%) ✓
  comp-002: Grade 7/10 → 9/10 ↑

Aggregate Summary:
  Total tokens: 45,000 → 38,000 ↓ -15.6%
  Total cost: $0.52 → $0.44 ↓ -15.4%
```

## Commands Reference

### Interview

```bash
sniff interview                      # Run interview, auto-generate run ID
sniff interview --run "baseline"     # Run with a labeled run
sniff interview --cases comp-001     # Run specific case(s)
sniff interview --variant control    # Link run to specific variant
sniff interview --compare            # Compare against existing baselines
sniff interview --use-variant control # Run in sandboxed variant container
```

### Runs

```bash
sniff runs list                      # List all runs
sniff runs show <id>                 # Show run details
sniff runs show baseline             # Show by label
sniff runs delete <id>               # Delete a run
```

### Variant (singular) - operate on ONE

```bash
sniff variant register <name>        # Register current config as variant
sniff variant register <name> --build # Register and build container image
sniff variant show <name>            # Show variant details
sniff variant build <name>           # Build container image for variant
sniff variant prune <name>           # Remove container image
sniff variant delete <name>          # Delete a variant
sniff variant use <name>             # Activate variant for subsequent runs
sniff variant unuse                  # Deactivate current variant
sniff variant active                 # Show currently active variant
sniff variant                        # (default: show active)
```

### Variants (plural) - operate on MANY

```bash
sniff variants list                  # List all variants
sniff variants diff <v1> <v2>        # Compare two variants (config only)
sniff variants build                 # Build all variant containers
sniff variants build --filter osgrep # Build variants matching pattern
sniff variants prune                 # Remove all container images
sniff variants clean                 # Delete stale variants
sniff variants                       # (default: list all)
```

### Cases

```bash
sniff cases                          # List all test cases
sniff cases show comp-001            # Show case details
sniff cases categories               # List categories
sniff cases languages                # List languages
```

### Closed Issues (NEW)

Use real closed issues from your repository as evaluation cases:

```bash
sniff closed-issues scan             # Find suitable closed issues
sniff closed-issues scan --all       # Include excluded issues with reasons
sniff closed-issues add owner/repo#123  # Add specific issue as a case
sniff closed-issues add #123         # Add from current repo
sniff closed-issues list             # List extracted cases
sniff closed-issues run              # Run agent on closed issues
sniff closed-issues run --case <id>  # Run specific case
```

### Utilities

```bash
sniff status                         # Show configuration
sniff doctor                         # Run diagnostics
sniff compare <run1> <run2>          # Compare two runs
```

## What Gets Captured

### Agent Configuration (Automatic)

Every run captures:

| Field | Source | Example |
|-------|--------|---------|
| Agent name | CLI detection | `claude-code` |
| Version | `claude --version` | `2.0.55` |
| Model | API response | `claude-sonnet-4-20250514` |
| CLAUDE.md hash | File hash | `8b28a4e5...` |
| MCP servers | `~/.claude.json` | `Linear(stdio)` |
| Allowed tools | `~/.claude.json` | `Bash(osgrep:*)` |
| Permission mode | Settings | `default` |
| Thinking mode | Settings | `enabled` |

### Behavior Metrics (Per Case)

| Metric | What it measures |
|--------|------------------|
| `totalTokens` | Total tokens used |
| `inputTokens` | Input/prompt tokens |
| `cacheReadTokens` | Tokens read from cache |
| `cacheWriteTokens` | Tokens written to cache |
| `toolCount` | Number of tool calls |
| `readCount` | Number of file reads |
| `costUsd` | Estimated API cost |
| `explorationRatio` | Read vs write tool ratio |
| `cacheHitRatio` | Cache efficiency |

## Variant System

Variants enable scientific A/B testing of agent configurations.

### Why Variants?

Without variants, you're comparing runs but don't know *why* one performed differently. Variants let you:

1. **Document what changed**: "Added Linear MCP", "Updated CLAUDE.md prompts"
2. **Auto-link runs**: Runs automatically link to matching variants
3. **Compare configs**: See exactly what's different between setups

### Sandboxed Variant Execution

For true isolation, variants can be packaged as Docker containers with your configuration baked in:

```bash
# Register and build a container image
sniff variant register "control" -d "Stock config" --build

# Make changes to CLAUDE.md, add MCP servers, etc...

# Register the treatment variant
sniff variant register "with-osgrep" -d "Added semantic search" --build

# Run interview in sandboxed container
sniff interview --use-variant control
sniff interview --use-variant with-osgrep

# Compare the runs
sniff compare <control-run> <osgrep-run>
```

Each container includes:
- Claude Code (same version as your host)
- Your CLAUDE.md baked in
- Tool permissions configured
- Complete isolation from host config

**Requirements:** Docker must be installed for sandboxed execution.

### Workflow Example (Without Containers)

```bash
# 1. Register your baseline config
sniff variant register "control" -d "Stock Claude Code"

# 2. Run some interviews
sniff interview --run "control-test-1"
sniff interview --run "control-test-2"

# 3. Make changes to your setup
# ... add MCP server, update CLAUDE.md, etc ...

# 4. Register the new config
sniff variant register "treatment" -d "Added semantic search"

# 5. Run more interviews (auto-links to "treatment")
sniff interview --run "treatment-test-1"

# 6. Compare!
sniff compare control-test-1 treatment-test-1
```

## Storage

All data is stored in `.sniffbench/` in your project root:

```
.sniffbench/
├── runs.json       # All runs with results and config
├── variants.json   # Registered variants
└── baselines.json  # Legacy format (auto-migrated)
```

## Case Types

| Type | Description | Status |
|------|-------------|--------|
| **Comprehension** | Questions about codebase architecture | ✅ Ready |
| **Bootstrap** | Common tasks (fix linting, rename symbols) | 🚧 In Progress |
| **Closed Issues** | Real issues from your repo's history | ✅ Ready |

## What We Measure

Sniffbench evaluates agents on behaviors that matter for real-world development:

1. **Comprehension** - Does the agent understand the codebase?
2. **Efficiency** - Does it explore without wasting tokens?
3. **Accuracy** - Are its answers correct and complete?
4. **Consistency** - Does it perform reliably across runs?

See [VALUES.md](VALUES.md) for our full evaluation philosophy.

## Contributing

We welcome contributions! Areas that need work:

- **Agent wrappers** - Integrate with Cursor, Aider, or other coding agents
- **Bootstrap cases** - Detection and validation for common tasks
- **LLM-judge** - Automated answer quality evaluation
- **Documentation** - Examples, tutorials, case studies

See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## Links

- [Installation Guide](INSTALL.md)
- [Roadmap](ROADMAP.md)
- [Prior Art Research](existing_work.md)
- [Values & Philosophy](VALUES.md)

## License

MIT - see [LICENSE](LICENSE)
