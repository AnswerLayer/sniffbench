/**
 * Run tracking types for sniffbench
 *
 * Supports multi-run storage with agent configuration capture,
 * enabling meaningful comparison between different agent setups.
 */

/**
 * Behavior metrics captured during a case run
 * (Matches the existing BehaviorMetrics from metrics module)
 */
export interface BehaviorMetrics {
  totalTokens: number;
  toolCount: number;
  costUsd: number;
  explorationRatio: number;
  cacheHitRatio: number;
  avgToolDurationMs: number;
  tokensPerTool: number;
  tokensPerRead: number;
  readCount: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * MCP server configuration (minimal, no secrets)
 */
export interface McpServerConfig {
  /** Server type */
  type: 'sse' | 'stdio' | 'http';
  /** Whether the server is enabled */
  enabled: boolean;
}

/**
 * Agent configuration captured at run time
 */
export interface AgentConfig {
  /** Agent identifier (e.g., "claude-code") */
  name: string;
  /** Agent version (e.g., "2.0.55") or null if unknown */
  version: string | null;
  /** Model used for generation (e.g., "claude-sonnet-4-20250514") */
  model: string;
  /** SHA256 hash of CLAUDE.md content, or undefined if not found */
  claudeMdHash?: string;

  // Phase 2: Enhanced ambient capture
  /** MCP servers configured (key is server name) */
  mcpServers?: Record<string, McpServerConfig>;
  /** Explicitly allowed tools */
  allowedTools?: string[];
  /** Explicitly disallowed tools */
  disallowedTools?: string[];
  /** Permission mode: 'default', 'acceptEdits', 'bypassPermissions' */
  permissionMode?: string;
  /** Whether thinking mode is enabled */
  thinkingEnabled?: boolean;

  /** Reference to registered variant (if linked) */
  variantId?: string;
}

/**
 * Result of running a single case within a run
 */
export interface CaseRun {
  /** Agent's answer to the case prompt */
  answer: string;
  /** Human-assigned grade (1-10), if graded */
  grade?: number;
  /** ISO timestamp of when grading occurred */
  gradedAt?: string;
  /** Who graded (typically "human") */
  gradedBy?: string;
  /** Optional notes from grader */
  notes?: string;
  /** Behavior metrics from the run */
  behaviorMetrics: BehaviorMetrics;
}

/**
 * A complete run - one interview session with all cases
 */
export interface Run {
  /** Unique run ID: "run-{timestamp}-{randomId}" */
  id: string;
  /** Optional human-readable label (e.g., "baseline", "after-tuning") */
  label?: string;
  /** ISO timestamp when run was created */
  createdAt: string;
  /** Agent configuration at time of run */
  agent: AgentConfig;
  /** Results per case: key is caseId */
  cases: Record<string, CaseRun>;
}

/**
 * Root store for all runs
 */
export interface RunStore {
  /** Schema version: "2.0" */
  version: string;
  /** Path to the repo being benchmarked */
  repoPath: string;
  /** ISO timestamp when store was created */
  createdAt: string;
  /** All runs, keyed by run ID */
  runs: Record<string, Run>;
}

/**
 * Legacy baseline format (v1.0) - used for migration
 */
export interface LegacyBaseline {
  caseId: string;
  question: string;
  answer: string;
  grade: number;
  gradedAt: string;
  gradedBy: string;
  notes?: string;
  behaviorMetrics?: BehaviorMetrics;
}

/**
 * Legacy baseline store format (v1.0) - used for migration
 */
export interface LegacyBaselineStore {
  version: string;
  repoPath: string;
  createdAt: string;
  baselines: Record<string, LegacyBaseline>;
}
