/**
 * Variant container builder for sandboxed execution
 *
 * Generates Dockerfiles and builds container images that package
 * Claude Code with variant-specific configuration for isolated A/B testing.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync, spawn } from 'child_process';
import type { Variant, ContainerInfo, SandboxableSnapshot } from '../variants/types';
import type { FullMcpServerConfig } from '../runs/types';

/** Base image for variant containers */
const BASE_IMAGE = 'node:20-slim';

/** Directory for build contexts */
const BUILD_DIR = '.sniffbench/builds';

export interface BuildOptions {
  /** The variant to build */
  variant: Variant;
  /** Project root directory */
  projectRoot: string;
  /** Claude Code version to install (defaults to host version) */
  claudeVersion?: string;
  /** Whether to show build output */
  verbose?: boolean;
}

export interface BuildResult {
  /** Docker image name */
  imageName: string;
  /** Docker image tag */
  imageTag: string;
  /** Build duration in ms */
  durationMs: number;
  /** Container info for storage */
  containerInfo: ContainerInfo;
}

/**
 * Get the installed Claude Code version from the host
 */
export function getHostClaudeVersion(): string | null {
  try {
    const output = execSync('claude --version', { encoding: 'utf-8' });
    // Parse version from output like "2.0.55 (Claude Code)"
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Collect all required environment variables for a variant
 */
export function collectRequiredEnvVars(snapshot: SandboxableSnapshot): string[] {
  const envVars = new Set<string>();

  // Always need API key
  envVars.add('ANTHROPIC_API_KEY');

  // Collect from full MCP server configs
  if (snapshot.mcpServersFull) {
    for (const server of Object.values(snapshot.mcpServersFull)) {
      if (server.requiredEnvVars) {
        server.requiredEnvVars.forEach((v) => envVars.add(v));
      }
      // Also check headers for env var references
      if (server.headers) {
        Object.values(server.headers).forEach((v) => {
          if (v.startsWith('$')) {
            envVars.add(v.substring(1));
          }
        });
      }
    }
  }

  return Array.from(envVars).sort();
}

/**
 * Validate that required environment variables are set
 */
export function validateVariantEnv(snapshot: SandboxableSnapshot): {
  missing: string[];
  present: string[];
} {
  const required = collectRequiredEnvVars(snapshot);
  return {
    missing: required.filter((v) => !process.env[v]),
    present: required.filter((v) => process.env[v]),
  };
}

/**
 * Generate Dockerfile content for a variant
 */
export function generateDockerfile(
  snapshot: SandboxableSnapshot,
  claudeVersion: string
): string {
  const lines: string[] = [];

  // Base image
  lines.push(`FROM ${BASE_IMAGE}`);
  lines.push('');

  // Install Claude Code
  lines.push('# Install Claude Code');
  lines.push(`ARG CLAUDE_VERSION=${claudeVersion}`);
  lines.push('RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_VERSION}');
  lines.push('');

  // Install npm-based MCP servers
  const npmPackages = extractNpmPackages(snapshot);
  if (npmPackages.length > 0) {
    lines.push('# Install MCP server packages');
    for (const pkg of npmPackages) {
      lines.push(`RUN npm install -g ${pkg}`);
    }
    lines.push('');
  }

  // Create config directories
  lines.push('# Set up config directories');
  lines.push('RUN mkdir -p /root/.claude /workspace/.claude');
  lines.push('');

  // Copy variant-specific configs
  lines.push('# Copy variant-specific configs');
  if (snapshot.claudeMdContent) {
    lines.push('COPY CLAUDE.md /workspace/CLAUDE.md');
  }
  lines.push('COPY settings.json /workspace/.claude/settings.json');
  lines.push('COPY claude-config.json /root/.claude.json');
  lines.push('');

  // Working directory
  lines.push('# Working directory is the mounted codebase');
  lines.push('WORKDIR /workspace');
  lines.push('');

  // Entry point
  lines.push('# Entry point - claude CLI');
  lines.push('ENTRYPOINT ["claude"]');

  return lines.join('\n');
}

/**
 * Extract npm packages to install from MCP server configs
 */
function extractNpmPackages(snapshot: SandboxableSnapshot): string[] {
  const packages: string[] = [];

  if (snapshot.mcpServersFull) {
    for (const server of Object.values(snapshot.mcpServersFull)) {
      if (server.type === 'stdio' && server.npmPackage) {
        packages.push(server.npmPackage);
      }
    }
  }

  return packages;
}

/**
 * Generate settings.json content for the container
 */
function generateSettingsJson(snapshot: SandboxableSnapshot): string {
  const settings: Record<string, unknown> = {};

  // Add allowed/disallowed tools
  if (snapshot.allowedTools?.length) {
    settings.allowedTools = snapshot.allowedTools;
  }
  if (snapshot.disallowedTools?.length) {
    settings.disallowedTools = snapshot.disallowedTools;
  }

  // Add permission mode if not default
  if (snapshot.permissionMode && snapshot.permissionMode !== 'default') {
    settings.permissionMode = snapshot.permissionMode;
  }

  return JSON.stringify(settings, null, 2);
}

/**
 * Generate claude config JSON for MCP servers
 */
function generateClaudeConfig(snapshot: SandboxableSnapshot): string {
  const config: Record<string, unknown> = {};

  // Add MCP servers if configured
  if (snapshot.mcpServersFull) {
    const mcpServers: Record<string, unknown> = {};

    for (const [name, server] of Object.entries(snapshot.mcpServersFull)) {
      if (server.type === 'stdio') {
        mcpServers[name] = {
          command: server.command,
          args: server.args || [],
        };
      } else if (server.type === 'sse' || server.type === 'http') {
        mcpServers[name] = {
          type: server.type,
          url: server.url,
          // Headers will use env vars at runtime
        };
      }
    }

    if (Object.keys(mcpServers).length > 0) {
      config.mcpServers = mcpServers;
    }
  }

  return JSON.stringify(config, null, 2);
}

/**
 * Generate a unique image tag based on content hash
 */
function generateImageTag(variant: Variant, claudeVersion: string): string {
  const content = JSON.stringify({
    snapshot: variant.snapshot,
    claudeVersion,
  });
  const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
  return `v${Date.now()}-${hash}`;
}

/**
 * Get the build context directory for a variant
 */
export function getBuildContextPath(projectRoot: string, variantName: string): string {
  return path.join(projectRoot, BUILD_DIR, `variant-${variantName}`);
}

/**
 * Write build context files for a variant
 */
export function writeBuildContext(
  projectRoot: string,
  variant: Variant,
  claudeVersion: string
): string {
  const contextPath = getBuildContextPath(projectRoot, variant.name);
  fs.mkdirSync(contextPath, { recursive: true });

  const snapshot = variant.snapshot;

  // Write Dockerfile
  const dockerfile = generateDockerfile(snapshot, claudeVersion);
  fs.writeFileSync(path.join(contextPath, 'Dockerfile'), dockerfile);

  // Write CLAUDE.md if present
  if (snapshot.claudeMdContent) {
    fs.writeFileSync(path.join(contextPath, 'CLAUDE.md'), snapshot.claudeMdContent);
  }

  // Write settings.json
  const settingsJson = generateSettingsJson(snapshot);
  fs.writeFileSync(path.join(contextPath, 'settings.json'), settingsJson);

  // Write claude-config.json
  const claudeConfig = generateClaudeConfig(snapshot);
  fs.writeFileSync(path.join(contextPath, 'claude-config.json'), claudeConfig);

  return contextPath;
}

/**
 * Build a variant container image
 */
export async function buildVariantImage(options: BuildOptions): Promise<BuildResult> {
  const { variant, projectRoot, verbose } = options;

  // Get Claude version
  const claudeVersion = options.claudeVersion || getHostClaudeVersion();
  if (!claudeVersion) {
    throw new Error('Could not determine Claude Code version. Is Claude Code installed?');
  }

  // Write build context
  const contextPath = writeBuildContext(projectRoot, variant, claudeVersion);

  // Generate image name and tag
  const imageName = `sniffbench-variant-${variant.name}`;
  const imageTag = generateImageTag(variant, claudeVersion);
  const fullImageName = `${imageName}:${imageTag}`;

  const startTime = Date.now();

  // Build the image
  await new Promise<void>((resolve, reject) => {
    const buildArgs = [
      'build',
      '-t',
      fullImageName,
      '--build-arg',
      `CLAUDE_VERSION=${claudeVersion}`,
      contextPath,
    ];

    const docker = spawn('docker', buildArgs, {
      stdio: verbose ? 'inherit' : 'pipe',
    });

    let stderr = '';

    if (!verbose && docker.stderr) {
      docker.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    docker.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Docker build failed with code ${code}: ${stderr}`));
      }
    });

    docker.on('error', (err) => {
      reject(new Error(`Failed to start docker build: ${err.message}`));
    });
  });

  const durationMs = Date.now() - startTime;

  const containerInfo: ContainerInfo = {
    imageName,
    imageTag,
    builtAt: new Date().toISOString(),
    claudeVersion,
  };

  return {
    imageName,
    imageTag,
    durationMs,
    containerInfo,
  };
}

/**
 * Check if a variant image exists
 */
export function variantImageExists(variant: Variant): boolean {
  if (!variant.container) {
    return false;
  }

  try {
    const fullName = `${variant.container.imageName}:${variant.container.imageTag}`;
    execSync(`docker image inspect ${fullName}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a variant's container image
 */
export function pruneVariantImage(variant: Variant): boolean {
  if (!variant.container) {
    return false;
  }

  try {
    const fullName = `${variant.container.imageName}:${variant.container.imageTag}`;
    execSync(`docker rmi ${fullName}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * List all sniffbench variant images
 */
export function listVariantImages(): Array<{ name: string; tag: string; size: string }> {
  try {
    const output = execSync(
      'docker images --format "{{.Repository}}|{{.Tag}}|{{.Size}}" sniffbench-variant-*',
      { encoding: 'utf-8' }
    );

    return output
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const [name, tag, size] = line.split('|');
        return { name, tag, size };
      });
  } catch {
    return [];
  }
}

/**
 * Clean up build context directory
 */
export function cleanupBuildContext(projectRoot: string, variantName: string): void {
  const contextPath = getBuildContextPath(projectRoot, variantName);
  if (fs.existsSync(contextPath)) {
    fs.rmSync(contextPath, { recursive: true });
  }
}
