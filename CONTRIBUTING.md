# Contributing to Sniffbench

Thanks for your interest. This project is in early stages, so there's lots of ground-floor work to do.

## Getting Started

1. **Check the roadmap** - [ROADMAP.md](ROADMAP.md) shows what's being built and what's available to work on
2. **Pick something** - Issues are labeled by phase and skill level
3. **Open a PR** - We'll review and merge

No need to ask permission first. If you see something you want to build, build it.

## Development Setup

This project uses **pnpm** for dependency management:

```bash
git clone https://github.com/answerlayer/sniffbench.git
cd sniffbench

# Install pnpm if you don't have it
npm install -g pnpm

# Install dependencies and build
pnpm install
pnpm build

# Verify it works (run directly)
node dist/cli/index.js --version
node dist/cli/index.js status
```

**Why pnpm?** It's faster, more disk-efficient, and has stricter dependency resolution than npm. It signals modern best practices.

## What to work on

### High Priority (Phase 1)

These are foundational and block everything else:

- **CLI Framework** - Set up basic command structure (Click/Typer/Commander.js)
- **Docker Sandboxing** - Container lifecycle management for safe evaluation runs
- **Case Management** - File format and loading system for test cases

### Good First Issues

- **Bootstrap Case Design** - Design one of the 15-20 universal test cases
- **Documentation** - Expand docs, add examples, improve clarity
- **Research** - Evaluate existing agent benchmarking tools and summarize findings

### Medium Complexity

- **Metrics Implementation** - Build scoring algorithms for correctness, quality, safety
- **Agent Wrappers** - Create programmatic interfaces to Claude Code, Cursor, Aider
- **Reporting** - Generate HTML/Markdown reports from evaluation results

### Advanced

- **LLM Case Generation** - Use Claude/GPT to analyze codebases and generate repo-specific tests
- **Multi-Agent Architecture** - Design universal interface for supporting multiple agents

## Guidelines

### Code Style

We use TypeScript with strict mode enabled:
- **Prettier** for code formatting (`pnpm format`)
- **ESLint** for linting (`pnpm lint`)
- **TypeScript** with strict type checking
- **Jest** for tests (coming soon)

Before submitting a PR:
```bash
pnpm lint
pnpm format
pnpm build
```

### Test Cases

Bootstrap test cases should:
- Have a clear problem statement
- Include sample "bad" code that demonstrates the issue
- Define what a "good" solution looks like
- Be deterministic and reproducible
- Work in Docker isolation

### Pull Requests

- **Keep them focused** - One feature or fix per PR
- **Write clear commits** - Explain what and why, not just what
- **Add tests** - If you're adding functionality, add tests
- **Update docs** - If you're changing behavior, update README/docs

We're not strict about commit message formats or extensive documentation at this stage. Just make it clear what you're doing.

## Architecture Decisions

### Language Choice

We chose **TypeScript/Node.js** with **pnpm** because:
- Aligns with the coding agent ecosystem (Claude Code, Cursor)
- Native Claude Code SDK support
- Better async/await patterns for orchestration
- Easy distribution via npm/npx
- pnpm provides faster installs and better dependency management

### Case Format

Test cases will likely be YAML or JSON with this structure:

```yaml
id: bootstrap-001
title: "Add error handling to unprotected functions"
description: |
  Functions that call external APIs or databases should handle errors gracefully.
language: python
difficulty: easy
files:
  - path: src/api.py
    content: |
      def fetch_user(user_id):
          return requests.get(f"/api/users/{user_id}").json()
validation:
  type: test_suite
  command: pytest tests/test_api.py
```

This is just a sketch. If you have better ideas, open an issue.

### Metrics

We're planning weighted scoring:
- Correctness (40%) - Does it work?
- Code Quality (25%) - Is it maintainable?
- Safety (20%) - Does it introduce vulnerabilities?
- Performance (10%) - Is it efficient?
- Maintainability (5%) - Does it follow conventions?

These weights should be configurable per repository.

## Communication

- **Issues** - For bugs, feature requests, design discussions
- **Pull Requests** - For code changes (discussion happens in PR comments)

## Questions?

Open an issue. If it's a quick question, just open it and we'll close it after answering. That builds up a searchable knowledge base.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
