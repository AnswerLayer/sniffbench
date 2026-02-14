/**
 * Evaluation runner - executes cases in sandboxes and evaluates results
 *
 * This is the core evaluation engine that:
 * 1. Sets up the sandbox environment
 * 2. Runs the case (agent attempts to solve the problem)
 * 3. Applies the rubric to evaluate the result
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  Case,
  CaseResult,
  CriterionResult,
  EvaluatorResult,
  RunResult,
  RunSummary,
  EvaluatorType,
} from '../cases/types';
import { createSandboxManager, checkDocker, RECOMMENDED_IMAGES } from '../sandbox';
import { Sandbox, SandboxConfig } from '../sandbox/types';
import { getRubricRegistry } from '../rubrics/loader';
import { getAgent } from '../agents/registry';
import type { AgentResult } from '../agents/types';

export interface RunnerOptions {
  /** Agent being evaluated (for logging) */
  agent: string;

  /** Timeout per case in seconds */
  timeoutSeconds?: number;

  /** Enable network in sandbox */
  networkEnabled?: boolean;

  /** Callback for progress updates */
  onProgress?: (update: ProgressUpdate) => void;

  /** Callback when a case completes */
  onCaseComplete?: (result: CaseResult) => void;
}

export interface ProgressUpdate {
  type: 'starting' | 'running' | 'validating' | 'complete' | 'error';
  caseId: string;
  caseIndex: number;
  totalCases: number;
  message?: string;
}

/**
 * Get the appropriate Docker image for a language
 */
function getImageForLanguage(language: string): string {
  const langLower = language.toLowerCase();

  if (langLower === 'javascript' || langLower === 'typescript' || langLower === 'node') {
    return RECOMMENDED_IMAGES.node.latest;
  }
  if (langLower === 'python') {
    return RECOMMENDED_IMAGES.python.latest;
  }
  if (langLower === 'go' || langLower === 'golang') {
    return RECOMMENDED_IMAGES.go.latest;
  }
  if (langLower === 'rust') {
    return RECOMMENDED_IMAGES.rust.latest;
  }
  if (langLower === 'java') {
    return RECOMMENDED_IMAGES.java.latest;
  }

  // Default to Node.js for unknown languages
  return RECOMMENDED_IMAGES.node.latest;
}

/**
 * Run a set of cases and return results
 */
export async function runCases(cases: Case[], options: RunnerOptions): Promise<RunResult> {
  const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const startedAt = new Date();
  const results: CaseResult[] = [];

  // Check Docker availability first
  const dockerStatus = await checkDocker();
  if (!dockerStatus.available) {
    throw new Error(`Docker is not available: ${dockerStatus.error}\n${dockerStatus.suggestion}`);
  }

  const manager = createSandboxManager();
  let runRubricId = 'default';

  try {
    for (let i = 0; i < cases.length; i++) {
      const caseData = cases[i];

      options.onProgress?.({
        type: 'starting',
        caseId: caseData.id,
        caseIndex: i,
        totalCases: cases.length,
        message: `Starting ${caseData.title}`,
      });

      try {
        const result = await runSingleCase(caseData, manager, options, i, cases.length);
        results.push(result);
        options.onCaseComplete?.(result);
        // Track the rubric ID from the first case
        if (i === 0) {
          const registry = getRubricRegistry();
          const rubric = registry.resolve(caseData.rubric);
          runRubricId = rubric.id;
        }
      } catch (err) {
        const errorResult: CaseResult = {
          caseId: caseData.id,
          score: 0,
          passed: false,
          criteriaResults: [],
          durationMs: 0,
          timedOut: false,
          error: (err as Error).message,
          timestamp: new Date(),
        };
        results.push(errorResult);
        options.onCaseComplete?.(errorResult);
      }
    }
  } finally {
    // Clean up all sandboxes
    await manager.destroyAll();
  }

  const completedAt = new Date();
  const totalDurationMs = completedAt.getTime() - startedAt.getTime();

  // Calculate summary
  const scores = results.map((r) => r.score);
  const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const summary: RunSummary = {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed && !r.error).length,
    skipped: 0,
    timedOut: results.filter((r) => r.timedOut).length,
    averageScore,
    totalDurationMs,
  };

  return {
    runId,
    startedAt,
    completedAt,
    agent: options.agent,
    rubricId: runRubricId,
    caseResults: results,
    summary,
  };
}

