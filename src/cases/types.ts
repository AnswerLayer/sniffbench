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