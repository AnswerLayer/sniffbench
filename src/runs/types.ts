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
  outputTokens: number;
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
 * Full MCP server configuration for container building
 * Includes everything needed to install and configure the server
 */
export interface FullMcpServerConfig {
  /** Server type */
  type: 'stdio' | 'sse' | 'http';
  /** For stdio - the command to run */
  command?: string;
  /** For stdio - command arguments */
  args?: string[];
  /** For stdio - npm package name to install (e.g., "@anthropic-ai/mcp-server-linear") */
  npmPackage?: string;
  /** For sse/http - the server URL */
  url?: string;
  /** For sse/http - request headers (keys only, values are env var names) */
  headers?: Record<string, string>;
  /** Environment variables required at runtime (names only, not values) */
  requiredEnvVars?: string[];
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
 * Comparison details for closed-issue runs
 */
export interface ClosedIssueComparisonDetails {
  /** Files in reference but not in agent solution */
  missingFiles: string[];
  /** Files in agent solution but not in reference */
  extraFiles: string[];
  /** Files modified in both */
  matchingFiles: string[];
  /** Test output if available */
  testOutput?: string;
  /** Lint output if available */
  lintOutput?: string;
}

/**
 * Comparison result for closed-issue runs
 */
export interface ClosedIssueComparison {
  /** Whether tests pass (undefined if no tests available) */
  functionalMatch: boolean | undefined;
  /** Similarity score between diffs (0-1) */
  diffSimilarity: number;
  /** Overlap in files modified (0-1) */
  scopeMatch: number;
  /** Whether linting passes (0-1) */
  styleScore: number;
  /** Overall weighted score (0-100) */
  overallScore: number;
  /** Detailed breakdown */
  details: ClosedIssueComparisonDetails;
}

/**
 * Result of running a closed-issue case
 */
export interface ClosedIssueCaseRun {
  /** Whether the run was successful */
  success: boolean;
  /** Error message if run failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Files changed by the agent */
  filesChanged: string[];
  /** The diff produced by the agent */
  agentDiff: string;
  /** Comparison result against reference solution */
  comparison: ClosedIssueComparison;
  /** Agent output/response */
  agentOutput?: string;
  /** Behavior metrics (tokens, cost) */
  behaviorMetrics?: Partial<BehaviorMetrics>;
}

/**
 * Run type discriminator
 */
export type RunType = 'interview' | 'closed-issues';

/**
 * A complete run - one interview session with all cases
 */
export interface Run {
  /** Unique run ID: "run-{timestamp}-{randomId}" */
  id: string;
  /** Optional human-readable label (e.g., "baseline", "after-tuning") */
  label?: string;
  /** Run type: 'interview' or 'closed-issues' */
  type?: RunType;
  /** ISO timestamp when run was created */
  createdAt: string;
  /** Agent configuration at time of run */
  agent: AgentConfig;
  /** Results per case: key is caseId (for interview runs) */
  cases: Record<string, CaseRun>;
  /** Results per case: key is caseId (for closed-issues runs) */
  closedIssueCases?: Record<string, ClosedIssueCaseRun>;
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
