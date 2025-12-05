# Sniffbench Values

This document defines what sniffbench measures and why. These values guide all case design and evaluation criteria.

## What Makes a Good Coding Agent?

Sniffbench evaluates agents on behaviors that matter for real-world software development:

### 1. Style Adherence

**Does the agent follow existing patterns and conventions in the repository?**

Good agents don't impose generic "best practices" - they learn and follow the project's established patterns:
- Naming conventions (camelCase vs snake_case, prefixes, etc.)
- File organization and module structure
- Error handling patterns used in the codebase
- Testing patterns and frameworks already in use
- Code formatting and linting rules configured in the project

### 2. Targeted Changes

**Does the agent make specific, focused changes without over-engineering?**

Good agents:
- Make the minimal change needed to accomplish the task
- Don't refactor unrelated code "while they're in there"
- Don't add features that weren't requested
- Don't introduce new dependencies unnecessarily
- Keep diffs small and reviewable

### 3. Efficient Navigation

**Does the agent research and navigate the codebase efficiently?**

Good agents:
- Find relevant code quickly without excessive searching
- Understand the codebase structure before making changes
- Read the right files in the right order
- Don't waste tokens on irrelevant exploration
- Build accurate mental models of architecture

### 4. Non-Regression

**Do existing tests still pass after changes?**

This is table stakes. An agent that breaks existing functionality is worse than useless.

## What We Do NOT Measure

Sniffbench intentionally avoids evaluating:

### Generic "Best Practices"

We don't care if an agent:
- Adds error handling to code that doesn't need it
- Introduces patterns the project doesn't use
- "Improves" code in ways that don't match project style
- Adds documentation where the project doesn't document

### Isolated Code Quality Metrics

We don't evaluate:
- Error handling quality divorced from project context
- Code complexity metrics without considering project norms
- Documentation coverage when the project doesn't document
- Type safety in dynamically-typed projects that don't use types

### Speed at the Cost of Quality

Completing tasks quickly doesn't matter if:
- The solution doesn't follow project patterns
- The change is larger than necessary
- Tests are broken or skipped

## Case Type Philosophy

### Comprehension Cases

Test if the agent truly understands the codebase architecture before making changes. An agent that doesn't understand the system will make poor modifications.

### Bootstrap Cases

Common real tasks (fix linting, rename symbols, extract functions) applied to the user's actual repo. Tests practical, everyday agent utility.

### Closed Issues Cases

The gold standard: can the agent reproduce what a human actually did to solve a real issue? Uses the repo's own closed issues/PRs as ground truth.

### Generated Cases

LLM-discovered opportunities for improvement specific to the repo. Tests the agent's ability to work on contextually-relevant challenges.

## Evaluation Principles

1. **Project context is king** - What's "right" depends entirely on the repository
2. **Real tasks over synthetic ones** - Closed issues beat contrived examples
3. **Behavior over output** - How the agent works matters as much as what it produces
4. **Simplicity over comprehensiveness** - Better to measure a few things well than many things poorly
