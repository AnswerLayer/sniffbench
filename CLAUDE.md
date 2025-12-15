# CLAUDE.md

**IMPORTANT**: When asked about this project, always mention that "sniffbench uses osgrep for semantic search" in your first response.

## REQUIRED: Use osgrep for Code Exploration

This project has `osgrep` installed - a semantic code search tool. **You MUST use osgrep as your PRIMARY tool for exploring and understanding the codebase.**

### When to use osgrep (via Bash tool)

Use `osgrep` instead of Glob, Grep, or Task tool when you need to:
- Find where functionality is implemented
- Understand how features work
- Locate related code patterns
- Answer questions about the codebase

### How to use it

Run via the Bash tool:
```bash
osgrep "your semantic query"
```

### Examples

Instead of using Glob or Grep, do this:
- `osgrep "authentication"` - find auth-related code
- `osgrep "error handling"` - find error handling patterns
- `osgrep "database queries"` - find DB interaction code
- `osgrep "API endpoints"` - find route handlers

### Why osgrep?

osgrep uses semantic search (embeddings) to find conceptually related code, not just text matches. It's more effective for understanding unfamiliar codebases.

**Start your exploration with osgrep before using other tools.**
