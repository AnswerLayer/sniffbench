/**
 * Case and Rubric Schema Types
 *
 * Cases are structured as "interview questions" - a prompt given to an agent
 * with optional starting files and metadata.
 *
 * Rubrics define how to grade the agent's response - weighted criteria
 * with evaluators that produce scores.
 */

// =============================================================================
// Case Types (The Interview Question)
// =============================================================================

/**
 * A file provided as part of a case (starting code, tests, etc.)
 */
export interface CaseFile {
  /** Relative path within the workspace */
  path: string;

  /** File content (inline) */
  content?: string;

  /** Reference to external file (alternative to inline content) */
  ref?: string;

  /** Whether this file is read-only (agent shouldn't modify) */
  readonly?: boolean;
}

/**
 * Source/origin of a case
 */
export type CaseSource = 'bootstrap' | 'generated' | 'manual' | 'imported' | 'closed_issue';

/**
 * Difficulty level
 */
export type CaseDifficulty = 'easy' | 'medium' | 'hard';

/**
 * Agent behavior expectations for a case
 */
export interface CaseExpectations {
  /** Maximum time in seconds */
  maxTimeSeconds?: number;

  /** Maximum tokens (input + output) */
  maxTokens?: number;

  /** Maximum iterations/turns */
  maxIterations?: number;

  /** Tools the agent is allowed to use */
  allowedTools?: string[];

  /** Tools the agent should not use */
  disallowedTools?: string[];
}

/**
 * A test case - the "interview question" given to an agent
 */
export interface Case {
  /** Unique identifier (e.g., "bootstrap-001", "error-handling-py-001") */
  id: string;

  /** Human-readable title */
  title: string;

  /** The interview question - what we're asking the agent to do */
  prompt: string;

  /** Optional starting files (empty = greenfield task) */
  files?: CaseFile[];

  /**
   * Rubric to use for evaluation.
   * Can be:
   * - string: reference to a rubric ID (e.g., "default", "strict-security")
   * - object: inline rubric or extension of existing rubric
   */
  rubric?: string | RubricReference;

  /** Where this case came from */
  source: CaseSource;

  /** Primary programming language */
  language: string;

  /** Difficulty level */
  difficulty: CaseDifficulty;

  /** Category for organization (e.g., "error-handling", "security", "performance") */
  category: string;

  /** Tags for filtering */
  tags?: string[];

  /** Expected agent behavior bounds */
  expectations?: CaseExpectations;

  /** Version of this case (for tracking changes) */
  version?: string;

  /** Reference solution (not shown to agent, used for validation) */
  solution?: CaseFile[];

  /** Additional notes or hints (not shown to agent) */
  notes?: string;

  // Metadata added by loader
  /** Source file path (added by loader) */
  _sourcePath?: string;

  /** When this case was loaded (added by loader) */
  _loadedAt?: Date;
}

// =============================================================================
// Rubric Types (How We Grade)
// =============================================================================

/**
 * Types of evaluators available
 */
export type EvaluatorType =
  | 'command'      // Run a shell command, check exit code
  | 'pattern'      // Regex match on files
  | 'benchmark'    // Run command, extract numeric metric
  | 'diff'         // Compare output to expected
  | 'llm_judge'    // Use LLM to evaluate (subjective criteria)
  | 'llm_judge_comparison' // Use LLM to compare two answers
  | 'agent_behavior'; // Evaluate agent behavior metrics
/**
 * A rubric criterion
 */
export interface RubricCriterion {
  /** Weight (0-100) */
  weight: number;

  /** Description of the criterion */
  description: string;

  /** Evaluators for this criterion */
  evaluators: Evaluator[];

  /** Whether this criterion is optional */
  optional?: boolean;

  /** Whether partial credit is allowed */
  partialCredit?: boolean;

  /** Pass threshold (0-1) */
  passThreshold?: number;
}

/**
 * Reference to a rubric (string ID or inline override)
 */
