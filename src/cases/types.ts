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
  | 'agent_behavior'; // Evaluate agent behavior metrics

/**
 * Base evaluator configuration
 */
export interface EvaluatorBase {
  /** Type of evaluator */
  type: EvaluatorType;

  /** Human-readable name for this check */
  name?: string;

  /** Whether this evaluator is optional (won't fail if it errors) */
  optional?: boolean;

  /** Whether to award partial credit (vs pass/fail) */
  partialCredit?: boolean;

  /** Threshold for passing (0.0-1.0, default 1.0) */
  passThreshold?: number;
}

/**
 * Command evaluator - runs a shell command
 */
export interface CommandEvaluator extends EvaluatorBase {
  type: 'command';

  /** Command to run */
  run: string;

  /** How to parse output (for partial credit) */
  parse?: 'exit_code' | 'json' | 'junit' | 'tap';

  /** JSONPath expression to extract score (when parse=json) */
  scorePath?: string;

  /** Fail if this pattern is found in output */
  failIfMatch?: string;

  /** Fail if this pattern is NOT found in output */
  failIfNoMatch?: string;
}

/**
 * Pattern evaluator - regex match on files
 */
export interface PatternEvaluator extends EvaluatorBase {
  type: 'pattern';

  /** Glob pattern for files to check */
  files: string;

  /** Fail if this pattern matches */
  failIfMatch?: string;

  /** Fail if this pattern does NOT match */
  requireMatch?: string;

  /** Case-insensitive matching */
  ignoreCase?: boolean;
}

/**
 * Benchmark evaluator - extract numeric metrics
 */
export interface BenchmarkEvaluator extends EvaluatorBase {
  type: 'benchmark';

  /** Command to run */
  run: string;

  /** Name of the metric being measured */
  metric: string;

  /** JSONPath to extract value (if output is JSON) */
  valuePath?: string;

  /** Regex to extract value from output */
  valuePattern?: string;

  /** Minimum acceptable value */
  minValue?: number;

  /** Maximum acceptable value */
  maxValue?: number;

  /** Target value (for partial credit calculation) */
  targetValue?: number;
}

/**
 * Diff evaluator - compare output to expected
 */
export interface DiffEvaluator extends EvaluatorBase {
  type: 'diff';

  /** Command that produces actual output */
  run: string;

  /** Expected output (inline) */
  expected?: string;

  /** Path to file with expected output */
  expectedFile?: string;

  /** Ignore whitespace differences */
  ignoreWhitespace?: boolean;

  /** Ignore case differences */
  ignoreCase?: boolean;
}

/**
 * LLM Judge evaluator - use AI to evaluate subjective criteria
 */
export interface LLMJudgeEvaluator extends EvaluatorBase {
  type: 'llm_judge';

  /** What to evaluate */
  evaluate: 'code_quality' | 'readability' | 'documentation' | 'custom';

  /** Custom prompt for evaluation (when evaluate=custom) */
  prompt?: string;

  /** Files to include in evaluation context */
  files?: string;

  /** Model to use (default: configured default) */
  model?: string;
}

/**
 * Agent behavior evaluator - measure how the agent worked
 */
export interface AgentBehaviorEvaluator extends EvaluatorBase {
  type: 'agent_behavior';

  /** Which metric to evaluate */
  metric: 'time' | 'tokens' | 'iterations' | 'tool_calls' | 'self_corrections';

  /** Maximum acceptable value */
  maxValue?: number;

  /** Minimum acceptable value */
  minValue?: number;

  /** Target value (for partial credit) */
  targetValue?: number;
}

/**
 * Union of all evaluator types
 */
export type Evaluator =
  | CommandEvaluator
  | PatternEvaluator
  | BenchmarkEvaluator
  | DiffEvaluator
  | LLMJudgeEvaluator
  | AgentBehaviorEvaluator;

/**
 * A criterion in a rubric (e.g., "correctness", "code_quality")
 */
export interface RubricCriterion {
  /** Weight of this criterion (should sum to 100 across all criteria) */
  weight: number;

  /** Human-readable description */
  description?: string;

