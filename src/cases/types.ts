/**
 * Case types for sniffbench evaluation cases
 */

export interface CaseFile {
  path: string;
  content: string;
}

export interface CaseTest {
  name: string;
  description?: string;
}

export interface CaseValidation {
  /** Type of validation: test_suite, output_match, custom */
  type: 'test_suite' | 'output_match' | 'custom';

  /** Command to run for validation */
  command: string;

  /** Expected tests (for test_suite type) */
  tests?: CaseTest[];

  /** Expected output pattern (for output_match type) */
  expectedOutput?: string;
}

export interface CaseScoring {
  correctness?: number;
  code_quality?: number;
  safety?: number;
  performance?: number;
  maintainability?: number;
}

export interface Case {
  /** Unique identifier */
  id: string;

  /** Human-readable title */
  title: string;

  /** Detailed description of what needs to be fixed */
  description: string;

  /** Category (error-handling, security, performance, etc.) */
  category: string;

  /** Primary language */
  language: string;

  /** Difficulty level */
  difficulty: 'easy' | 'medium' | 'hard';

  /** Tags for filtering */
  tags: string[];

  /** Files that make up the case */
  files: CaseFile[];

  /** How to validate the solution */
  validation: CaseValidation;

  /** Solution hints (not shown to agent) */
  solution_hints?: string[];

  /** Custom scoring weights */
  scoring?: CaseScoring;

  /** Source file path (added by loader) */
  sourcePath?: string;
}

export interface CaseResult {
  /** Case that was run */
  caseId: string;

  /** Whether validation passed */
  passed: boolean;

  /** Exit code from validation command */
  exitCode: number;

  /** Stdout from validation */
  stdout: string;

  /** Stderr from validation */
  stderr: string;

  /** Duration in milliseconds */
  durationMs: number;

  /** Whether it timed out */
  timedOut: boolean;

  /** Individual test results (if applicable) */
  testResults?: TestResult[];

  /** Error message if something went wrong */
  error?: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}

export interface RunResult {
  /** Unique run identifier */
  runId: string;

  /** When the run started */
  startedAt: Date;

  /** When the run completed */
  completedAt: Date;

  /** Agent used */
  agent: string;

  /** Results for each case */
  caseResults: CaseResult[];

  /** Summary statistics */
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    timedOut: number;
  };
}