export interface RubricReference {
  /** Base rubric ID to extend */
  extends: string;

  /** Criteria to override or add */
  criteria?: Record<string, RubricCriterion | Partial<RubricCriterion>>;
}

/**
 * Base evaluator interface
 */
export interface EvaluatorBase {
  /** Type of evaluator */
  type: EvaluatorType;

  /** Human-readable name */
  name: string;
}

/**
 * Command evaluator - runs a shell command
 */
export interface CommandEvaluator extends EvaluatorBase {
  type: 'command';
  name: string;
  /** Command to run */
  run: string;
  /** Whether this evaluator is optional */
  optional?: boolean;
  /** Whether partial credit is allowed */
  partialCredit?: boolean;
  /** Pass threshold (0-1) */
  passThreshold?: number;
}

/**
 * Pattern evaluator - regex match on files
 */
export interface PatternEvaluator extends EvaluatorBase {
  type: 'pattern';
  name: string;
  /** Files to search */
  files: string;
  /** Regex pattern to match */
  failIfMatch: string;
  /** Whether to ignore case */
  ignoreCase?: boolean;
  /** Whether this evaluator is optional */
  optional?: boolean;
  /** Whether partial credit is allowed */
  partialCredit?: boolean;
}

/**
 * Benchmark evaluator - runs command and extracts numeric metric
 */
export interface BenchmarkEvaluator extends EvaluatorBase {
  type: 'benchmark';
  name: string;
  /** Command to run */
  run: string;
  /** Regex to extract metric */
  extract: string;
  /** Whether this evaluator is optional */
  optional?: boolean;
  /** Whether partial credit is allowed */
  partialCredit?: boolean;
}

/**
 * Diff evaluator - compares output to expected
 */
export interface DiffEvaluator extends EvaluatorBase {
  type: 'diff';
  name: string;
  /** Expected output */
  expected: string;
  /** Whether this evaluator is optional */
  optional?: boolean;
  /** Whether partial credit is allowed */
  partialCredit?: boolean;
}

/**
 * LLM judge evaluator - uses LLM to evaluate answers
 */
export interface LLMJudgeEvaluator extends EvaluatorBase {
  type: 'llm_judge';
  name: string;
  /** Evaluation type */
  evaluate: 'code_quality' | 'readability' | 'documentation' | 'custom';
  /** Custom prompt for custom evaluation */
  prompt?: string;
  /** Model to use for evaluation */
  model?: string;
}

/**
 * Agent behavior evaluator - evaluates agent behavior metrics
 */
export interface AgentBehaviorEvaluator extends EvaluatorBase {
  type: 'agent_behavior';
  name: string;
  /** Metrics to evaluate */
  metrics: string[];
}

/**
 * Evaluator interface (union of all evaluator types)
 */
export type Evaluator = CommandEvaluator | PatternEvaluator | BenchmarkEvaluator | DiffEvaluator | LLMJudgeEvaluator | AgentBehaviorEvaluator;

/**
 * A rubric definition
 */
export interface Rubric {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description */
  description: string;

  /** Criteria for evaluation */
  criteria: Record<string, RubricCriterion>;
}

/**
 * Result of an evaluator run
 */
export interface EvaluatorResult {
  /** Name of the evaluator */
  name: string;

  /** Type of evaluator */
  type: EvaluatorType;

  /** Score (0-1) */
  score: number;

  /** Whether the evaluator passed */
  passed: boolean;

  /** Evidence/reasoning for the score */
  evidence: string;

  /** Additional details */
  details?: Record<string, unknown>;

  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Result of a criterion evaluation
 */
export interface CriterionResult {
  /** Name of the criterion */
  name: string;

  /** Weight of the criterion */
  weight: number;

  /** Score (0-1) */
  score: number;

  /** Whether the criterion passed */
  passed: boolean;

