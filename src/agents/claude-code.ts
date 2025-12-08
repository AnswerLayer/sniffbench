/**
 * Claude Code agent wrapper
 *
 * Wraps the Claude Code CLI (`claude`) to run prompts programmatically.
 * Uses the --print (-p) flag for non-interactive single-prompt execution.
 */

import { spawn } from 'child_process';
import { AgentWrapper, AgentResult, AgentRunOptions } from './types';

/**
 * Claude Code agent wrapper
 */
export class ClaudeCodeAgent implements AgentWrapper {
  name = 'claude-code';
  displayName = 'Claude Code';

  /** Path to claude CLI (defaults to 'claude' in PATH) */
  private cliPath: string;

  constructor(cliPath: string = 'claude') {
    this.cliPath = cliPath;
  }

  /**
   * Check if Claude Code CLI is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const version = await this.getVersion();
      return version !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get Claude Code version
   */
  async getVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn(this.cliPath, ['--version'], {
        timeout: 5000,
      });

      let stdout = '';
      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          resolve(stdout.trim());
        } else {
          resolve(null);
        }
      });

      proc.on('error', () => {
        resolve(null);
      });
    });
  }

  /**
   * Run a prompt through Claude Code
   *
   * Uses `claude -p "prompt"` for non-interactive execution.
   * The agent will explore the codebase and provide an answer.
   */
  async run(prompt: string, options: AgentRunOptions): Promise<AgentResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 300000; // 5 min default

    return new Promise((resolve) => {
      // Build command args
      // -p: print mode (non-interactive, single prompt)
      // --output-format stream-json: get real-time streaming JSON output
      // --verbose: required for stream-json
      // --include-partial-messages: stream text as it's generated
      const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];

      const proc = spawn(this.cliPath, args, {
        cwd: options.cwd,
        env: {
          ...process.env,
          ...options.env,
          // Ensure non-interactive
          CI: 'true',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Close stdin immediately - claude -p doesn't need interactive input
      proc.stdin?.end();

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let finalAnswer = '';
      let lineBuffer = '';

      proc.stdout?.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;

        // Parse streaming JSON - each line is a JSON object
        lineBuffer += chunk;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            const displayText = this.extractDisplayText(msg);
            if (displayText && options.onOutput) {
              options.onOutput(displayText);
            }
            // Capture final answer from result
            if (msg.type === 'result' && msg.result) {
              finalAnswer = msg.result;
            }
          } catch {
            // Not valid JSON, output raw
            options.onOutput?.(line + '\n');
          }
        }
      });

      proc.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
      });

      // Handle timeout
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        // Give it a moment to clean up, then force kill
        setTimeout(() => {
          proc.kill('SIGKILL');
        }, 5000);
      }, timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        // Try to extract tool usage from JSON output
        const toolsUsed = this.parseToolsUsedFromJson(stdout);

        resolve({
          answer: finalAnswer || this.parseAnswer(stdout),
          success: code === 0 && !timedOut,
          error: timedOut ? 'Timed out' : (code !== 0 ? `Exit code: ${code}` : undefined),
          timedOut,
          durationMs,
          toolsUsed,
          stdout,
          stderr,
          exitCode: code,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        resolve({
          answer: '',
          success: false,
          error: err.message,
          timedOut: false,
          durationMs,
          stdout,
          stderr,
          exitCode: null,
        });
      });
    });
  }

  /**
   * Parse the answer from Claude Code output
   *
   * The -p flag outputs the response directly, but there may be
   * some formatting or metadata to strip.
   */
  private parseAnswer(stdout: string): string {
    // For now, return the full output
    // TODO: Parse out any metadata/formatting if needed
    return stdout.trim();
  }

  /**
   * Extract displayable text from a stream-json message
   */
  private extractDisplayText(msg: Record<string, unknown>): string | null {
    // Handle streaming text deltas (with --include-partial-messages)
    if (msg.type === 'stream_event') {
      const event = msg.event as Record<string, unknown> | undefined;
      if (event?.type === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          return delta.text;
        }
      }
      // Ignore content_block_start - we'll show details from assistant message
    }

    // Handle complete assistant messages with tool details
    if (msg.type === 'assistant' && msg.message) {
      const message = msg.message as Record<string, unknown>;
      const content = message.content as Array<Record<string, unknown>> | undefined;
      if (content && Array.isArray(content)) {
        const textParts: string[] = [];
        for (const part of content) {
          if (part.type === 'tool_use') {
            const input = part.input as Record<string, unknown> | undefined;
            const formatted = this.formatToolCall(part.name as string, input);
            if (formatted) {
              textParts.push(formatted);
            }
          }
        }
        if (textParts.length > 0) {
          return '\n' + textParts.join('\n') + '\n';
        }
      }
    }

    // Handle tool results - just show checkmark, skip content
    if (msg.type === 'user') {
      const toolResult = msg.tool_use_result as Record<string, unknown> | undefined;
      if (toolResult) {
        return null; // Don't show tool results - too noisy
      }
    }

    return null;
  }

  /**
   * Format a tool call for display
   */
  private formatToolCall(name: string, input: Record<string, unknown> | undefined): string | null {
    if (!input) return `  › ${name}`;

    const dim = '\x1b[2m'; // dim
    const reset = '\x1b[0m';

    switch (name) {
      case 'Read': {
        const path = (input.file_path as string || '').split('/').slice(-2).join('/');
        return `  › Read ${dim}${path}${reset}`;
      }
      case 'Glob': {
        return `  › Glob ${dim}${input.pattern || ''}${reset}`;
      }
      case 'Grep': {
        return `  › Grep ${dim}"${input.pattern || ''}"${reset}`;
      }
      case 'Bash': {
        const cmd = (input.command as string || '').substring(0, 50);
        const truncated = (input.command as string || '').length > 50 ? '...' : '';
        return `  › Bash ${dim}${cmd}${truncated}${reset}`;
      }
      case 'Edit':
      case 'Write': {
        const path = (input.file_path as string || '').split('/').slice(-2).join('/');
        return `  › ${name} ${dim}${path}${reset}`;
      }
      case 'Task': {
        return `  › Task ${dim}${input.description || ''}${reset}`;
      }
      default:
        return `  › ${name}`;
    }
  }

  /**
   * Parse tools used from JSON output
   */
  private parseToolsUsedFromJson(stdout: string): string[] {
    const tools: Set<string> = new Set();

    const lines = stdout.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'assistant' && msg.message) {
          const content = msg.message.content;
          if (Array.isArray(content)) {
            for (const part of content) {
              if (part.type === 'tool_use' && part.name) {
                tools.add(part.name);
              }
            }
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }

    return Array.from(tools);
  }
}

/**
 * Create a Claude Code agent instance
 */
export function createClaudeCodeAgent(cliPath?: string): ClaudeCodeAgent {
  return new ClaudeCodeAgent(cliPath);
}
