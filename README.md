# Sniffbench

> A benchmark suite for coding agents. Think pytest, but for evaluating AI assistants.

## What is this?

When you change your AI coding setup—switching models, adjusting prompts, or trying new tools—you're flying blind. Did it actually get better? Worse? Hard to say without data.

Sniffbench gives you that data. It runs your coding agent through evaluation tasks and measures what matters.

## Quick Start

```bash
# Clone and build
git clone https://github.com/answerlayer/sniffbench.git
cd sniffbench
npm install
npm run build

# Link globally (optional)
npm link

# Check it's working
sniff --help
sniff doctor
```

## What Works Now

### Comprehension Interview

Test how well your agent understands a codebase:

```bash
sniff interview
```

This runs your agent through 12 comprehension questions about the codebase architecture. You grade each answer on a 1-10 scale to establish baselines. Future runs compare against your baseline.

```
╭─ sniff interview ────────────────────────────────────────────────╮
│ Comprehension Interview                                          │
│                                                                  │
│ Test how well your agent understands this codebase.              │
│ You'll grade each answer on a 1-10 scale to establish baselines. │
╰──────────────────────────────────────────────────────────────────╯

✔ Found 12 comprehension questions

  Questions to cover:

  ○ not graded  comp-001: Project Overview
  ○ not graded  comp-002: How to Add New Features
  ...
```

### Case Management

```bash
# List all test cases
sniff cases

# Show details of a specific case
sniff cases show comp-001

# List categories
sniff cases categories
```

### System Status

```bash
# Check sniffbench configuration
sniff status

# Run diagnostics (Docker, dependencies)
sniff doctor
```

## What We Measure

Sniffbench evaluates agents on behaviors that matter for real-world development:

1. **Style Adherence** - Does the agent follow existing patterns in the repo?
2. **Targeted Changes** - Does it make specific, focused changes without over-engineering?
3. **Efficient Navigation** - Does it research the codebase efficiently?
4. **Non-Regression** - Do existing tests still pass?

We explicitly do NOT measure generic "best practices" divorced from project context. See [VALUES.md](VALUES.md) for our full philosophy.

## Case Types

| Type | Description | Status |
|------|-------------|--------|
| **Comprehension** | Questions about codebase architecture | ✅ Ready |
| **Bootstrap** | Common tasks (fix linting, rename symbols) | 🚧 In Progress |
| **Closed Issues** | Real issues from your repo's history | 🚧 In Progress |
| **Generated** | LLM discovers improvement opportunities | 🚧 Planned |

## Roadmap

We're building in phases:

1. ✅ **Foundation** - CLI, Docker sandboxing, case management
2. 🚧 **Case Types** - Comprehension, bootstrap, closed issues, generated
3. ⬜ **Agent Integration** - Claude Code, Cursor, Aider wrappers
4. ⬜ **Metrics** - Comprehensive scoring and comparison
5. ⬜ **Multi-Agent** - Cross-agent benchmarking

See [ROADMAP.md](ROADMAP.md) for detailed phases.

## Contributing

We welcome contributions! Areas that need work:

- **Agent wrappers** - Integrate with Claude Code, Cursor, Aider
- **Bootstrap cases** - Detection and validation for common tasks
- **Closed issues scanner** - Extract cases from git history
- **Documentation** - Examples, tutorials, case studies

See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## Prior Art

We researched existing solutions (SWE-Bench, CORE-Bench, Aider benchmarks). See [existing_work.md](existing_work.md) for analysis.

## License

MIT - see [LICENSE](LICENSE)

## Questions?

Open an issue. We're building this in public and welcome feedback.
