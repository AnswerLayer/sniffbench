# Docker Images

Sniffbench uses official Docker Hub images for sandboxed evaluation environments.
This approach maximizes ease of use - no custom builds required, and images are often already cached.

## Recommended Images

Sniffbench automatically uses these official images based on your project:

| Language | Image | Size |
|----------|-------|------|
| **Node.js 20** | `node:20-slim` | ~200MB |
| **Node.js 18** | `node:18-slim` | ~180MB |
| **Python 3.12** | `python:3.12-slim` | ~150MB |
| **Python 3.11** | `python:3.11-slim` | ~150MB |
| **Go 1.22** | `golang:1.22-alpine` | ~250MB |
| **Rust** | `rust:slim` | ~800MB |
| **Java 21** | `eclipse-temurin:21-jdk` | ~400MB |

## Pre-downloading Images

For faster first runs, pre-download the images you need:

```bash
# For Node.js projects
docker pull node:20-slim

# For Python projects
docker pull python:3.12-slim

# Or let sniff doctor tell you what's needed
sniff doctor
```

## Custom Images

You can specify a custom image in your `sniffbench.yaml`:

```yaml
sandbox:
  image: my-custom-image:latest
```

Custom images should:
- Include the language runtime and common tools (npm, pip, etc.)
- Have `/workspace` available as a writable directory
- Support running as non-root (for security)

## Security Defaults

All containers run with these security settings:
- **Network disabled** by default (can be enabled per-case)
- **Read-only root filesystem** (`/tmp` and `/workspace` are writable)
- **Dropped capabilities** (minimal privileges)
- **Resource limits** (512MB RAM, 1 CPU by default)
- **PID limit** (256 processes to prevent fork bombs)

---

## Variant Containers

Separate from evaluation sandboxes, sniffbench also builds **variant containers** for A/B testing agent configurations.

### What are Variant Containers?

When you run `sniff variant register --build`, sniffbench creates a Docker image with:
- Claude Code SDK installed (same version as your host)
- Your CLAUDE.md baked in at build time
- Tool permissions configured
- Settings frozen for reproducibility

### How They Work

```bash
# Build a variant container
sniff variant register "control" --build

# Run interview in the container
sniff interview --use-variant control
```

The container:
1. Mounts your project directory read-only at `/workspace`
2. Uses the baked-in CLAUDE.md (not your current one)
3. Passes API keys via environment variables at runtime
4. Streams results back via the Claude Agent SDK

### Image Naming

Variant images follow this pattern:
```
sniffbench-variant-{name}:{tag}
```

For example: `sniffbench-variant-control:v1734567890-abc123`

### Managing Variant Images

```bash
# List variant images
docker images sniffbench-variant-*

# Remove a variant's image (keeps config)
sniff variant prune control

# Rebuild after config changes
sniff variant build control
```

### Why Containers for Variants?

Without containers, changing your CLAUDE.md or tool settings affects all runs. With containers:
- **Isolation**: Control variant uses its baked-in config, treatment uses its own
- **Reproducibility**: Re-run the exact same configuration months later
- **Parallel testing**: Run multiple variants simultaneously (coming soon)