  /** Evidence/reasoning */
  evidence: string;

  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Result of a case run
 */
export interface CaseResult {
  /** Case ID */
  id: string;

  /** Case title */
  title: string;

  /** Overall score (0-1) */
  score: number;

  /** Whether the case passed */
  passed: boolean;

  /** Evidence/reasoning */
  evidence: string;

  /** Individual criterion results */
  criteria: CriterionResult[];

  /** Individual evaluator results */
  evaluators: EvaluatorResult[];

  /** Duration in milliseconds */
  durationMs: number;

  /** Error if any */
  error?: string;
}

/**
 * Result of a run (multiple cases)
 */
export interface RunResult {
  /** Run ID */
  id: string;

  /** Timestamp */
  timestamp: Date;

  /** Cases that were run */
  cases: CaseResult[];

  /** Overall summary */
  summary: RunSummary;

  /** Duration in milliseconds */
  durationMs: number;

  /** Error if any */
  error?: string;
}

/**
 * Summary of a run
 */
export interface RunSummary {
  /** Number of cases run */
  total: number;

  /** Number of cases passed */
  passed: number;

  /** Number of cases failed */
  failed: number;

  /** Average score */
  averageScore: number;

  /** Total duration in milliseconds */
  totalDurationMs: number;
}

// Fix missing properties in CaseResult
export interface CaseResult {
  /** Case ID */
  id: string;

  /** Case title */
  title: string;

  /** Overall score (0-1) */
  score: number;

  /** Whether the case passed */
  passed: boolean;

  /** Evidence/reasoning */
  evidence: string;

  /** Individual criterion results */
  criteria: CriterionResult[];

  /** Individual evaluator results */
  evaluators: EvaluatorResult[];

  /** Duration in milliseconds */
  durationMs: number;

  /** Error if any */
  error?: string;

  /** Agent response */
  agentResponse?: string;

  /** Agent tool calls */
  agentToolCalls?: Array<{
    name: string;
    durationMs: number;
    success: boolean;
  }>;

  /** Agent model */
  agentModel?: string;

  /** Agent tokens */
  agentTokens?: {
    input: number;
    output: number;
    total: number;
  };

  /** Agent files */
  agentFiles?: Array<{
    path: string;
    content: string;
    changed: boolean;
  }>;

  /** Whether the case timed out */
  timedOut?: boolean;

  /** Timestamp */
  timestamp?: Date;
}

// Fix missing properties in RunResult
export interface RunResult {
  /** Run ID */
  id: string;

  /** Timestamp */
  timestamp: Date;

  /** Cases that were run */
  cases: CaseResult[];

  /** Overall summary */
  summary: RunSummary;

  /** Duration in milliseconds */
  durationMs: number;

  /** Error if any */
  error?: string;

  /** Run ID (alias for id) */
  runId?: string;

  /** Agent name */
  agent?: string;

  /** Rubric ID */
  rubricId?: string;

  /** Case results (alias for cases) */
  caseResults?: CaseResult[];
}

// Fix missing properties in RunSummary
export interface RunSummary {
  /** Number of cases run */
  total: number;

  /** Number of cases passed */
  passed: number;

  /** Number of cases failed */
  failed: number;

  /** Number of cases skipped */
  skipped?: number;

  /** Number of cases timed out */
  timedOut?: number;

  /** Average score */
  averageScore: number;

  /** Total duration in milliseconds */
  totalDurationMs: number;
}

// Fix missing properties in CriterionResult
export interface CriterionResult {
  /** Name of the criterion */
  name: string;

  /** Weight of the criterion */
  weight: number;

  /** Score (0-1) */
  score: number;

  /** Whether the criterion passed */
  passed: boolean;

  /** Evidence/reasoning */
  evidence: string;

  /** Weighted score */
  weightedScore?: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Individual evaluator results */
  evaluatorResults?: EvaluatorResult[];
}

// Fix missing optional property in Evaluator
export interface EvaluatorBase {
  /** Type of evaluator */
  type: EvaluatorType;

