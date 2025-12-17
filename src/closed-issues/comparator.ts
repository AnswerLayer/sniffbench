/**
 * Solution Comparator
 *
 * Compares an agent's solution to the reference PR solution,
 * providing multiple metrics for evaluation.
 */

import { execSync } from 'child_process';
import {
  ComparisonResult,
  ComparisonDetails,
  ReferenceSolution,
} from './types';
import { Sandbox } from '../sandbox/types';

// =============================================================================
// Public API
// =============================================================================

/**
 * Compare agent solution to reference PR solution
 *
 * @param agentFiles - Files created/modified by the agent
 * @param referenceSolution - The reference solution from the actual PR
 * @param sandbox - Sandbox for running tests and linting
 * @param workdir - Working directory in sandbox
 * @returns Comparison result with metrics
 */
export async function compareSolutions(
  agentFiles: string[],
  referenceSolution: ReferenceSolution,
  sandbox: Sandbox,
  workdir: string
): Promise<ComparisonResult> {
  const referenceFiles = referenceSolution.filesChanged;

  // Calculate file overlap
  const { missingFiles, extraFiles, matchingFiles, scopeMatch } = calculateFileOverlap(
    agentFiles,
    referenceFiles
  );

  // Run tests if available
  const { functionalMatch, testOutput } = await runTests(
    sandbox,
    referenceSolution.testCommand
  );

  // Run linting if available
  const { styleScore, lintOutput } = await runLint(
    sandbox,
    referenceSolution.lintCommand
  );

  // Calculate diff similarity
  const diffSimilarity = await calculateDiffSimilarityInSandbox(
    sandbox,
    workdir,
    referenceSolution.diff
  );

  // Calculate overall score (weighted average)
  const overallScore = calculateOverallScore({
    functionalMatch,
    diffSimilarity,
    scopeMatch,
    styleScore,
  });

  return {
    functionalMatch,
    diffSimilarity,
    scopeMatch,
    styleScore,
    overallScore,
    details: {
      missingFiles,
      extraFiles,
      matchingFiles,
      testOutput,
      lintOutput,
    },
  };
}

/**
 * Calculate similarity between two diffs using Levenshtein distance
 *
 * @param diff1 - First diff
 * @param diff2 - Second diff
 * @returns Similarity score between 0 and 1
 */
export function calculateDiffSimilarity(diff1: string, diff2: string): number {
  if (!diff1 && !diff2) return 1;
  if (!diff1 || !diff2) return 0;

  // Normalize diffs (remove line numbers, whitespace variations)
  const normalized1 = normalizeDiff(diff1);
  const normalized2 = normalizeDiff(diff2);

  // Use a more efficient similarity algorithm for large strings
  if (normalized1.length > 10000 || normalized2.length > 10000) {
    return calculateJaccardSimilarity(normalized1, normalized2);
  }

  // Calculate Levenshtein distance
  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);

  if (maxLength === 0) return 1;

  return 1 - distance / maxLength;
}

// =============================================================================
// Internal Functions
// =============================================================================

/**
 * Calculate overlap between agent files and reference files
 */
export function calculateFileOverlap(
  agentFiles: string[],
  referenceFiles: string[]
): {
  missingFiles: string[];
  extraFiles: string[];
  matchingFiles: string[];
  scopeMatch: number;
} {
  const agentSet = new Set(agentFiles);
  const refSet = new Set(referenceFiles);

  const matchingFiles = agentFiles.filter((f) => refSet.has(f));
  const missingFiles = referenceFiles.filter((f) => !agentSet.has(f));
  const extraFiles = agentFiles.filter((f) => !refSet.has(f));

  // Calculate Jaccard similarity
  const union = new Set([...agentFiles, ...referenceFiles]);
  const scopeMatch = union.size > 0 ? matchingFiles.length / union.size : 0;

  return {
    missingFiles,
    extraFiles,
    matchingFiles,
    scopeMatch,
  };
}

/**
 * Run tests in sandbox
 */
async function runTests(
  sandbox: Sandbox,
  testCommand?: string
): Promise<{ functionalMatch: boolean | undefined; testOutput?: string }> {
  if (!testCommand) {
    return { functionalMatch: undefined };
  }

  try {
    const result = await sandbox.exec(testCommand, { timeoutSeconds: 120 });
    const output = `${result.stdout}\n${result.stderr}`.trim();

    return {
      functionalMatch: result.exitCode === 0,
      testOutput: output,
    };
  } catch (error) {
    return {
      functionalMatch: false,
      testOutput: `Error running tests: ${(error as Error).message}`,
    };
  }
}

