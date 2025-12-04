# Sniffbench Roadmap

This roadmap breaks down the work into phases. Everything is available to work on—phases just indicate dependencies and logical order.

## Status Legend

- ⬜ Not started
- 🟨 In progress
- ✅ Complete

---

## Phase 1: Foundation

Build the core infrastructure that everything else depends on.

### ⬜ 1.1 Core CLI Framework

**Why:** Need basic command structure before we can do anything else.

**Tasks:**
- Set up project structure (`src/cli/`, `src/sandbox/`, etc.)
- Choose framework (Click/Typer for Python, Commander.js for Node)
- Implement stub commands: `sniff init`, `sniff run`, `sniff add`, `sniff compare`, `sniff report`
- Add config management (YAML/JSON)
- Basic logging and error handling

**Deliverable:** You can run `sniff --help` and see commands (they don't do much yet).

---

### ⬜ 1.2 Docker Sandboxing

**Why:** Evaluations must run in isolation to avoid corrupting real codebases.

**Tasks:**
- Integrate Docker SDK (docker-py for Python, dockerode for Node)
- Create base images for different languages (Python, Node, Go, etc.)
- Implement container lifecycle: create → run → cleanup
- Add volume mounting for code access
- Set resource limits (CPU, memory, disk)
- Support Podman as alternative

**Deliverable:** Can spin up an isolated container, run code in it, and tear it down cleanly.

---

### ⬜ 1.3 Case Management System

**Why:** Need a standard way to define, store, and load test cases.

**Tasks:**
- Design case file format (YAML/JSON schema)
- Implement case loading and validation
- Create directory structure (`cases/bootstrap/`, `cases/generated/`)
- Add metadata support (difficulty, language, category)
- Implement case versioning
- Build filtering (by language, difficulty, etc.)

**Deliverable:** Can load a test case from disk and validate it's properly formatted.

---

## Phase 2: Bootstrap Cases

Ship with 15-20 universal coding tasks that work out of the box.

### ⬜ 2.1 Design Bootstrap Cases

**Why:** Need real test cases before we can evaluate anything.

**Tasks:**
- Define 15-20 universal coding problems:
  - Add error handling to functions
  - Fix SQL injection vulnerabilities
  - Add input validation
  - Optimize N+1 queries
  - Write unit tests for untested code
  - Add TypeScript types to JavaScript
  - Extract reusable components from duplication
  - Fix race conditions
  - Improve code readability
  - Add logging and monitoring
  - Fix memory leaks
  - Implement auth checks
  - Add API documentation
  - Refactor long functions
  - Fix deprecated API usage
- Write clear problem statements
- Create sample "bad" code
- Define acceptance criteria

**Deliverable:** Documented specifications for each test case.

---

### ⬜ 2.2 Implement Bootstrap Cases

**Why:** Turn designs into executable test cases.

**Tasks:**
- Create case files for each bootstrap case
- Implement sample problematic code
- Write validation scripts (tests, linters, etc.)
- Add multi-language support where applicable
- Package cases for distribution

**Deliverable:** 15-20 working test cases that ship with Sniffbench.

---

## Phase 3: Claude Code Integration

Make Sniffbench work seamlessly with Claude Code.

### ⬜ 3.1 Claude Code Agent Wrapper

**Why:** Need programmatic way to run Claude Code evaluations.

**Tasks:**
- Research Claude Code SDK/API
- Implement wrapper following common interface
- Handle authentication and sessions
- Execute commands and capture responses
- Add error handling and retry logic
- Track tool usage and metrics

**Deliverable:** Can programmatically invoke Claude Code and capture results.

---

### ⬜ 3.2 Slash Commands

**Why:** Let Claude Code users run evaluations without leaving their IDE.

**Tasks:**
- Implement `/eval add <description>` - Add case from context
- Implement `/eval run` - Run evaluations
- Implement `/eval generate` - Generate repo-specific cases
- Implement `/eval compare <run1> <run2>` - Compare results
- Add help and documentation

**Deliverable:** Can use slash commands in Claude Code to run evaluations.

---

## Phase 4: Metrics System

Measure what matters: correctness, quality, safety, performance.

### ⬜ 4.1 Core Metrics

**Why:** Need objective ways to score agent performance.

**Tasks:**
- **Correctness (40%)**: Tests pass, requirements met
- **Code Quality (25%)**: Linting, formatting, complexity, types
- **Safety (20%)**: No vulnerabilities, no breaking changes
- **Performance (10%)**: Speed, memory, efficiency
- **Maintainability (5%)**: Conventions, readability, docs
- Make weights configurable per repo
- Implement metric aggregation
- Add historical tracking

**Deliverable:** Can score a run across all metric categories.

---

### ⬜ 4.2 Agent Behavior Metrics

**Why:** Understanding how agents work helps improve them.

**Tasks:**
- Track time to completion
- Count iterations/corrections
- Measure context usage efficiency
- Analyze tool selection
- Track self-correction frequency
- Measure planning quality

**Deliverable:** Can see how efficiently an agent solved a task.

---

### ⬜ 4.3 Reporting and Visualization

**Why:** Data isn't useful if you can't understand it.

**Tasks:**
- Generate HTML reports
- Export JSON for programmatic access
- Create Markdown summaries
- Build comparison visualizations
- Add trend analysis
- Support CI/CD integration

**Deliverable:** Beautiful, informative reports from evaluation runs.

---

## Phase 5: LLM Generation

Auto-generate repo-specific test cases using LLMs.

### ⬜ 5.1 Case Generation Engine

**Why:** Bootstrap cases are universal, but repo-specific cases are more valuable.

**Tasks:**
- Design prompts for case generation
- Analyze codebases for context
- Integrate Claude-3.5-Sonnet (primary)
- Add GPT-4 fallback
- Implement token budget management
- Add caching for efficiency

**Deliverable:** Can analyze a codebase and generate relevant test cases.

---

### ⬜ 5.2 Quality Assurance

**Why:** Generated cases need validation before use.

**Tasks:**
- Create validation criteria
- Implement automated quality checks
- Build manual review interface
- Estimate case difficulty
- Add deduplication logic
- Support case refinement

**Deliverable:** Generated cases are high-quality and ready to use.

---

## Phase 6: Multi-Agent Support

Extend beyond Claude Code to Cursor, Aider, and others.

### ⬜ 6.1 Multi-Agent Architecture

**Why:** Need universal interface for different agents.

**Tasks:**
- Design universal agent protocol
- Create agent registry
- Implement discovery mechanism
- Build config management
- Add capability detection
- Create plugin architecture

**Deliverable:** Easy to add new agent types.

---

### ⬜ 6.2 Additional Agent Wrappers

**Why:** Support more agents = more users, more data.

**Agents to support:**
- Cursor IDE
- Aider
- Continue.dev
- GitHub Copilot (if API available)

**Deliverable:** Wrappers for 3+ agents beyond Claude Code.

---

### ⬜ 6.3 Cross-Agent Comparison

**Why:** The whole point is comparing agents objectively.

**Tasks:**
- Side-by-side performance analysis
- Identify agent strengths/weaknesses
- Cost analysis (API usage, time)
- Recommendation engine
- Public leaderboard
- Result sharing

**Deliverable:** Clear, fair comparisons across agents with shareable results.

---

## How to Use This Roadmap

1. **Pick a phase** - Earlier phases unblock later ones
2. **Choose a task** - Match your skills and interest
3. **Check GitHub issues** - Look for open issues or create one
4. **Start building** - Open a PR when ready

Don't feel constrained by order. If you want to work on Phase 5 before Phase 2 is done, go for it. The phases just show logical dependencies, not strict requirements.
