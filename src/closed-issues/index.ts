/**
 * Closed Issues Module
 *
 * Provides functionality for using real closed issues from repositories
 * as test cases for agent evaluation, with merged PRs as ground truth.
 */

// Types
export type {
  ClosedIssueSource,
  ReferenceSolution,
  ClosedIssueCase,
  ScanOptions,
  CaseQuality,
  ScanResult,
  ClosedIssueSummary,
  GitHubPR,
  GitHubIssue,
  ComparisonResult,
  ComparisonDetails,
} from './types';

// Scanner
export { scanForClosedIssues, extractLinkedIssue } from './scanner';

// Extractor
export { extractCase, generateCaseId, saveCaseToYaml } from './extractor';

// Comparator
export { compareSolutions, calculateDiffSimilarity } from './comparator';
