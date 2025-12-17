/**
 * Closed Issues Runner
 *
 * Runs agents on closed issue cases and compares their solutions
 * to the reference PR that originally closed the issue.
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ClosedIssueCase, ComparisonResult, ReferenceSolution } from './types';
import { calculateDiffSimilarity, parseDiff } from './comparator';
import { Variant } from '../variants/types';
import { runInVariant, RunOptions, VariantRunResult } from '../sandbox/variant-runner';
import { collectRequiredEnvVars } from '../sandbox/variant-container';
import { checkMissingEnvVars, getEnvVars, getEnvFilePath } from '../utils/env';

// =============================================================================
// Types
// =============================================================================

export interface RunCaseOptions {
  /** The closed issue case to run */
  caseData: ClosedIssueCase;

  /** Optional variant to use (runs in container) */
  variant?: Variant;

  /** Project root for variant runs */
  projectRoot?: string;

  /** Timeout in milliseconds (default: 10 minutes) */
  timeoutMs?: number;

  /** Whether to show streaming output */
  stream?: boolean;

  /** Callback for streaming output */
  onOutput?: (type: 'stdout' | 'stderr', data: string) => void;

  /** Callback for status updates */
  onStatus?: (status: string) => void;
}

export interface RunCaseResult {
  /** Case ID that was run */
  caseId: string;

  /** Whether the run was successful (agent didn't error) */
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
  comparison: ComparisonResult;

  /** Agent output/response */
  agentOutput?: string;

  /** Token usage (if available from variant run) */
  tokens?: VariantRunResult['tokens'];

  /** Cost in USD (if available) */
  costUsd?: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Default timeout: 10 minutes */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

// =============================================================================
// Public API
// =============================================================================

/**
 * Run an agent on a closed issue case
 *
 * This function:
 * 1. Clones/prepares a working directory at the pre-PR commit
 * 2. Runs the agent with the issue prompt
 * 3. Captures the agent's changes
 * 4. Compares to the reference solution
 */
export async function runClosedIssueCase(options: RunCaseOptions): Promise<RunCaseResult> {
  const {
    caseData,
    variant,
    projectRoot = process.cwd(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    stream,
    onOutput,
    onStatus,
  } = options;

  const startTime = Date.now();
  const closedIssue = caseData.closedIssue;

  // Create temporary working directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sniff-closed-issue-'));

  try {
    onStatus?.('Preparing working directory...');

    // Clone the repository at the pre-PR commit
    await prepareWorkingDirectory(
      tempDir,
      closedIssue.repoOwner,
      closedIssue.repoName,
      closedIssue.commitBefore
    );

    onStatus?.('Running agent...');

    // Run the agent
    let agentOutput: string;
    let tokens: VariantRunResult['tokens'] | undefined;
    let costUsd: number | undefined;

    if (variant) {
      // Run in variant container
      // Use tempDir as the working directory, but load env vars from original projectRoot
      const result = await runAgentWithVariant({
        variant,
        prompt: caseData.prompt,
        projectRoot: tempDir,
        envSourceDir: projectRoot,
        timeoutMs,
        stream,
        onOutput,
      });

      agentOutput = result.stdout;
      tokens = result.tokens;
      costUsd = result.costUsd;

      if (result.exitCode !== 0 && !result.timedOut) {
        return createErrorResult(
          caseData.id,
          `Agent exited with code ${result.exitCode}: ${result.stderr}`,
          startTime
        );
      }

      if (result.timedOut) {
        return createErrorResult(caseData.id, 'Agent timed out', startTime);
      }
    } else {
      // Run with local claude command
      const result = await runAgentLocally({
        prompt: caseData.prompt,
        workdir: tempDir,
        timeoutMs,
        stream,
        onOutput,
      });

      agentOutput = result.output;

      if (!result.success) {
        return createErrorResult(caseData.id, result.error || 'Agent failed', startTime);
      }
    }

    onStatus?.('Capturing changes...');

    // Capture the agent's changes
    const { diff: agentDiff, filesChanged } = captureAgentChanges(tempDir);

    onStatus?.('Comparing to reference solution...');

    // Compare to reference solution
    const comparison = compareToReference(agentDiff, filesChanged, caseData.referenceSolution);

    return {
      caseId: caseData.id,
      success: true,
      durationMs: Date.now() - startTime,
      filesChanged,
      agentDiff,
      comparison,
      agentOutput,
      tokens,
      costUsd,
    };
  } catch (error) {
    return createErrorResult(caseData.id, (error as Error).message, startTime);
  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// =============================================================================
// Internal Functions
// =============================================================================

/**
 * Create an error result
 */
function createErrorResult(caseId: string, error: string, startTime: number): RunCaseResult {
  return {
    caseId,
    success: false,
    error,
    durationMs: Date.now() - startTime,
    filesChanged: [],
    agentDiff: '',
    comparison: {
      functionalMatch: false,
      diffSimilarity: 0,
      scopeMatch: 0,
      styleScore: 0,
      overallScore: 0,
      details: {
        missingFiles: [],
        extraFiles: [],
        matchingFiles: [],
      },
    },
  };
}

/**
 * Prepare working directory by cloning repo at specific commit
 */
async function prepareWorkingDirectory(
  targetDir: string,
  owner: string,
  repo: string,
  commitSha: string
): Promise<void> {
  // Clone the repository
  const repoUrl = `https://github.com/${owner}/${repo}.git`;

  try {
    // Clone with depth 1 to the target commit
    execSync(`git clone --depth 1 "${repoUrl}" "${targetDir}"`, {
      encoding: 'utf-8',
      timeout: 60000, // 1 minute timeout for clone
    });

    // Fetch the specific commit
    execSync(`git fetch --depth 1 origin ${commitSha}`, {
      cwd: targetDir,
      encoding: 'utf-8',
      timeout: 60000,
    });

    // Checkout to that commit
    execSync(`git checkout ${commitSha}`, {
      cwd: targetDir,
      encoding: 'utf-8',
    });
  } catch (error) {
    throw new Error(`Failed to prepare working directory: ${(error as Error).message}`);
  }
}

/**
 * Run agent with a variant (in Docker container)
 */
async function runAgentWithVariant(options: {
  variant: Variant;
  prompt: string;
  projectRoot: string;
  /** Directory to load env vars from (defaults to projectRoot) */
  envSourceDir?: string;
  timeoutMs: number;
  stream?: boolean;
  onOutput?: (type: 'stdout' | 'stderr', data: string) => void;
}): Promise<VariantRunResult> {
  // Load env vars from envSourceDir (or projectRoot if not specified)
  const envDir = options.envSourceDir || options.projectRoot;
  const requiredEnvVars = collectRequiredEnvVars(options.variant.snapshot);
  const envCheck = checkMissingEnvVars(requiredEnvVars, envDir);

  if (envCheck.missing.length > 0) {
    const envFilePath = getEnvFilePath(envDir);
    throw new Error(
      `Missing required environment variables: ${envCheck.missing.join(', ')}\n\n` +
        `Add them to ${envFilePath} or export them in your shell:\n` +
        envCheck.missing.map((v) => `  ${v}=your-value-here`).join('\n')
    );
  }

  // Get all env var values (merging process.env and .sniffbench/.env)
  const resolvedEnv = getEnvVars(requiredEnvVars, envDir);

  const runOptions: RunOptions = {
    projectRoot: options.projectRoot,
    env: resolvedEnv,
    skipEnvCheck: true, // We've already loaded env vars
    timeoutMs: options.timeoutMs,
    stream: options.stream,
    onOutput: options.onOutput,
  };

  return runInVariant(options.variant, options.prompt, runOptions);
}

/**
 * Run agent locally using claude command
 */
async function runAgentLocally(options: {
  prompt: string;
  workdir: string;
  timeoutMs: number;
  stream?: boolean;
  onOutput?: (type: 'stdout' | 'stderr', data: string) => void;
}): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    let output = '';
    let stderr = '';
    let timedOut = false;

    const proc = spawn('claude', ['--print', '--dangerously-skip-permissions', options.prompt], {
      cwd: options.workdir,
      env: {
        ...process.env,
        // Set HOME to a temp location to avoid polluting user's config
        HOME: options.workdir,
      },
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 5000);
    }, options.timeoutMs);

    proc.stdout?.on('data', (data) => {
      const str = data.toString();
      output += str;
      if (options.stream && options.onOutput) {
        options.onOutput('stdout', str);
      }
    });

    proc.stderr?.on('data', (data) => {
      const str = data.toString();
      stderr += str;
      if (options.stream && options.onOutput) {
        options.onOutput('stderr', str);
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        resolve({ success: false, output, error: 'Agent timed out' });
        return;
      }

      if (code !== 0) {
        resolve({
          success: false,
          output,
          error: `Agent exited with code ${code}: ${stderr}`,
        });
        return;
      }

      resolve({ success: true, output });
    });

    proc.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({ success: false, output, error: error.message });
    });
  });
}