  /** Evaluators that contribute to this criterion's score */
  evaluators: Evaluator[];
}

/**
 * A rubric - defines how to grade an agent's response
 */
export interface Rubric {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of when to use this rubric */
  description?: string;

  /** Another rubric to extend (inherit criteria from) */
  extends?: string;

  /** The grading criteria */
  criteria: Record<string, RubricCriterion>;

  // Metadata
  /** Source file path (added by loader) */
  _sourcePath?: string;
}

/**
 * Reference to a rubric with optional overrides
 */
export interface RubricReference {
  /** ID of rubric to use as base */
  extends: string;

  /** Override specific criteria */
  criteria?: Record<string, Partial<RubricCriterion>>;
}

// =============================================================================
// Result Types (What We Measured)
// =============================================================================

/**
 * Result from a single evaluator
 */
export interface EvaluatorResult {
  /** Name of the evaluator */
  name: string;

  /** Type of evaluator */
  type: EvaluatorType;

  /** Score from 0.0 to 1.0 */
  score: number;

  /** Whether this evaluator passed (score >= threshold) */
  passed: boolean;

  /** Evidence (stdout, stderr, or explanation) */
  evidence: string;

  /** Evaluator-specific details */
  details?: Record<string, unknown>;

  /** Error message if evaluator failed to run */
  error?: string;

  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Result for a single criterion
 */
export interface CriterionResult {
  /** Name of the criterion */
  name: string;

  /** Weight of this criterion */
  weight: number;

  /** Weighted score (score * weight / 100) */
  weightedScore: number;

  /** Raw score from 0.0 to 1.0 */
  score: number;

  /** Whether this criterion passed */
  passed: boolean;

  /** Results from individual evaluators */
  evaluatorResults: EvaluatorResult[];
}

/**
 * Agent behavior trace (captured during execution)
 */
export interface AgentTrace {
  /** Total execution time in ms */
  totalTimeMs: number;

  /** Total tokens used (input + output) */
  totalTokens: number;

  /** Number of turns/iterations */
  iterations: number;

  /** Tools that were called */
  toolsUsed: string[];

  /** Number of self-corrections detected */
  selfCorrections: number;

  /** Per-turn details */
  turns?: AgentTurn[];
}

/**
 * A single turn in the agent's execution
 */
export interface AgentTurn {
  /** When this turn started */
  timestamp: Date;

  /** Tokens in (prompt) */
  tokensIn: number;

  /** Tokens out (response) */
  tokensOut: number;

  /** Tools called in this turn */
  toolCalls: string[];

  /** Whether this turn was a self-correction */
  selfCorrection: boolean;
}

/**
 * Result from evaluating a single case
 */
export interface CaseResult {
  /** Case that was evaluated */
  caseId: string;

  /** Overall score from 0 to 100 */
  score: number;

  /** Whether the case passed (score >= pass threshold) */
  passed: boolean;

  /** Results for each criterion */
  criteriaResults: CriterionResult[];

  /** Agent behavior trace */
  agentTrace?: AgentTrace;

  /** Total duration in milliseconds */
  durationMs: number;

  /** Whether it timed out */
  timedOut: boolean;

  /** Error if something went wrong */
  error?: string;

  /** When this result was produced */
  timestamp: Date;
}

/**
 * Result from a full evaluation run
 */
export interface RunResult {
  /** Unique run identifier */
  runId: string;

  /** When the run started */
  startedAt: Date;

  /** When the run completed */
  completedAt: Date;

  /** Agent that was evaluated */
  agent: string;

  /** Rubric used */
  rubricId: string;

  /** Results for each case */
  caseResults: CaseResult[];

  /** Summary statistics */
  summary: RunSummary;
}

/**
 * Summary statistics for a run
 */
export interface RunSummary {
  /** Total cases run */
  total: number;

  /** Cases that passed */
  passed: number;

  /** Cases that failed */
  failed: number;

  /** Cases that were skipped */
  skipped: number;

  /** Cases that timed out */
  timedOut: number;

  /** Average score across all cases */
  averageScore: number;

  /** Total duration in milliseconds */
  totalDurationMs: number;
}
