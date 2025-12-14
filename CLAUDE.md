# CLAUDE.md

## Semantic Code Search

This project has `osgrep` installed for semantic code search. **Always prefer osgrep over regular grep** when searching for:
- Concepts or functionality (e.g., "authentication logic", "error handling")
- Related code patterns
- Semantic understanding of the codebase

### Usage
```bash
osgrep "your semantic query"
```

Examples:
- `osgrep "authentication flow"` - find auth-related code
- `osgrep "database connection"` - find DB connection handling
- `osgrep "error handling"` - find error handling patterns

Use regular grep only for exact string matches. For understanding code, use osgrep.