/**
 * Run linting in sandbox
 */
async function runLint(
  sandbox: Sandbox,
  lintCommand?: string
): Promise<{ styleScore: number; lintOutput?: string }> {
  if (!lintCommand) {
    return { styleScore: 1, lintOutput: 'No lint command available' };
  }

  try {
    const result = await sandbox.exec(lintCommand, { timeoutSeconds: 60 });
    const output = `${result.stdout}\n${result.stderr}`.trim();

    // Lint passes if exit code is 0
    const styleScore = result.exitCode === 0 ? 1 : 0;

    return {
      styleScore,
      lintOutput: output,
    };
  } catch (error) {
    return {
      styleScore: 0,
      lintOutput: `Error running lint: ${(error as Error).message}`,
    };
  }
}

/**
 * Calculate diff similarity by generating agent diff and comparing
 */
async function calculateDiffSimilarityInSandbox(
  sandbox: Sandbox,
  workdir: string,
  referenceDiff: string
): Promise<number> {
  try {
    // Generate diff of agent's changes
    const result = await sandbox.exec('git diff HEAD', { timeoutSeconds: 30, cwd: workdir });

    if (result.exitCode !== 0) {
      // If git diff fails, fall back to file content comparison
      return 0.5;
    }

    const agentDiff = result.stdout;
    return calculateDiffSimilarity(agentDiff, referenceDiff);
  } catch {
    // Fall back to estimating based on file overlap
    return 0.5;
  }
}

/**
 * Normalize a diff for comparison
 */
function normalizeDiff(diff: string): string {
  return diff
    // Remove line numbers from context
    .replace(/^@@ .* @@.*$/gm, '')
    // Remove diff headers
    .replace(/^(diff|index|---|\+\+\+|new file|deleted file).*$/gm, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate Jaccard similarity for large strings (using line sets)
 */
function calculateJaccardSimilarity(s1: string, s2: string): number {
  const lines1 = new Set(
    s1
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  );
  const lines2 = new Set(
    s2
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  );

  const intersection = new Set([...lines1].filter((x) => lines2.has(x)));
  const union = new Set([...lines1, ...lines2]);

  if (union.size === 0) return 1;

  return intersection.size / union.size;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  // Use the faster algorithm for reasonable lengths
  const m = s1.length;
  const n = s2.length;

  // Create two rows for the DP table
  let prevRow = new Array(n + 1);
  let currRow = new Array(n + 1);

  // Initialize the first row
  for (let j = 0; j <= n; j++) {
    prevRow[j] = j;
  }

  // Fill the table
  for (let i = 1; i <= m; i++) {
    currRow[0] = i;

    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1, // Deletion
        currRow[j - 1] + 1, // Insertion
        prevRow[j - 1] + cost // Substitution
      );
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[n];
}

/**
 * Calculate overall weighted score
 */
export function calculateOverallScore(metrics: {
  functionalMatch: boolean | undefined;
  diffSimilarity: number;
  scopeMatch: number;
  styleScore: number;
}): number {
  // Weights from the rubric
  const weights = {
    functional: 40,
    similarity: 35,
    scope: 15,
    style: 10,
  };

  // Only award functional points if tests actually ran
  const functionalScore = metrics.functionalMatch === true ? weights.functional : 0;

  const score =
    functionalScore +
    metrics.diffSimilarity * weights.similarity +
    metrics.scopeMatch * weights.scope +
    metrics.styleScore * weights.style;

  return Math.round(score);
}

/**
 * Parse a unified diff to extract changed lines
 */
export function parseDiff(diff: string): {
  additions: string[];
  deletions: string[];
  files: string[];
} {
  const additions: string[] = [];
  const deletions: string[] = [];
  const files: string[] = [];

  let currentFile: string | null = null;

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/diff --git a\/(.*) b\/(.*)/);
      if (match) {
        currentFile = match[2];
        if (!files.includes(currentFile)) {
          files.push(currentFile);
        }
      }
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions.push(line.substring(1));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions.push(line.substring(1));
    }
  }

  return { additions, deletions, files };
}
