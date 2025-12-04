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
