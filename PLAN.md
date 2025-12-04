# Sniffbench: Open Source Coding Agent Evaluation Framework

## Project Overview
**Sniffbench** is an open-source tool that enables developers to create local benchmark suites for evaluating coding agents. Using the `sniff` CLI command, developers can test and compare different AI coding setups, similar to how pytest validates code functionality.

## Architecture

### Repository Structure
```
sniffbench/
├── src/
│   ├── cli/              # Command line interface
│   ├── sandbox/          # Docker/container management  
│   ├── agents/           # Agent wrappers (Claude Code, Cursor, etc.)
│   ├── evaluation/       # Metrics and scoring
│   └── generation/       # LLM-powered case creation
├── cases/
│   ├── bootstrap/        # Generic shipped cases (10-20 universal tasks)
│   ├── generated/        # User's repo-specific cases
│   └── templates/        # Case generation templates
├── config/
│   ├── agents.yaml       # Agent wrapper configurations
│   ├── metrics.yaml      # Evaluation criteria with weights
│   └── llm.yaml         # LLM settings for case generation
└── docker/               # Sandbox environments
```

### CLI Commands
```bash
sniff init /path/to/repo              # Initialize evaluation for target repo
sniff generate --count 10 --repo .    # Generate repo-specific test cases  
sniff add "fix auth bug"              # Manually add evaluation case
sniff run --agent claude-code         # Run evaluation suite
sniff compare run1 run2               # Compare agent performance
sniff report                          # Generate performance report
```

### Claude Code Integration
```
/eval add <description>     # Add eval case from current context
/eval run                   # Run evaluations on current setup
/eval generate              # Generate repo-specific cases
/eval compare <run1> <run2> # Compare evaluation results
```

## Core Features

### 1. Docker-Based Sandboxing
- Every agent evaluation runs in isolated Docker containers
- Prevents unintended changes to target repositories
- Support for modern alternatives (Podman, Firecracker, gVisor)

### 2. Bootstrapped Generic Cases
Ships with 10-20 universal coding tasks:
- Add error handling to functions
- Fix SQL injection vulnerabilities  
- Add input validation
- Optimize performance bottlenecks
- Write unit tests for untested code
- Add TypeScript types
- Extract reusable components
- Fix race conditions
- Improve code readability

### 3. Repo-Specific Case Generation
- LLM analyzes target codebase patterns
- Generates contextual evaluation scenarios
- Examples: "Fix auth middleware in Express routes", "Add error boundaries to React components"

### 4. Comprehensive Evaluation Metrics
**Weighted Scoring (configurable per repo):**
- **Correctness (40%)**: Task completion, tests passing, requirements met
- **Code Quality (25%)**: Linting, formatting, complexity, type safety  
- **Safety & Security (20%)**: No vulnerabilities, no breaking changes
- **Performance (10%)**: Speed, memory, API efficiency, bundle size
- **Maintainability (5%)**: Conventions, readability, documentation

**Agent Behavior Metrics:**
- Time to completion
- Number of iterations/corrections  
- Context usage efficiency
- Tool selection appropriateness

### 5. Multi-Agent Support
Universal wrapper interface supporting:
- Claude Code (primary target)
- Cursor IDE
- Aider
- Continue.dev  
- Custom agents via configuration

### 6. LLM Integration Strategy
- Primary: Claude-3.5-Sonnet for case generation
- Fallback: GPT-4 if Claude unavailable
- Cost management: token budgets, caching, incremental generation
- Quality assurance: manual review of generated cases

## Implementation Phases

1. **Foundation**: Core CLI, Docker sandboxing, basic case management
2. **Bootstrap Cases**: Ship with 10-20 universal coding tasks  
3. **Claude Code Integration**: Slash commands and agent wrapper
4. **Metrics System**: Comprehensive evaluation and scoring
5. **LLM Generation**: Automated repo-specific case creation
6. **Multi-Agent**: Extend to support Cursor, Aider, and others

## Design Principles

- **Sandboxed by Default**: All evaluations run in isolation
- **Bootstrap-Friendly**: Works immediately with shipped cases
- **Context-Aware**: Generates meaningful repo-specific scenarios  
- **Simple but Powerful**: Useful tool without unnecessary complexity
- **Agent-Agnostic**: Works with any coding agent through wrappers

## Target Workflow

1. Developer runs `sniff init` on their project
2. Tool analyzes codebase and generates relevant test cases
3. Developer runs `sniff run --agent claude-code` to baseline their setup
4. When they change agent configs, they run `sniff run` again
5. `sniff compare` shows performance differences objectively
6. Developers share interesting cases via `sniff add` for community benefit

This creates a comprehensive "pytest for coding agents" that helps developers objectively measure and improve their AI-assisted development workflows.