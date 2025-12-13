/**
 * Sandbox module for sniffbench
 *
 * Provides isolated environments for running coding agent evaluations safely.
 *
 * @example
 * ```typescript
 * import { createSandboxManager, checkDocker } from 'sniffbench/sandbox';
 *
 * // Quick check if Docker is available
 * const status = await checkDocker();
 * if (!status.available) {
 *   console.error(status.error);
 *   console.log(status.suggestion);
 *   process.exit(1);
 * }
 *
 * // Create a sandbox manager
 * const manager = createSandboxManager();
 *
 * // Create and use a sandbox
 * const sandbox = await manager.create({
 *   workdir: '/path/to/project',
 *   image: 'node:20-slim',
 * });
 *
 * const result = await sandbox.exec('npm test');
 * console.log(result.stdout);
 *
 * await sandbox.destroy();
 * ```
 */

export * from './types';
export { DockerSandboxManager, DockerNotAvailableError } from './docker';

// Variant container building and execution
export {
  getHostClaudeVersion,
  collectRequiredEnvVars,
  validateVariantEnv,
  generateDockerfile,
  getBuildContextPath,
  writeBuildContext,
  buildVariantImage,
  variantImageExists,
  pruneVariantImage,
  listVariantImages,
  cleanupBuildContext,
} from './variant-container';

export type { BuildOptions, BuildResult } from './variant-container';

export {
  runInVariant,
  runInVariantsParallel,
  checkDockerAvailable,
} from './variant-runner';

export type { RunOptions, VariantRunResult } from './variant-runner';

import { DockerSandboxManager } from './docker';
import { SandboxManager, AvailabilityStatus } from './types';

/**
 * Create a sandbox manager instance.
 *
 * Currently uses Docker as the backend. Future versions may support
 * other backends like Podman, microVMs, or cloud sandboxes.
 */
export function createSandboxManager(): SandboxManager {
  return new DockerSandboxManager();
}

/**
 * Quick check if Docker is available with helpful error messages.
 *
 * Use this before operations that require Docker to provide
 * friendly feedback to users.
 *
 * @example
 * ```typescript
 * const status = await checkDocker();
 * if (!status.available) {
 *   console.error(`Error: ${status.error}`);
 *   console.log(`\n${status.suggestion}`);
 *   process.exit(1);
 * }
 * console.log(`Docker ${status.version} is ready`);
 * ```
 */
export async function checkDocker(): Promise<AvailabilityStatus> {
  const manager = new DockerSandboxManager();
  return manager.checkAvailability();
}

/**
 * Default sandbox configuration values.
 * Users can override any of these when creating a sandbox.
 */
export const DEFAULT_CONFIG = {
  /** Default Docker image */
  image: 'node:20-slim',

  /** Default memory limit in MB */
  memoryMB: 512,

  /** Default CPU limit (1.0 = 1 CPU) */
  cpuLimit: 1.0,

  /** Default timeout in seconds */
  timeoutSeconds: 300,

  /** Network disabled by default for security */
  networkEnabled: false,
} as const;

/**
 * Recommended images for different language environments.
 * These are official images that work well with sniffbench.
 */
export const RECOMMENDED_IMAGES = {
  node: {
    '20': 'node:20-slim',
    '18': 'node:18-slim',
    '16': 'node:16-slim',
    latest: 'node:20-slim',
  },
  python: {
    '3.12': 'python:3.12-slim',
    '3.11': 'python:3.11-slim',
    '3.10': 'python:3.10-slim',
    latest: 'python:3.12-slim',
  },
  go: {
    '1.22': 'golang:1.22-alpine',
    '1.21': 'golang:1.21-alpine',
    latest: 'golang:1.22-alpine',
  },
  rust: {
    latest: 'rust:slim',
  },
  java: {
    '21': 'eclipse-temurin:21-jdk',
    '17': 'eclipse-temurin:17-jdk',
    '11': 'eclipse-temurin:11-jdk',
    latest: 'eclipse-temurin:21-jdk',
  },
} as const;