  /** Human-readable name */
  name: string;

  /** Whether this evaluator is optional */
  optional?: boolean;
}

// Fix missing optional property in LLMJudgeEvaluator
export interface LLMJudgeEvaluator extends EvaluatorBase {
  type: 'llm_judge';
  name: string;
  /** Evaluation type */
  evaluate: 'code_quality' | 'readability' | 'documentation' | 'custom';
  /** Custom prompt for custom evaluation */
  prompt?: string;
  /** Model to use for evaluation */
  model?: string;
}

// Fix missing properties in CaseResult for CLI usage
export interface CaseResult {
  /** Case ID */
  id: string;

  /** Case title */
  title: string;

  /** Overall score (0-1) */
  score: number;

  /** Whether the case passed */
  passed: boolean;

  /** Evidence/reasoning */
  evidence: string;

  /** Individual criterion results */
  criteria: CriterionResult[];

  /** Individual evaluator results */
  evaluators: EvaluatorResult[];

  /** Duration in milliseconds */
  durationMs: number;

  /** Error if any */
  error?: string;

  /** Agent response */
  agentResponse?: string;

  /** Agent tool calls */
  agentToolCalls?: Array<{
    name: string;
    durationMs: number;
    success: boolean;
  }>;

  /** Agent model */
  agentModel?: string;

  /** Agent tokens */
  agentTokens?: {
    input: number;
    output: number;
    total: number;
  };

  /** Agent files */
  agentFiles?: Array<{
    path: string;
    content: string;
    changed: boolean;
  }>;

  /** Whether the case timed out */
  timedOut?: boolean;

  /** Timestamp */
  timestamp?: Date;
}

// Fix missing properties in RunResult for CLI usage
export interface RunResult {
  /** Run ID */
  id: string;

  /** Timestamp */
  timestamp: Date;

  /** Cases that were run */
  cases: CaseResult[];

  /** Overall summary */
  summary: RunSummary;

  /** Duration in milliseconds */
  durationMs: number;

  /** Error if any */
  error?: string;

  /** Run ID (alias for id) */
  runId?: string;

  /** Agent name */
  agent?: string;

  /** Rubric ID */
  rubricId?: string;

  /** Case results (alias for cases) */
  caseResults?: CaseResult[];
}

// Fix missing properties in RunSummary for CLI usage
export interface RunSummary {
  /** Number of cases run */
  total: number;

  /** Number of cases passed */
  passed: number;

  /** Number of cases failed */
  failed: number;

  /** Number of cases skipped */
  skipped?: number;

  /** Number of cases timed out */
  timedOut?: number;

  /** Average score */
  averageScore: number;

  /** Total duration in milliseconds */
  totalDurationMs: number;
}

// Fix missing properties in CriterionResult for CLI usage
export interface CriterionResult {
  /** Name of the criterion */
  name: string;

  /** Weight of the criterion */
  weight: number;

  /** Score (0-1) */
  score: number;

  /** Whether the criterion passed */
  passed: boolean;

  /** Evidence/reasoning */
  evidence: string;

  /** Weighted score */
  weightedScore?: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Individual evaluator results */
  evaluatorResults?: EvaluatorResult[];
}

// Fix missing optional property in Evaluator
export interface EvaluatorBase {
  /** Type of evaluator */
  type: EvaluatorType;

  /** Human-readable name */
  name: string;

  /** Whether this evaluator is optional */
  optional?: boolean;
}

// Fix missing optional property in LLMJudgeEvaluator
export interface LLMJudgeEvaluator extends EvaluatorBase {
  type: 'llm_judge';
  name: string;
  /** Evaluation type */
  evaluate: 'code_quality' | 'readability' | 'documentation' | 'custom';
  /** Custom prompt for custom evaluation */
  prompt?: string;
  /** Model to use for evaluation */
  model?: string;
}
