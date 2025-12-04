/**
 * Evaluation runner - executes cases in sandboxes
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Case, CaseResult, RunResult } from '../cases/types';
import { createSandboxManager, checkDocker, RECOMMENDED_IMAGES } from '../sandbox';
import { Sandbox, SandboxConfig } from '../sandbox/types';

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
      } catch (err) {
        const errorResult: CaseResult = {
          caseId: caseData.id,
          passed: false,
          exitCode: 1,
          stdout: '',
          stderr: '',
          durationMs: 0,
          timedOut: false,
          error: (err as Error).message,
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

  // Calculate summary
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed && !r.timedOut).length,
    skipped: 0,
    timedOut: results.filter((r) => r.timedOut).length,
  };

  return {
    runId,
    startedAt,
    completedAt,
    agent: options.agent,
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
    // Write case files to temp directory
    for (const file of caseData.files) {
      const filePath = path.join(tempDir, file.path);
      const fileDir = path.dirname(filePath);

      // Create directories if needed
      fs.mkdirSync(fileDir, { recursive: true });
      fs.writeFileSync(filePath, file.content);
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
      await installDependencies(sandbox, caseData.language, options, caseIndex, totalCases);

      // Run validation
      options.onProgress?.({
        type: 'validating',
        caseId: caseData.id,
        caseIndex,
        totalCases,
        message: `Running: ${caseData.validation.command}`,
      });

      const result = await sandbox.exec(caseData.validation.command, {
        timeoutSeconds: options.timeoutSeconds || 300,
      });

      const durationMs = Date.now() - startTime;

      // Determine if passed based on validation type
      let passed = false;
      if (caseData.validation.type === 'test_suite') {
        // For test suites, exit code 0 means all tests passed
        passed = result.exitCode === 0;
      } else if (caseData.validation.type === 'output_match') {
        // For output matching, check if expected output is in stdout
        passed = caseData.validation.expectedOutput
          ? result.stdout.includes(caseData.validation.expectedOutput)
          : result.exitCode === 0;
      } else {
        // For custom, just check exit code
        passed = result.exitCode === 0;
      }

      options.onProgress?.({
        type: 'complete',
        caseId: caseData.id,
        caseIndex,
        totalCases,
        message: passed ? 'Passed' : 'Failed',
      });

      return {
        caseId: caseData.id,
        passed,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs,
        timedOut: result.timedOut,
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
 * Install dependencies based on language
 */
async function installDependencies(
  sandbox: Sandbox,
  language: string,
  options: RunnerOptions,
  caseIndex: number,
  totalCases: number
): Promise<void> {
  const langLower = language.toLowerCase();

  options.onProgress?.({
    type: 'running',
    caseId: '',
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
