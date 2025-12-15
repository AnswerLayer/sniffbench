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

/** Parsed streaming event from Claude SDK */
export interface StreamEvent {
  type: 'tool_use' | 'text' | 'thinking' | 'result' | 'error' | 'init';
  tool?: { name: string; input: Record<string, unknown> };
  text?: string;
  error?: string;
  model?: string;
}

export interface RunOptions {
  /** Project root to mount into container */
  projectRoot: string;
  /** Environment variables to pass (secrets) */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to stream output */
  stream?: boolean;
  /** Callback for streaming output - raw */
  onOutput?: (type: 'stdout' | 'stderr', data: string) => void;
  /** Callback for parsed streaming events */
  onStreamEvent?: (event: StreamEvent) => void;
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
  /** Model used */
  model?: string;
  /** Token usage from SDK */
  tokens?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
  };
  /** Cost in USD */
  costUsd?: number;
  /** Number of turns */
  numTurns?: number;
  /** Tool calls made */
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
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

  const { projectRoot, env = {}, timeoutMs = DEFAULT_TIMEOUT_MS, stream, onOutput, onStreamEvent } = options;

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

  // Add prompt as argument to SDK entrypoint script
  dockerArgs.push(prompt);

  // Debug: show the docker command being run
  if (process.env.SNIFF_DEBUG) {
    console.error('[DEBUG] docker args:', JSON.stringify(dockerArgs, null, 2));
  }

  const startTime = Date.now();
  let timedOut = false;

  // Run container
  const result = await new Promise<VariantRunResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let finalText = '';  // Accumulated text content for answer
    let jsonBuffer = '';  // Buffer for incomplete JSON lines
    let proc: ChildProcess;
    let timeoutId: NodeJS.Timeout | undefined;

    // Metrics captured from SDK messages
    let model = '';
    let tokens: VariantRunResult['tokens'] | undefined;
    let costUsd: number | undefined;
    let numTurns: number | undefined;
    const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];

    try {
      proc = spawn('docker', dockerArgs);
    } catch (err) {
      reject(new Error(`Failed to spawn docker: ${err}`));
      return;
    }

    // Parse SDK message and emit event
    // Matches the format used by claude-code.ts processMessage()
    const parseSDKMessage = (line: string) => {
      if (!line.trim()) return;
      try {
        const message = JSON.parse(line);

        // Debug: log all messages
        if (process.env.SNIFF_DEBUG) {
          console.error('[DEBUG] SDK message:', message.type, JSON.stringify(message).substring(0, 300));
        }

        switch (message.type) {
          case 'system': {
            // Init message with model info
            if (message.subtype === 'init') {
              model = message.model || '';
              if (onStreamEvent) {
                onStreamEvent({ type: 'init', model: message.model });
              }
            }
            break;
          }

          case 'assistant': {
            // Tool use blocks come through assistant messages
            const content = message.message?.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'tool_use') {
                  toolCalls.push({ name: block.name, input: block.input as Record<string, unknown> });
                  if (onStreamEvent) {
                    onStreamEvent({
                      type: 'tool_use',
                      tool: { name: block.name, input: block.input as Record<string, unknown> }
                    });
                  }
                }
              }
            }
            break;
          }

          case 'stream_event': {
            // Real-time text deltas and thinking
            const event = message.event;
            if (event?.type === 'content_block_delta') {
              const delta = event.delta;
              if (delta?.type === 'text_delta' && delta.text) {
                finalText += delta.text;
                if (onStreamEvent) {
                  onStreamEvent({ type: 'text', text: delta.text });
                }
              } else if (delta?.type === 'thinking_delta' && delta.thinking) {
                if (onStreamEvent) {
                  onStreamEvent({ type: 'thinking', text: delta.thinking });
                }
              }
            }
            break;
          }

          case 'result': {
            // Final result with metrics
            if (message.result && !finalText) {
              finalText = message.result;
            }

            // Extract usage metrics from result message
            const usage = message.usage;
            if (usage) {
              tokens = {
                inputTokens: usage.input_tokens || 0,
                outputTokens: usage.output_tokens || 0,
                cacheReadTokens: usage.cache_read_input_tokens || 0,
                cacheWriteTokens: usage.cache_creation_input_tokens || 0,
                totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
              };
            }
            costUsd = message.total_cost_usd;
            numTurns = message.num_turns;

            if (onStreamEvent) {
              onStreamEvent({ type: 'result', text: message.result || finalText });
            }
            break;
          }

          case 'error': {
            // Error from entrypoint
            if (onStreamEvent) {
              onStreamEvent({ type: 'error', error: message.message });
            }
            break;
          }
        }
      } catch {
        // Not valid JSON, might be partial - ignore
      }
    };

    // Handle stdout - parse SDK JSON messages
    proc.stdout?.on('data', (data) => {
      const str = data.toString();
      stdout += str;
      if (stream && onOutput) {
        onOutput('stdout', str);
      }
      // Parse JSON lines for SDK messages
      jsonBuffer += str;
      const lines = jsonBuffer.split('\n');
      jsonBuffer = lines.pop() || '';  // Keep incomplete line in buffer
      for (const line of lines) {
        parseSDKMessage(line);
      }
    });

    // Handle stderr
    proc.stderr?.on('data', (data) => {
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
        proc.kill('SIGTERM');
        setTimeout(() => proc.kill('SIGKILL'), 5000);
      }, timeoutMs);
    }

    // Handle completion
    proc.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      // Parse any remaining JSON in buffer
      if (jsonBuffer.trim()) parseSDKMessage(jsonBuffer);
      resolve({
        exitCode: code ?? 1,
        stdout: finalText || stdout,  // Use parsed text if available
        stderr,
        durationMs: Date.now() - startTime,
        timedOut,
        model,
        tokens,
        costUsd,
        numTurns,
        toolCalls,
      });
    });

    proc.on('error', (err) => {
      if (timeoutId) clearTimeout(timeoutId);
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

  // Run as current user to avoid root (required for --dangerously-skip-permissions)
  const uid = process.getuid?.() ?? 1000;
  const gid = process.getgid?.() ?? 1000;
  args.push('--user', `${uid}:${gid}`);

  // Set HOME to /tmp so Claude Code can write its config/debug files
  args.push('-e', 'HOME=/tmp');

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
