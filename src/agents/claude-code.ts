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
      // --output-format: get structured output if available
      const args = ['-p', prompt];

      const proc = spawn(this.cliPath, args, {
        cwd: options.cwd,
        env: {
          ...process.env,
          ...options.env,
          // Ensure non-interactive
          CI: 'true',
        },
        timeout: timeoutMs,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      proc.stdout?.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        options.onOutput?.(chunk);
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
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

        // Parse the output to extract the answer
        // Claude Code's -p mode outputs the response directly
        const answer = this.parseAnswer(stdout);

        // Try to extract tool usage from output
        const toolsUsed = this.parseToolsUsed(stdout);

        resolve({
          answer,
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
   * Parse tools used from output
   *
   * Claude Code shows tool usage in its output. Try to extract them.
   */
  private parseToolsUsed(stdout: string): string[] {
    const tools: Set<string> = new Set();

    // Look for common tool patterns in Claude Code output
    const toolPatterns = [
      /Read\s+\S+/g,        // Read file
      /Edit\s+\S+/g,        // Edit file
      /Write\s+\S+/g,       // Write file
      /Bash\s*\([^)]+\)/g,  // Bash command
      /Grep\s+\S+/g,        // Grep search
      /Glob\s+\S+/g,        // Glob search
    ];

    for (const pattern of toolPatterns) {
      const matches = stdout.match(pattern);
      if (matches) {
        matches.forEach((m) => tools.add(m.split(/\s+/)[0]));
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
