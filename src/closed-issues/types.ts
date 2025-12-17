/**
 * Closed Issues Case Types
 *
 * Types for the "Closed Issues" case type - uses real closed issues from
 * repositories with merged PRs as ground truth for agent evaluation.
 */

import { Case, CaseDifficulty } from '../cases/types';

// =============================================================================
// Source Types
// =============================================================================

/**
 * Source information for a closed issue case
 */
export interface ClosedIssueSource {
  /** Source control platform */
  type: 'github';

  /** Repository owner (user or organization) */
  repoOwner: string;

  /** Repository name */
  repoName: string;

  /** Issue number */
  issueNumber: number;

  /** PR number that closed the issue */
  prNumber: number;

  /** Commit SHA before PR merge (parent of merge commit) */
  commitBefore: string;

  /** Commit SHA after PR merge */
  commitAfter: string;

  /** Full URL to the issue */
  issueUrl: string;

  /** Full URL to the PR */
  prUrl: string;

  /** Branch name of the PR */
  prBranch?: string;
}

/**
 * A review comment from the PR
 */
export interface PRReviewComment {
  /** Comment body/text */
  body: string;

  /** File path the comment is on */
  path: string;

  /** Line number in the diff */
  line?: number;

  /** Author of the comment */
  author: string;

  /** Whether this was from a code review (vs general comment) */
  isReview: boolean;
}

/**
 * Reference solution extracted from the actual PR
 */
export interface ReferenceSolution {
  /** The full diff of the PR */
  diff: string;

  /** List of files changed in the PR */
  filesChanged: string[];

  /** Number of lines added */
  additions: number;

  /** Number of lines deleted */
  deletions: number;

  /** Test command to run (if detected) */
  testCommand?: string;

  /** Lint command to run (if detected) */
  lintCommand?: string;

  /** Review comments from the PR - can be used as evaluation checks */
  reviewComments?: PRReviewComment[];
}

/**
 * Extended Case interface for closed issues
 */
export interface ClosedIssueCase extends Case {
  source: 'closed_issue';

  /** Closed issue source information */
  closedIssue: ClosedIssueSource;

  /** Reference solution from the actual PR */
  referenceSolution: ReferenceSolution;
}

// =============================================================================
// Scanner Types
// =============================================================================

/**
 * Options for scanning a repository for closed issues
 */
export interface ScanOptions {
  /** Path to the repository (local clone) */
  repoPath: string;

  /** Maximum number of issues to return */
  maxIssues?: number;

  /** Minimum PR size (lines changed) to consider */
  minPrSize?: number;

  /** Maximum PR size (lines changed) to consider */
  maxPrSize?: number;

  /** Maximum number of files changed to consider */
  maxFilesChanged?: number;

  /** Only include issues since this date */
  since?: Date;

  /** Only include PRs that modify test files */
  requireTests?: boolean;

  /** Include issues even if they don't meet all criteria */
  includeAll?: boolean;
}

/**
 * Quality metrics for a potential case
 */
export interface CaseQuality {
  /** Whether the PR modifies test files */
  hasTests: boolean;

  /** Length of the issue description */
  descriptionLength: number;

  /** Total lines changed in PR */
  prSize: number;

  /** Number of files changed in PR */
  filesChanged: number;

  /** Overall quality score (0-100) */
  score: number;
}

/**
 * Result from scanning for a potential case
 */
export interface ScanResult {
  /** The extracted case (partial - needs full extraction) */
  issue: ClosedIssueSummary;

  /** Quality metrics */
  quality: CaseQuality;

  /** Reason if excluded from results */
  excluded?: string;
}

/**
 * Summary of a closed issue (before full extraction)
 */
export interface ClosedIssueSummary {
  /** Issue number */
  issueNumber: number;

  /** Issue title */
  issueTitle: string;

  /** PR number */
  prNumber: number;

  /** PR title */
  prTitle: string;

  /** Repository in owner/name format */
  repo: string;

  /** Issue URL */
  issueUrl: string;

  /** PR URL */
  prUrl: string;

  /** When the PR was merged */
  mergedAt: Date;

  /** Primary language detected */
  language: string;

  /** Estimated difficulty */
  difficulty: CaseDifficulty;
}

// =============================================================================
// GitHub API Types
// =============================================================================

/**
 * GitHub PR data from gh CLI
 */
export interface GitHubPR {
  number: number;
  title: string;
  body: string;
  state: string;
  mergedAt: string | null;
  mergeCommit: { oid: string } | null;
  baseRefName: string;
  headRefName: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  url: string;
  author: { login: string };
  closingIssuesReferences: {
    nodes: Array<{
      number: number;
      title: string;
      body: string;
      url: string;
    }>;
  };
}

/**
 * GitHub Issue data from gh CLI
 */
export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  url: string;
  author: { login: string };
  labels: { nodes: Array<{ name: string }> };
  createdAt: string;
  closedAt: string | null;
}

// =============================================================================
// Comparison Types
// =============================================================================

/**
 * Result from comparing agent solution to reference
 */
export interface ComparisonResult {
  /** Whether tests pass (if available) */
  functionalMatch: boolean;

  /** Similarity score between diffs (0-1) */
  diffSimilarity: number;

  /** Overlap in files modified (0-1) */
  scopeMatch: number;

  /** Whether linting passes (0-1) */
  styleScore: number;

  /** LLM judge score (0-1) */
  llmScore?: number;

  /** Overall weighted score (0-100) */
  overallScore: number;

  /** Detailed breakdown */
  details: ComparisonDetails;
}

/**
 * Detailed comparison breakdown
 */
export interface ComparisonDetails {
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

  /** LLM judge reasoning */
  llmReasoning?: string;
}