/**
 * Capture the agent's changes as a diff
 */
function captureAgentChanges(workdir: string): { diff: string; filesChanged: string[] } {
  try {
    // Stage all changes to capture them in the diff
    execSync('git add -A', { cwd: workdir, encoding: 'utf-8' });

    // Get the diff
    const diff = execSync('git diff --cached', {
      cwd: workdir,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    // Get list of changed files
    const filesOutput = execSync('git diff --cached --name-only', {
      cwd: workdir,
      encoding: 'utf-8',
    });

    const filesChanged = filesOutput.trim().split('\n').filter(Boolean);

    return { diff, filesChanged };
  } catch (error) {
    // If git fails, try to detect changes manually
    return { diff: '', filesChanged: [] };
  }
}

/**
 * Compare agent's solution to the reference solution
 */
function compareToReference(
  agentDiff: string,
  agentFiles: string[],
  reference: ReferenceSolution
): ComparisonResult {
  // Calculate file overlap
  const { missingFiles, extraFiles, matchingFiles, scopeMatch } = calculateFileOverlap(
    agentFiles,
    reference.filesChanged
  );

  // Calculate diff similarity
  const diffSimilarity = calculateDiffSimilarity(agentDiff, reference.diff);

  // For now, we assume tests pass if there's reasonable similarity
  // Full test running would require setting up the environment
  const functionalMatch = diffSimilarity > 0.7;

  // Style score based on whether files match
  const styleScore = scopeMatch;

  // Calculate overall score
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
    },
  };
}

/**
 * Calculate overlap between agent files and reference files
 */
function calculateFileOverlap(
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
 * Calculate overall weighted score
 */
function calculateOverallScore(metrics: {
  functionalMatch: boolean;
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

  const score =
    (metrics.functionalMatch ? 1 : 0) * weights.functional +
    metrics.diffSimilarity * weights.similarity +
    metrics.scopeMatch * weights.scope +
    metrics.styleScore * weights.style;

  return Math.round(score);
}
