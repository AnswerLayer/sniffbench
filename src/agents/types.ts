/**
 * Agent wrapper types
 *
 * Agents are coding assistants that can be evaluated by sniffbench.
 * Each agent wrapper provides a common interface for running prompts
 * and capturing results with full metrics.
 */

/**
 * Token usage breakdown from agent execution
 */
export interface TokenUsage {
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Tokens read from cache */
  cacheReadTokens: number;
  /** Tokens written to cache */
  cacheWriteTokens: number;
  /** Total tokens (input + output) */
  totalTokens: number;
}

/**
 * Tool invocation record
 */
export interface ToolCall {
  /** Unique identifier for this tool call */
  id: string;
  /** Tool name (e.g., 'Read', 'Bash', 'Grep') */
  name: string;
  /** Tool input parameters */
  input: Record<string, unknown>;
  /** Timestamp when tool was invoked */
  timestamp: number;
  /** Duration of tool execution in milliseconds */
  durationMs?: number;
  /** Whether tool execution succeeded */
  success?: boolean;
}

/**
 * Streaming events emitted during agent execution.
 * UI layer consumes these - agent-agnostic interface.
 */
export type AgentEvent =
  | { type: 'start'; timestamp: number; model: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; tool: ToolCall }
  | { type: 'tool_end'; toolId: string; success: boolean; durationMs: number }
  | { type: 'thinking'; text: string }
  | { type: 'error'; message: string; code?: string }
  | { type: 'status'; message: string }
  | { type: 'complete'; result: AgentResult };

/**
 * Result from running an agent - enhanced with full metrics
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

  /** Token usage breakdown */
  tokens: TokenUsage;

  /** Cost in USD */
  costUsd: number;

  /** Number of conversation turns */
  numTurns: number;

  /** Structured tool call records */
  toolCalls: ToolCall[];

  /** Unique tool names used (convenience) */
  toolsUsed: string[];

  /** Model used for this run */
  model: string;

  /** Per-model usage breakdown (for multi-model runs) */
  modelUsage?: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    costUsd: number;
  }>;

  /** Raw data for debugging */
  raw?: {
    stdout?: string;
    stderr?: string;
    exitCode?: number | null;
    sessionId?: string;
  };
}

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

  /** Streaming event callback - receives typed events */
  onEvent?: (event: AgentEvent) => void;

  /**
   * Permission mode for Claude Code SDK
   * - 'default' - Standard behavior, prompts for dangerous operations
   * - 'acceptEdits' - Auto-accept file edit operations
   * - 'bypassPermissions' - Bypass all permission checks (use with caution)
   * - 'plan' - Planning mode, no actual tool execution
   */
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

  /** Tools to allow (whitelist) */
  allowedTools?: string[];

  /** Tools to disallow (blacklist) */
  disallowedTools?: string[];

  /** Maximum budget in USD */
  maxBudgetUsd?: number;

  /** Maximum number of turns */
  maxTurns?: number;

  /** Model to use (agent-specific) */
  model?: string;

  /** Include partial/streaming messages */
  includePartialMessages?: boolean;
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
   * @returns The agent's result with full metrics
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

/**
 * Create empty token usage object
 */
export function emptyTokenUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
  };
}

/**
 * Create empty agent result (for error cases)
 */
export function emptyAgentResult(error?: string): AgentResult {
  return {
    answer: '',
    success: false,
    error,
    timedOut: false,
    durationMs: 0,
    tokens: emptyTokenUsage(),
    costUsd: 0,
    numTurns: 0,
    toolCalls: [],
    toolsUsed: [],
    model: 'unknown',
  };
}
