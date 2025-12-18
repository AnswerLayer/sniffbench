# Commands Reference

Complete reference for all `sniff` CLI commands.

## Interview

```bash
sniff interview                      # Run interview, auto-generate run ID
sniff interview --run "baseline"     # Run with a labeled run
sniff interview --cases comp-001     # Run specific case(s)
sniff interview --variant control    # Link run to specific variant
sniff interview --compare            # Compare against existing baselines
sniff interview --use-variant control # Run in sandboxed variant container
```

## Runs

```bash
sniff runs list                      # List all runs
sniff runs show <id>                 # Show run details
sniff runs show baseline             # Show by label
sniff runs delete <id>               # Delete a run
```

## Variant (singular) - operate on ONE

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

## Variants (plural) - operate on MANY

```bash
sniff variants list                  # List all variants
sniff variants diff <v1> <v2>        # Compare two variants (config only)
sniff variants build                 # Build all variant containers
sniff variants build --filter osgrep # Build variants matching pattern
sniff variants prune                 # Remove all container images
sniff variants clean                 # Delete stale variants
sniff variants                       # (default: list all)
```

## Cases

```bash
sniff cases                          # List all test cases
sniff cases show comp-001            # Show case details
sniff cases categories               # List categories
sniff cases languages                # List languages
```

## Closed Issues

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

## Utilities

```bash
sniff status                         # Show configuration
sniff doctor                         # Run diagnostics
sniff compare <run1> <run2>          # Compare two runs
```
