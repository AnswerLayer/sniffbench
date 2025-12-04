# Sniffbench

> A benchmark suite for coding agents. Think pytest, but for evaluating AI assistants.

## What is this?

When you change your AI coding setup—switching models, adjusting prompts, or trying new tools—you're flying blind. Did it actually get better? Worse? Hard to say without data.

Sniffbench gives you that data. It runs your coding agent through a suite of real programming tasks and measures what matters: correctness, code quality, safety, and performance.

## Why it exists

We built AnswerLayer using Claude Code and constantly wondered: "Is this config actually better?" Every tweak was a guess. Every comparison was anecdotal.

We need a way to objectively measure coding agent performance on tasks that matter for our codebase. So we're building one. Open source, because this problem isn't unique to us.

## Quick Start

```bash
# Install from source (npm coming soon)
git clone https://github.com/answerlayer/sniffbench.git
cd sniffbench
pnpm install
pnpm build

# Check status (run directly without global install)
node dist/cli/index.js status

# See available commands
node dist/cli/index.js --help
```

Or try it instantly with npx (once published):
```bash
npx sniffbench status
# Or with pnpm
pnpm dlx sniffbench status
```

### Planned Workflow

Once core features are implemented:

```bash
# Initialize on your project
sniff init

# Run evaluation
sniff run --agent claude-code

# Make changes to your agent config, then run again
sniff run --agent claude-code

# Compare results
sniff compare run-001 run-002
```

Each evaluation will run in Docker isolation. Your actual codebase stays untouched.

## Current Status

**Early alpha.** The CLI works and you can install it, but core features are still in development.

We're building it in phases:

1. **Foundation** - CLI, Docker sandboxing, case management
2. **Bootstrap Cases** - 15-20 universal coding tasks that ship with the tool
3. **Claude Code Integration** - First-class support for Claude Code
4. **Metrics** - Comprehensive scoring (correctness, quality, safety, performance)
5. **LLM Generation** - Auto-generate repo-specific test cases
6. **Multi-Agent** - Support for Cursor, Aider, Continue.dev, etc.

See [ROADMAP.md](ROADMAP.md) for detailed phases and what's available to work on.

## What needs building

Everything. This is ground-zero.

Priority areas:
- **Core CLI** (Python/Node.js, basic commands, config management)
- **Docker sandboxing** (container lifecycle, resource limits)
- **Bootstrap test cases** (designing the initial 15-20 universal tasks)
- **Metrics implementation** (scoring algorithms, evaluation logic)
- **Agent wrappers** (programmatic interfaces to Claude Code, etc.)

Check out [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.

## Prior art

We researched existing solutions (SWE-agent, OpenAI Evals, DeepEval, InspectAI, Aider benchmarks). See [existing_work.md](existing_work.md) for analysis.

None quite fit what we need: a local tool that's simple to run, generates repo-specific tests, and works with multiple agents. So we're building it.

## License

MIT - see [LICENSE](LICENSE)

## Questions?

Open an issue. We're figuring this out as we go.
