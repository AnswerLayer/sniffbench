/**
 * Variant runner - execute prompts in sandboxed variant containers
 *
 * Runs Claude Code prompts inside Docker containers with variant-specific
 * configuration, enabling isolated parallel A/B testing.
 */

import { spawn, ChildProcess } from 'child_process';
import type { Variant } from '../variants/types';
import { collectRequiredEnvVars } from './variant-container';
import { checkMissingEnvVars, getEnvVars, getEnvFilePath } from '../utils/env';

export interface RunOptions {
  /** Project root to mount into container */
  projectRoot: string;
  /** Environment variables to pass (secrets) */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to stream output */
  stream?: boolean;
  /** Callback for streaming output */
  onOutput?: (type: 'stdout' | 'stderr', data: string) => void;
}

export interface VariantRunResult {
  /** Exit code from container */
  exitCode: number;
  /** Standard output (claude response) */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Execution duration in ms */
  durationMs: number;
  /** Whether execution timed out */
  timedOut: boolean;
}

/** Default timeout: 5 minutes */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Run a prompt in a variant container
 */
export async function runInVariant(
  variant: Variant,
  prompt: string,
  options: RunOptions
): Promise<VariantRunResult> {
  if (!variant.container) {
    throw new Error(`Variant "${variant.name}" has no container image. Run "sniff variant build ${variant.name}" first.`);
  }

  const { projectRoot, env = {}, timeoutMs = DEFAULT_TIMEOUT_MS, stream, onOutput } = options;

  // Collect required env vars and check availability (from process.env and .sniffbench/.env)
  const requiredEnvVars = collectRequiredEnvVars(variant.snapshot);
  const envCheck = checkMissingEnvVars(requiredEnvVars, projectRoot);

  if (envCheck.missing.length > 0) {
    const envFilePath = getEnvFilePath(projectRoot);
    throw new Error(
      `Missing required environment variables: ${envCheck.missing.join(', ')}\n\n` +
      `Add them to ${envFilePath} or export them in your shell:\n` +
      envCheck.missing.map(v => `  ${v}=your-value-here`).join('\n')
    );
  }

  // Get all env var values (merging process.env and .sniffbench/.env)
  const resolvedEnv = getEnvVars(requiredEnvVars, projectRoot);

  // Build docker run arguments
  const fullImageName = `${variant.container.imageName}:${variant.container.imageTag}`;
  const dockerArgs = buildDockerArgs(fullImageName, projectRoot, { ...resolvedEnv, ...env }, variant);

  // Add claude arguments - skip permissions since container is already sandboxed
  dockerArgs.push('-p', '--dangerously-skip-permissions', prompt);

  const startTime = Date.now();
  let timedOut = false;

  // Run container
  const result = await new Promise<VariantRunResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let process: ChildProcess;
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      process = spawn('docker', dockerArgs);
    } catch (err) {
      reject(new Error(`Failed to spawn docker: ${err}`));
      return;
    }

    // Handle stdout
    process.stdout?.on('data', (data) => {
      const str = data.toString();
      stdout += str;
      if (stream && onOutput) {
        onOutput('stdout', str);
      }
    });

    // Handle stderr
    process.stderr?.on('data', (data) => {
      const str = data.toString();
      stderr += str;
      if (stream && onOutput) {
        onOutput('stderr', str);
      }
    });

    // Handle timeout
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        process.kill('SIGTERM');
        // Give it a moment to clean up, then force kill
        setTimeout(() => process.kill('SIGKILL'), 5000);
      }, timeoutMs);
    }

    // Handle completion
    process.on('close', (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - startTime,
        timedOut,
      });
    });

    process.on('error', (err) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(new Error(`Docker process error: ${err.message}`));
    });
  });

  return result;
}

/**
 * Build docker run arguments
 */
function buildDockerArgs(
  imageName: string,
  projectRoot: string,
  env: Record<string, string>,
  _variant: Variant
): string[] {
  const args: string[] = ['run', '--rm'];

  // Mount project directory read-only
  args.push('-v', `${projectRoot}:/workspace:ro`);

  // Pass all resolved environment variables
  for (const [key, value] of Object.entries(env)) {
    args.push('-e', `${key}=${value}`);
  }

  // Enable network access for API calls
  args.push('--network', 'host');

  // Add image name
  args.push(imageName);

  return args;
}

/**
 * Run the same prompt on multiple variants in parallel
 */
export async function runInVariantsParallel(
  variants: Variant[],
  prompt: string,
  options: RunOptions
): Promise<Map<string, VariantRunResult>> {
  const results = new Map<string, VariantRunResult>();

  // Run all variants in parallel
  const promises = variants.map(async (variant) => {
    try {
      const result = await runInVariant(variant, prompt, options);
      results.set(variant.name, result);
    } catch (err) {
      // Create error result
      results.set(variant.name, {
        exitCode: 1,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
        durationMs: 0,
        timedOut: false,
      });
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * Check if Docker is available
 */
export async function checkDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const docker = spawn('docker', ['version'], { stdio: 'pipe' });
    docker.on('close', (code) => resolve(code === 0));
    docker.on('error', () => resolve(false));
  });
}