/**
 * Run a single case in a sandbox
 */
async function runSingleCase(
  caseData: Case,
  manager: ReturnType<typeof createSandboxManager>,
  options: RunnerOptions,
  caseIndex: number,
  totalCases: number
): Promise<CaseResult> {
  const startTime = Date.now();

  // Create a temporary directory for this case
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `sniff-${caseData.id}-`));

  try {
    // Write case files to temp directory (if any)
    if (caseData.files) {
      for (const file of caseData.files) {
        const filePath = path.join(tempDir, file.path);
        const fileDir = path.dirname(filePath);

        // Create directories if needed
        fs.mkdirSync(fileDir, { recursive: true });
        if (file.content !== undefined) {
          fs.writeFileSync(filePath, file.content);
        }
      }
    }

    // Create sandbox
    const sandboxConfig: SandboxConfig = {
      workdir: tempDir,
      image: getImageForLanguage(caseData.language),
      timeoutSeconds: options.timeoutSeconds || 300,
      networkEnabled: options.networkEnabled || false,
    };

    options.onProgress?.({
      type: 'running',
      caseId: caseData.id,
      caseIndex,
      totalCases,
      message: 'Creating sandbox...',
    });

    const sandbox = await manager.create(sandboxConfig);

    try {
      // Install dependencies if needed
      await installDependencies(sandbox, caseData.language, options, caseIndex, totalCases, caseData.id);

      // Run the agent to attempt to solve the case
      options.onProgress?.({
        type: 'running',
        caseId: caseData.id,
        caseIndex,
        totalCases,
        message: 'Running agent...',
      });

      const agent = getAgent(options.agent);
      const agentResult: AgentResult = await agent.run(caseData.prompt, {
        cwd: tempDir,
        timeoutMs: (options.timeoutSeconds || 300) * 1000,
        permissionMode: 'acceptEdits',
      });

      if (!agentResult.success) {
        throw new Error(`Agent execution failed: ${agentResult.error}`);
      }

      // Evaluate using the rubric
      options.onProgress?.({
        type: 'validating',
        caseId: caseData.id,
        caseIndex,
        totalCases,
        message: 'Evaluating with rubric...',
      });

      const result = await evaluateWithRubric(caseData, sandbox, options);
      const durationMs = Date.now() - startTime;

      options.onProgress?.({
        type: 'complete',
        caseId: caseData.id,
        caseIndex,
        totalCases,
        message: result.passed ? `Passed (${Math.round(result.score)}%)` : `Failed (${Math.round(result.score)}%)`,
      });

      return {
        ...result,
        durationMs,
        timestamp: new Date(),
      };
    } finally {
      await sandbox.destroy();
    }
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Evaluate a case using its rubric
 */
async function evaluateWithRubric(
  caseData: Case,
  sandbox: Sandbox,
  _options: RunnerOptions
): Promise<Omit<CaseResult, 'durationMs' | 'timestamp'>> {
  const registry = getRubricRegistry();
  const rubric = registry.resolve(caseData.rubric);

  const criteriaResults: CriterionResult[] = [];
  let totalWeightedScore = 0;
  let _totalWeight = 0;

  // Evaluate each criterion in the rubric
  for (const [criterionKey, criterion] of Object.entries(rubric.criteria)) {
    const evaluatorResults: EvaluatorResult[] = [];
    let criterionScore = 0;
    let evaluatorCount = 0;

    for (const evaluator of criterion.evaluators) {
      const evalStartTime = Date.now();
      let evalResult: Omit<EvaluatorResult, 'name' | 'type' | 'durationMs'>;

      if (evaluator.type === 'command') {
        // Run command evaluator
        const result = await sandbox.exec(evaluator.run, {
          timeoutSeconds: 60,
        });

        const passed = result.exitCode === 0;
        let score = passed ? 1.0 : 0.0;

        // Handle partial credit
        if (evaluator.partialCredit && !passed) {
          // For test runners, try to parse pass/fail ratio
          const testMatch = result.stdout.match(/(\d+) passed/);
          const failMatch = result.stdout.match(/(\d+) failed/);
          if (testMatch && failMatch) {
            const passedTests = parseInt(testMatch[1], 10);
            const failedTests = parseInt(failMatch[1], 10);
            const total = passedTests + failedTests;
            if (total > 0) {
              score = passedTests / total;
            }
          }
        }

        evalResult = {
          passed,
          score,
          evidence: (result.stdout + '\n' + result.stderr).trim(),
          details: {
            exitCode: result.exitCode,
            timedOut: result.timedOut,
          },
        };
      } else if (evaluator.type === 'pattern') {
        // Run pattern evaluator (check for matches in files)
        // Default to fail until fully implemented
        evalResult = {
          passed: false,
          score: 0.0,
          evidence: 'Pattern check not yet implemented',
        };
      } else {
        // Other evaluator types (llm_judge, benchmark, etc.) - not implemented
        evalResult = {
          passed: false,
          score: 0.0,
          evidence: `Evaluator type '${evaluator.type}' not yet implemented`,
        };
      }

      const evalDurationMs = Date.now() - evalStartTime;

      evaluatorResults.push({
        name: evaluator.name || evaluator.type,
        type: evaluator.type as EvaluatorType,
        durationMs: evalDurationMs,
        ...evalResult,
      });

      if (!evaluator.optional) {
        criterionScore += evalResult.score;
        evaluatorCount++;
      }
    }

    // Average score for this criterion
    // If no non-optional evaluators ran, this criterion doesn't participate in scoring
    const hasRequiredEvaluators = evaluatorCount > 0;
    const rawScore = hasRequiredEvaluators ? criterionScore / evaluatorCount : 0.0;
    const weightedScore = hasRequiredEvaluators ? (rawScore * criterion.weight) / 100 : 0;
    const allPassed = evaluatorResults.filter((e) => !e.passed).length === 0;

    criteriaResults.push({
      name: criterionKey,
      weight: criterion.weight,
      score: rawScore,
      weightedScore,
      passed: allPassed,
      evaluatorResults,
    });

    totalWeightedScore += weightedScore;
    // Only count weight for criteria that had non-optional evaluators
    if (hasRequiredEvaluators) {
      _totalWeight += criterion.weight;
    }
  }

  // Normalize score by participating weight (criteria with only optional evaluators are excluded)
  const overallScore = _totalWeight > 0 ? (totalWeightedScore / _totalWeight) * 100 : 0;

  // Determine pass/fail (default threshold: 70%)
  const passThreshold = 70;
  const passed = overallScore >= passThreshold;

  return {
    caseId: caseData.id,
    score: overallScore,
    passed,
    criteriaResults,
    timedOut: false,
  };
}

/**
 * Install dependencies based on language
 */
async function installDependencies(
  sandbox: Sandbox,
  language: string,
  options: RunnerOptions,
  caseIndex: number,
  totalCases: number,
  caseId: string
): Promise<void> {
  const langLower = language.toLowerCase();

  options.onProgress?.({
    type: 'running',
    caseId,
    caseIndex,
    totalCases,
    message: 'Installing dependencies...',
  });

  if (langLower === 'python') {
    // Check for requirements.txt
    const result = await sandbox.exec('test -f requirements.txt && pip install -r requirements.txt || true');
    if (result.exitCode !== 0 && result.stderr) {
      console.warn('Warning: pip install failed:', result.stderr);
    }
    // Also install pytest if running tests
    await sandbox.exec('pip install pytest --quiet 2>/dev/null || true');
  } else if (langLower === 'javascript' || langLower === 'typescript' || langLower === 'node') {
    // Check for package.json
    const result = await sandbox.exec('test -f package.json && npm install --silent || true');
    if (result.exitCode !== 0 && result.stderr) {
      console.warn('Warning: npm install failed:', result.stderr);
    }
  } else if (langLower === 'go' || langLower === 'golang') {
    // Check for go.mod
    await sandbox.exec('test -f go.mod && go mod download || true');
  }
}
