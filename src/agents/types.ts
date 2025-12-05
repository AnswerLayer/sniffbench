/**
 * Agent wrapper types
 *
 * Agents are coding assistants that can be evaluated by sniffbench.
 * Each agent wrapper provides a common interface for running prompts
 * and capturing results.
 */

/**
 * Options for running an agent
 */
export interface AgentRunOptions {
  /** Working directory for the agent */
  cwd: string;

  /** Timeout in milliseconds */
  timeoutMs?: number;

  /** Environment variables to pass */
  env?: Record<string, string>;

  /** Callback for streaming output */
  onOutput?: (chunk: string) => void;
}

/**
 * Result from running an agent
 */
export interface AgentResult {
  /** The agent's final answer/output */
  answer: string;

  /** Whether the run completed successfully */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Whether the run timed out */
  timedOut: boolean;

  /** Duration in milliseconds */
  durationMs: number;

  /** Tools/commands the agent used (if trackable) */
  toolsUsed?: string[];

  /** Tokens used (if trackable) */
  tokensUsed?: number;

  /** Raw stdout */
  stdout: string;

  /** Raw stderr */
  stderr: string;

  /** Exit code */
  exitCode: number | null;
}

/**
 * Agent wrapper interface
 */
export interface AgentWrapper {
  /** Agent identifier */
  name: string;

  /** Human-readable display name */
  displayName: string;

  /** Check if this agent is available on the system */
  isAvailable(): Promise<boolean>;

  /** Get version information */
  getVersion(): Promise<string | null>;

  /**
   * Run a prompt through the agent
   *
   * @param prompt - The prompt/question to send to the agent
   * @param options - Run options (cwd, timeout, etc.)
   * @returns The agent's result
   */
  run(prompt: string, options: AgentRunOptions): Promise<AgentResult>;
}

/**
 * Registry of available agents
 */
export interface AgentRegistry {
  /** Get an agent by name */
  get(name: string): AgentWrapper | undefined;

  /** List all registered agents */
  list(): AgentWrapper[];

  /** Register a new agent */
  register(agent: AgentWrapper): void;

  /** Find available agents on the system */
  findAvailable(): Promise<AgentWrapper[]>;
}
