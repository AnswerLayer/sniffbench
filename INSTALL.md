# Installation Guide

## Requirements

- Node.js 18.0 or higher
- npm (comes with Node.js)
- Docker (for running evaluations in isolation)

## Install from npm (once published)

```bash
# Using npm
npm install -g sniffbench

# Using pnpm (faster)
pnpm add -g sniffbench

# Using yarn
yarn global add sniffbench

# Using bun
bun install -g sniffbench
```

Or run without installing:
```bash
# Using npx
npx sniffbench status

# Using pnpm dlx (recommended)
pnpm dlx sniffbench status
```

## Install from Source (for contributors)

This project uses **pnpm** for development:

```bash
git clone https://github.com/answerlayer/sniffbench.git
cd sniffbench

# Install pnpm if you don't have it
npm install -g pnpm

# Install dependencies and build
pnpm install
pnpm build

# Run directly (no global install needed)
node dist/cli/index.js status
```

## Verify Installation

```bash
# Check version
sniff --version

# See available commands
sniff --help

# Check status
sniff status

# List test cases
sniff cases
```

You should see the CLI working with colorful output. If you see errors, check:
- Node.js version: `node --version` (needs 18.0+)
- Build succeeded: `npm run build`
- Path: `which sniff` should show the installed location

## Development Installation

If you want to contribute:

```bash
# Install pnpm globally first
npm install -g pnpm

# Install dependencies
pnpm install

# Build TypeScript
pnpm build

# Run in watch mode (rebuilds on changes)
pnpm dev

# Run tests (when we have them)
pnpm test

# Lint code
pnpm lint

# Format code
pnpm format
```

## Troubleshooting

### Command not found: sniff

If you installed globally:
```bash
# With npm
npm install -g sniffbench

# With pnpm
pnpm add -g sniffbench
```

If you're developing from source, run directly:
```bash
node dist/cli/index.js status
```

### TypeScript errors

Rebuild the project:
```bash
pnpm build
```

### pnpm not found

Install pnpm first:
```bash
npm install -g pnpm
# or
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

### Docker issues

Docker is only needed for actually running evaluations. The CLI will work without it.

To check Docker:
```bash
docker --version
docker ps
```
