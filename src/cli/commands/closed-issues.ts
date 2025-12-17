/**
 * Closed Issues Commands
 *
 * CLI commands for scanning, extracting, and running closed issues
 * as agent evaluation cases.
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { box } from '../../utils/ui';
import {
  scanForClosedIssues,
  extractCase,
  saveCaseToYaml,
  runClosedIssueCase,
  ScanOptions,
  ScanResult,
  ClosedIssueCase,
  RunCaseResult,
} from '../../closed-issues';
import { getDefaultCasesDir, loadCases } from '../../cases/loader';
import { loadVariants, findVariantByName, resolveVariantId } from '../../variants/store';
import { Variant } from '../../variants/types';
import { getActiveVariant } from './variant';
import { variantImageExists } from '../../sandbox/variant-container';
import {
  loadRuns,
  saveRuns,
  generateRunId,
  addRun,
  getRun,
  resolveRunId,
  capturePartialAgentConfig,
  diffAgentConfig,
  ClosedIssueCaseRun,
  Run,
} from '../../runs';
import { getAgent } from '../../agents';

// =============================================================================
// Command Interfaces
// =============================================================================

interface ScanCommandOptions {
  maxIssues?: string;
  maxPrSize?: string;
  maxFiles?: string;
  since?: string;
  requireTests?: boolean;
  all?: boolean;
  json?: boolean;
  add?: boolean;
}

interface AddCommandOptions {
  repo?: string;
}

interface ListCommandOptions {
  json?: boolean;
}

interface RunCommandOptions {
  case?: string;
  variant?: string;
  local?: boolean;
  timeout?: string;
  stream?: boolean;
  json?: boolean;
  run?: string;
}

// =============================================================================
// Scan Command
// =============================================================================

/**
 * Scan repository for closed issues suitable for evaluation
 */
export async function closedIssuesScanCommand(
  repoPath: string = '.',
  options: ScanCommandOptions
) {
  const spinner = ora('Scanning for closed issues...').start();

  try {
    // Don't resolve path for GitHub URLs or owner/repo format
    const isLocalPath = !repoPath.includes('github.com') && !repoPath.match(/^[^/]+\/[^/]+$/);
    const resolvedPath = isLocalPath ? path.resolve(repoPath) : repoPath;

    const scanOptions: ScanOptions = {
      repoPath: resolvedPath,
      maxIssues: options.maxIssues ? parseInt(options.maxIssues, 10) : 50,
      maxPrSize: options.maxPrSize ? parseInt(options.maxPrSize, 10) : 500,
      maxFilesChanged: options.maxFiles ? parseInt(options.maxFiles, 10) : 10,
      since: options.since ? new Date(options.since) : undefined,
      requireTests: options.requireTests || false,
      includeAll: options.all || false,
    };

    const results = await scanForClosedIssues(scanOptions);

    spinner.stop();

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (results.length === 0) {
      console.log(chalk.yellow('No suitable closed issues found.'));
      console.log(chalk.dim('\nTips:'));
      console.log(chalk.dim('  - Try --all to see excluded issues with reasons'));
      console.log(chalk.dim('  - Use --max-pr-size to adjust size limits'));
      console.log(chalk.dim('  - Use --since to look at older issues'));
      return;
    }

    // Display results
    console.log(box(chalk.bold(`Found ${results.length} candidate issue${results.length === 1 ? '' : 's'}`), 'closed-issues scan'));

    console.log();

    // Header
    console.log(
      chalk.bold.dim(
        `${'Issue'.padEnd(10)} ${'Title'.padEnd(45)} ${'PR'.padEnd(8)} ${'Size'.padEnd(8)} ${'Lang'.padEnd(12)} ${'Score'}`
      )
    );
    console.log(chalk.dim('─'.repeat(95)));

    for (const result of results) {
      const { issue, quality, excluded } = result;

      const issueNum = `#${issue.issueNumber}`.padEnd(10);
      const title = issue.issueTitle.substring(0, 43).padEnd(45);
      const prNum = `#${issue.prNumber}`.padEnd(8);
      const size = `${quality.prSize}`.padEnd(8);
      const lang = issue.language.padEnd(12);
      const score = getScoreDisplay(quality.score);

      if (excluded) {
        console.log(
          chalk.dim(`${issueNum} ${title} ${prNum} ${size} ${lang} `) +
            chalk.yellow(`[${excluded}]`)
        );
      } else {
        console.log(`${chalk.cyan(issueNum)} ${title} ${chalk.dim(prNum)} ${size} ${lang} ${score}`);
      }
    }

    console.log();
    console.log(chalk.dim('─'.repeat(95)));

    // Handle --add flag: bulk add all non-excluded issues
    if (options.add) {
      const eligibleResults = results.filter(r => !r.excluded);

      if (eligibleResults.length === 0) {
        console.log(chalk.yellow('\nNo eligible issues to add (all are excluded).'));
        console.log(chalk.dim('Use --all to include excluded issues.'));
        return;
      }

      console.log();
      const addSpinner = ora(`Adding ${eligibleResults.length} case${eligibleResults.length === 1 ? '' : 's'}...`).start();

      const casesDir = path.join(getClosedIssuesCasesDir(), 'closed-issues');
      let added = 0;
      let failed = 0;

      for (const result of eligibleResults) {
        const issueRef = `${result.issue.repo}#${result.issue.issueNumber}`;
        try {
          const caseData = await extractCase(issueRef, resolvedPath);
          saveCaseToYaml(caseData, casesDir);
          added++;
          addSpinner.text = `Adding cases... (${added}/${eligibleResults.length})`;
        } catch (err) {
          failed++;
          // Continue with other issues even if one fails
        }
      }

      if (failed === 0) {
        addSpinner.succeed(`Added ${added} case${added === 1 ? '' : 's'}`);
      } else {
        addSpinner.warn(`Added ${added} case${added === 1 ? '' : 's'}, ${failed} failed`);
      }

      console.log(chalk.dim(`\nRun cases with: ${chalk.cyan('sniff closed-issues run')}`));
    } else {
      console.log(
        chalk.dim(`\nTo add an issue as a case: ${chalk.cyan('sniff closed-issues add <owner/repo#number>')}`)
      );
      console.log(
        chalk.dim(`To add all found issues: ${chalk.cyan('sniff closed-issues scan <repo> --add')}`)
      );
    }
  } catch (err) {
    spinner.fail('Scan failed');
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
}

// =============================================================================
// Add Command
// =============================================================================

/**
 * Add a specific closed issue as a test case
 */
export async function closedIssuesAddCommand(issueRef: string, options: AddCommandOptions) {
  const spinner = ora(`Extracting case from ${issueRef}...`).start();

  try {
    const repoPath = options.repo || process.cwd();
    const absolutePath = path.resolve(repoPath);

    // Extract the case
    const caseData = await extractCase(issueRef, absolutePath);

    // Determine output directory
    const casesDir = path.join(getClosedIssuesCasesDir(), 'closed-issues');

    // Save to YAML
    const filePath = saveCaseToYaml(caseData, casesDir);

    spinner.succeed(`Case extracted successfully`);

    console.log();
    console.log(box(chalk.bold('Case Created'), 'closed-issues add'));
    console.log();
    console.log(`  ${chalk.bold('ID:')}         ${chalk.cyan(caseData.id)}`);
    console.log(`  ${chalk.bold('Title:')}      ${caseData.title}`);
    console.log(`  ${chalk.bold('Language:')}   ${caseData.language}`);
    console.log(`  ${chalk.bold('Difficulty:')} ${getDifficultyDisplay(caseData.difficulty)}`);
    console.log(`  ${chalk.bold('PR Size:')}    ${caseData.referenceSolution.additions} additions, ${caseData.referenceSolution.deletions} deletions`);
    console.log(`  ${chalk.bold('Files:')}      ${caseData.referenceSolution.filesChanged.length} files changed`);
    console.log();
    console.log(`  ${chalk.bold('Saved to:')}   ${chalk.dim(filePath)}`);
    console.log();

    if (caseData.referenceSolution.testCommand) {
      console.log(`  ${chalk.bold('Test cmd:')}   ${chalk.dim(caseData.referenceSolution.testCommand)}`);
    }
    if (caseData.referenceSolution.lintCommand) {
      console.log(`  ${chalk.bold('Lint cmd:')}   ${chalk.dim(caseData.referenceSolution.lintCommand)}`);
    }

    console.log();
    console.log(chalk.dim(`Run with: ${chalk.cyan(`sniff closed-issues run --case ${caseData.id}`)}`));
  } catch (err) {
    spinner.fail('Failed to add case');
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
}

// =============================================================================
// List Command
// =============================================================================

/**
 * List all extracted closed-issue cases
 */
export async function closedIssuesListCommand(options: ListCommandOptions) {
  const spinner = ora('Loading closed-issue cases...').start();

  try {
    const casesDir = getClosedIssuesCasesDir();
    const closedIssuesDir = path.join(casesDir, 'closed-issues');

    // Check if directory exists
    if (!fs.existsSync(closedIssuesDir)) {
      spinner.stop();
      console.log(chalk.yellow('No closed-issue cases found.'));
      console.log(chalk.dim('\nTo add a case, run:'));
      console.log(chalk.cyan('  sniff closed-issues scan  # Find candidates'));
      console.log(chalk.cyan('  sniff closed-issues add <owner/repo#number>  # Add specific issue'));
      return;
    }

    const cases = await loadCases(closedIssuesDir, { source: 'closed_issue' });

    spinner.stop();

    if (options.json) {
      console.log(JSON.stringify(cases, null, 2));
      return;
    }

    if (cases.length === 0) {
      console.log(chalk.yellow('No closed-issue cases found.'));
      return;
    }

    console.log(box(chalk.bold(`${cases.length} closed-issue case${cases.length === 1 ? '' : 's'}`), 'closed-issues list'));
    console.log();

    // Header
    console.log(
      chalk.bold.dim(
        `${'ID'.padEnd(45)} ${'Title'.padEnd(35)} ${'Lang'.padEnd(12)} ${'Diff'}`
      )
    );
    console.log(chalk.dim('─'.repeat(100)));

    for (const c of cases) {
      const id = c.id.padEnd(45);
      const title = c.title.substring(0, 33).padEnd(35);
      const lang = c.language.padEnd(12);
      const diff = getDifficultyDisplay(c.difficulty);

      console.log(`${chalk.cyan(id)} ${title} ${lang} ${diff}`);
    }

    console.log();
    console.log(chalk.dim(`Run a case: ${chalk.cyan('sniff closed-issues run --case <id>')}`));
  } catch (err) {
    spinner.fail('Failed to list cases');
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
}

// =============================================================================
// Run Command
// =============================================================================

/**
 * Run agent on closed-issue cases
 */
export async function closedIssuesRunCommand(options: RunCommandOptions) {
  const spinner = ora('Preparing to run closed-issue cases...').start();

  try {
    const casesDir = getClosedIssuesCasesDir();
    const closedIssuesDir = path.join(casesDir, 'closed-issues');

    // Load cases
    const loadOptions: { source: 'closed_issue'; ids?: string[] } = { source: 'closed_issue' };
    if (options.case) {
      loadOptions.ids = [options.case];
    }

    const cases = await loadCases(closedIssuesDir, loadOptions);

    if (cases.length === 0) {
      spinner.fail('No cases to run');
      if (options.case) {
        console.error(chalk.red(`Case not found: ${options.case}`));
      } else {
        console.log(chalk.dim('\nAdd cases first with: sniff closed-issues add <issue>'));
      }
      process.exit(1);
    }

    // Determine which variant to use
    const projectRoot = process.cwd();
    let variant: Variant | undefined;

    if (!options.local) {
      // Use specified variant, or fall back to active variant
      const variantName = options.variant || getActiveVariant(projectRoot);

      if (variantName) {
        const store = loadVariants(projectRoot);
        const variantId = resolveVariantId(store, variantName);

        if (!variantId) {
          spinner.fail(`Variant not found: ${variantName}`);
          process.exit(1);
        }

        variant = store.variants[variantId];

        if (!variant.container) {
          spinner.fail(`Variant "${variant.name}" has no container. Run: sniff variant build ${variant.name}`);
          process.exit(1);
        }

        if (!variantImageExists(variant)) {
          spinner.fail(`Container image missing for variant "${variant.name}". Run: sniff variant build ${variant.name}`);
          process.exit(1);
        }
      } else {
        // No variant specified and no active variant - require --local
        spinner.fail('No active variant set. Use --variant <name> or --local to run without a container.');
        console.log(chalk.dim('\n  Set an active variant: sniff variant use <name>'));
        console.log(chalk.dim('  Or run locally: sniff closed-issues run --local\n'));
        process.exit(1);
      }
    }

    const timeoutMs = options.timeout ? parseInt(options.timeout, 10) * 1000 : 10 * 60 * 1000;

    spinner.succeed(`Running ${cases.length} case${cases.length === 1 ? '' : 's'}${variant ? ` with variant "${variant.name}"` : ''}...`);
    console.log();

    if (!options.json) {
      console.log(box(chalk.bold('Closed Issues Run'), 'closed-issues run'));
      console.log();
    }

    const results: RunCaseResult[] = [];

    for (let i = 0; i < cases.length; i++) {
      const c = cases[i] as ClosedIssueCase;

      if (!options.json) {
        console.log(`${chalk.dim(`[${i + 1}/${cases.length}]`)} ${chalk.cyan(c.id)}`);
        console.log(`    ${chalk.dim('Issue:')} ${c.closedIssue?.issueUrl || 'N/A'}`);
        console.log(`    ${chalk.dim('PR:')}    ${c.closedIssue?.prUrl || 'N/A'}`);
      }

      const caseSpinner = options.json ? null : ora({ indent: 4, text: 'Running agent...' }).start();

      const result = await runClosedIssueCase({
        caseData: c,
        variant,
        projectRoot: process.cwd(),
        timeoutMs,
        stream: options.stream,
        onStatus: (status) => {
          if (caseSpinner) {
            caseSpinner.text = status;
          }
        },
        onOutput: options.stream
          ? (type, data) => {
              if (type === 'stdout') {
                process.stdout.write(data);
              } else {
                process.stderr.write(chalk.dim(data));
              }
            }
          : undefined,
      });

      results.push(result);

      if (!options.json) {
        if (result.success) {
          caseSpinner?.succeed(`Completed in ${formatDuration(result.durationMs)}`);
          console.log();
          displayResultSummary(result);
        } else {
          caseSpinner?.fail(`Failed: ${result.error}`);
        }
        console.log();
      }
    }

    // Save run to store
    const runId = await saveClosedIssuesRun(projectRoot, results, variant, options.run);

    // Output JSON if requested
    if (options.json) {
      console.log(JSON.stringify({ runId, results }, null, 2));
      return;
    }

    // Display summary
    displayRunSummary(results, runId);

  } catch (err) {
    spinner.fail('Run failed');
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
}

/**
 * Display a summary of a single result
 */
function displayResultSummary(result: RunCaseResult) {
  const comp = result.comparison;

  console.log(`    ${chalk.bold('Results:')}`);
  console.log(`      ${chalk.dim('Overall Score:')} ${getScoreColor(comp.overallScore)(`${comp.overallScore}/100`)}`);
  console.log(`      ${chalk.dim('Diff Similarity:')} ${(comp.diffSimilarity * 100).toFixed(1)}%`);
  console.log(`      ${chalk.dim('Scope Match:')} ${(comp.scopeMatch * 100).toFixed(1)}%`);
  console.log(`      ${chalk.dim('Files Changed:')} ${result.filesChanged.length}`);

  if (comp.details.matchingFiles.length > 0) {
    console.log(`      ${chalk.dim('Matching Files:')} ${comp.details.matchingFiles.join(', ')}`);
  }
  if (comp.details.missingFiles.length > 0) {
    console.log(`      ${chalk.yellow('Missing Files:')} ${comp.details.missingFiles.join(', ')}`);
  }
  if (comp.details.extraFiles.length > 0) {
    console.log(`      ${chalk.dim('Extra Files:')} ${comp.details.extraFiles.join(', ')}`);
  }

  if (result.tokens) {
    console.log(`      ${chalk.dim('Tokens:')} ${result.tokens.totalTokens.toLocaleString()}`);
  }
  if (result.costUsd !== undefined) {
    console.log(`      ${chalk.dim('Cost:')} $${result.costUsd.toFixed(4)}`);
  }
}

/**
 * Display overall run summary
 */
function displayRunSummary(results: RunCaseResult[], runId: string) {
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold('Summary'));
  console.log();

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`  ${chalk.green('✓')} ${successful.length} passed`);
  if (failed.length > 0) {
    console.log(`  ${chalk.red('✗')} ${failed.length} failed`);
  }

  if (successful.length > 0) {
    const avgScore = successful.reduce((sum, r) => sum + r.comparison.overallScore, 0) / successful.length;
    const avgSimilarity = successful.reduce((sum, r) => sum + r.comparison.diffSimilarity, 0) / successful.length;
    const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

    console.log();
    console.log(`  ${chalk.dim('Avg Score:')} ${avgScore.toFixed(1)}/100`);
    console.log(`  ${chalk.dim('Avg Similarity:')} ${(avgSimilarity * 100).toFixed(1)}%`);
    console.log(`  ${chalk.dim('Total Time:')} ${formatDuration(totalDuration)}`);

    const totalTokens = results.reduce((sum, r) => sum + (r.tokens?.totalTokens || 0), 0);
    const totalCost = results.reduce((sum, r) => sum + (r.costUsd || 0), 0);

    if (totalTokens > 0) {
      console.log(`  ${chalk.dim('Total Tokens:')} ${totalTokens.toLocaleString()}`);
    }
    if (totalCost > 0) {
      console.log(`  ${chalk.dim('Total Cost:')} $${totalCost.toFixed(4)}`);
    }
  }

  console.log();
  console.log(`  ${chalk.dim('Run ID:')} ${chalk.cyan(runId)}`);
  console.log();
  console.log(chalk.dim(`  Compare runs: sniff closed-issues compare <run1> <run2>`));
  console.log();
}

/**
 * Save closed-issues run to the store
 */
async function saveClosedIssuesRun(
  projectRoot: string,
  results: RunCaseResult[],
  variant: Variant | undefined,
  label?: string
): Promise<string> {
  // Capture agent config
  const agent = getAgent('claude-code');
  const agentConfig = await capturePartialAgentConfig(agent, projectRoot);

  // Link to variant if used
  if (variant) {
    agentConfig.variantId = variant.id;
  }

  // Convert results to ClosedIssueCaseRun format
  const closedIssueCases: Record<string, ClosedIssueCaseRun> = {};
  for (const result of results) {
    closedIssueCases[result.caseId] = {
      success: result.success,
      error: result.error,
      durationMs: result.durationMs,
      filesChanged: result.filesChanged,
      agentDiff: result.agentDiff,
      comparison: {
        functionalMatch: result.comparison.functionalMatch,
        diffSimilarity: result.comparison.diffSimilarity,
        scopeMatch: result.comparison.scopeMatch,
        styleScore: result.comparison.styleScore,
        overallScore: result.comparison.overallScore,
        details: {
          missingFiles: result.comparison.details.missingFiles,
          extraFiles: result.comparison.details.extraFiles,
          matchingFiles: result.comparison.details.matchingFiles,
          testOutput: result.comparison.details.testOutput,
          lintOutput: result.comparison.details.lintOutput,
        },
      },
      agentOutput: result.agentOutput,
      behaviorMetrics: result.tokens ? {
        totalTokens: result.tokens.totalTokens,
        inputTokens: result.tokens.inputTokens,
        outputTokens: result.tokens.outputTokens,
        cacheReadTokens: result.tokens.cacheReadTokens,
        cacheWriteTokens: result.tokens.cacheWriteTokens,
        costUsd: result.costUsd || 0,
      } : undefined,
    };
  }

  // Create run
  const run: Run = {
    id: generateRunId(),
    label,
    type: 'closed-issues',
    createdAt: new Date().toISOString(),
    agent: agentConfig,
    cases: {},
    closedIssueCases,
  };

  // Save to store
  const store = loadRuns(projectRoot);
  addRun(store, run);
  saveRuns(projectRoot, store);

  return run.id;
}

/**
 * Get color function based on score
 */
function getScoreColor(score: number): (text: string) => string {
  if (score >= 80) return chalk.green;
  if (score >= 60) return chalk.yellow;
  return chalk.red;
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

// =============================================================================
// Compare Command
// =============================================================================

interface CompareCommandOptions {
  json?: boolean;
}

/**
 * Compare two closed-issues runs
 */
export async function closedIssuesCompareCommand(
  run1Id: string,
  run2Id: string,
  options: CompareCommandOptions
) {
  const projectRoot = process.cwd();
  const store = loadRuns(projectRoot);

  // Resolve run IDs
  const resolvedId1 = resolveRunId(store, run1Id);
  const resolvedId2 = resolveRunId(store, run2Id);

  if (!resolvedId1) {
    console.error(chalk.red(`Run not found: ${run1Id}`));
    process.exit(1);
  }

  if (!resolvedId2) {
    console.error(chalk.red(`Run not found: ${run2Id}`));
    process.exit(1);
  }

  const run1 = getRun(store, resolvedId1)!;
  const run2 = getRun(store, resolvedId2)!;

  // Verify both are closed-issues runs
  if (run1.type !== 'closed-issues' || !run1.closedIssueCases) {
    console.error(chalk.red(`Run ${run1Id} is not a closed-issues run`));
    process.exit(1);
  }

  if (run2.type !== 'closed-issues' || !run2.closedIssueCases) {
    console.error(chalk.red(`Run ${run2Id} is not a closed-issues run`));
    process.exit(1);
  }

  // Build comparison data
  const comparison = buildComparison(run1, run2);

  if (options.json) {
    console.log(JSON.stringify(comparison, null, 2));
    return;
  }

  // Display comparison
  displayComparison(run1, run2, comparison);
}

interface RunComparison {
  configDiff: Array<{ field: string; run1: string; run2: string }>;
  caseComparisons: Array<{
    caseId: string;
    run1: ClosedIssueCaseRun | null;
    run2: ClosedIssueCaseRun | null;
    scoreDiff: number;
    similarityDiff: number;
    durationDiff: number;
    tokensDiff: number;
    costDiff: number;
  }>;
  summary: {
    avgScoreDiff: number;
    avgSimilarityDiff: number;
    totalDurationDiff: number;
    totalTokensDiff: number;
    totalCostDiff: number;
    run1Passed: number;
    run2Passed: number;
    run1TotalTokens: number;
    run2TotalTokens: number;
    run1TotalCost: number;
    run2TotalCost: number;
    run1TotalDuration: number;
    run2TotalDuration: number;
  };
}

function buildComparison(run1: Run, run2: Run): RunComparison {
  // Get config diff - map old/new to run1/run2
  const rawDiff = diffAgentConfig(run1.agent, run2.agent);
  const configDiff = rawDiff.map((d) => ({ field: d.field, run1: d.old, run2: d.new }));

  // Get all case IDs from both runs
  const allCaseIds = new Set([
    ...Object.keys(run1.closedIssueCases || {}),
    ...Object.keys(run2.closedIssueCases || {}),
  ]);

  const caseComparisons: RunComparison['caseComparisons'] = [];
  let totalScoreDiff = 0;
  let totalSimilarityDiff = 0;
  let totalDurationDiff = 0;
  let totalTokensDiff = 0;
  let totalCostDiff = 0;
  let run1Passed = 0;
  let run2Passed = 0;
  let run1TotalTokens = 0;
  let run2TotalTokens = 0;
  let run1TotalCost = 0;
  let run2TotalCost = 0;
  let run1TotalDuration = 0;
  let run2TotalDuration = 0;
  let comparableCount = 0;

  for (const caseId of allCaseIds) {
    const case1 = run1.closedIssueCases?.[caseId] || null;
    const case2 = run2.closedIssueCases?.[caseId] || null;

    const score1 = case1?.comparison.overallScore || 0;
    const score2 = case2?.comparison.overallScore || 0;
    const similarity1 = case1?.comparison.diffSimilarity || 0;
    const similarity2 = case2?.comparison.diffSimilarity || 0;
    const duration1 = case1?.durationMs || 0;
    const duration2 = case2?.durationMs || 0;
    const tokens1 = case1?.behaviorMetrics?.totalTokens || 0;
    const tokens2 = case2?.behaviorMetrics?.totalTokens || 0;
    const cost1 = case1?.behaviorMetrics?.costUsd || 0;
    const cost2 = case2?.behaviorMetrics?.costUsd || 0;

    if (case1?.success) run1Passed++;
    if (case2?.success) run2Passed++;

    // Accumulate totals
    run1TotalTokens += tokens1;
    run2TotalTokens += tokens2;
    run1TotalCost += cost1;
    run2TotalCost += cost2;
    run1TotalDuration += duration1;
    run2TotalDuration += duration2;

    if (case1 && case2) {
      totalScoreDiff += score2 - score1;
      totalSimilarityDiff += similarity2 - similarity1;
      totalDurationDiff += duration2 - duration1;
      totalTokensDiff += tokens2 - tokens1;
      totalCostDiff += cost2 - cost1;
      comparableCount++;
    }

    caseComparisons.push({
      caseId,
      run1: case1,
      run2: case2,
      scoreDiff: score2 - score1,
      similarityDiff: similarity2 - similarity1,
      durationDiff: duration2 - duration1,
      tokensDiff: tokens2 - tokens1,
      costDiff: cost2 - cost1,
    });
  }

  return {
    configDiff,
    caseComparisons,
    summary: {
      avgScoreDiff: comparableCount > 0 ? totalScoreDiff / comparableCount : 0,
      avgSimilarityDiff: comparableCount > 0 ? totalSimilarityDiff / comparableCount : 0,
      totalDurationDiff,
      totalTokensDiff,
      totalCostDiff,
      run1Passed,
      run2Passed,
      run1TotalTokens,
      run2TotalTokens,
      run1TotalCost,
      run2TotalCost,
      run1TotalDuration,
      run2TotalDuration,
    },
  };
}

function displayComparison(run1: Run, run2: Run, comparison: RunComparison) {
  console.log();
  console.log(box(chalk.bold('Closed Issues Run Comparison'), 'closed-issues compare'));
  console.log();

  // Run info
  console.log(chalk.bold('  Runs:'));
  console.log(`    ${chalk.cyan(run1.label || run1.id)} (${new Date(run1.createdAt).toLocaleDateString()})`);
  console.log(`    ${chalk.cyan('vs')}`);
  console.log(`    ${chalk.cyan(run2.label || run2.id)} (${new Date(run2.createdAt).toLocaleDateString()})`);
  console.log();

  // Config diff
  if (comparison.configDiff.length > 0) {
    console.log(chalk.bold('  Configuration Changes:'));
    for (const diff of comparison.configDiff) {
      console.log(`    ${chalk.dim(diff.field + ':')} ${diff.run1} ${chalk.yellow('→')} ${diff.run2}`);
    }
    console.log();
  }

  // Case comparisons
  console.log(chalk.bold('  Case Comparison:'));
  console.log(
    chalk.dim('    ' +
      'Case'.padEnd(40) +
      'Score'.padEnd(18) +
      'Similarity'.padEnd(18) +
      'Time'.padEnd(16) +
      'Cost'
    )
  );
  console.log(chalk.dim('    ' + '─'.repeat(100)));

  for (const caseComp of comparison.caseComparisons) {
    const caseId = caseComp.caseId.substring(0, 38).padEnd(40);

    const score1 = caseComp.run1?.comparison.overallScore ?? '-';
    const score2 = caseComp.run2?.comparison.overallScore ?? '-';
    const scoreDiffStr = formatDiff(caseComp.scoreDiff, '');
    const scoreStr = `${score1} → ${score2} ${scoreDiffStr}`.padEnd(18);

    const sim1 = caseComp.run1 ? `${(caseComp.run1.comparison.diffSimilarity * 100).toFixed(0)}%` : '-';
    const sim2 = caseComp.run2 ? `${(caseComp.run2.comparison.diffSimilarity * 100).toFixed(0)}%` : '-';
    const simDiffStr = formatDiff(caseComp.similarityDiff * 100, '%');
    const simStr = `${sim1} → ${sim2} ${simDiffStr}`.padEnd(18);

    const time1 = caseComp.run1 ? `${(caseComp.run1.durationMs / 1000).toFixed(0)}s` : '-';
    const time2 = caseComp.run2 ? `${(caseComp.run2.durationMs / 1000).toFixed(0)}s` : '-';
    const timeDiffStr = formatDiffInverse(caseComp.durationDiff / 1000, 's');
    const timeStr = `${time1} → ${time2} ${timeDiffStr}`.padEnd(16);

    const cost1 = caseComp.run1?.behaviorMetrics?.costUsd;
    const cost2 = caseComp.run2?.behaviorMetrics?.costUsd;
    const costStr1 = cost1 !== undefined ? `$${cost1.toFixed(2)}` : '-';
    const costStr2 = cost2 !== undefined ? `$${cost2.toFixed(2)}` : '-';
    const costDiffStr = formatDiffInverse(caseComp.costDiff, '', true);
    const costStr = `${costStr1} → ${costStr2} ${costDiffStr}`;

    console.log(`    ${caseId}${scoreStr}${simStr}${timeStr}${costStr}`);
  }

  console.log();

  // Summary - Quality (higher is better)
  console.log(chalk.bold('  Quality (↑ better):'));
  console.log(`    ${chalk.dim('Passed:')} ${comparison.summary.run1Passed} → ${comparison.summary.run2Passed}`);
  console.log(`    ${chalk.dim('Avg Score Δ:')} ${formatDiff(comparison.summary.avgScoreDiff, '')}`);
  console.log(`    ${chalk.dim('Avg Similarity Δ:')} ${formatDiff(comparison.summary.avgSimilarityDiff * 100, '%')}`);
  console.log();

  // Summary - Efficiency (lower is better)
  console.log(chalk.bold('  Efficiency (↓ better):'));
  const { run1TotalDuration, run2TotalDuration, run1TotalTokens, run2TotalTokens, run1TotalCost, run2TotalCost } = comparison.summary;
  console.log(`    ${chalk.dim('Time:')} ${formatDurationCompact(run1TotalDuration)} → ${formatDurationCompact(run2TotalDuration)} ${formatDiffInverse(comparison.summary.totalDurationDiff / 1000, 's')}`);
  console.log(`    ${chalk.dim('Tokens:')} ${run1TotalTokens.toLocaleString()} → ${run2TotalTokens.toLocaleString()} ${formatDiffInverse(comparison.summary.totalTokensDiff, '', false, true)}`);
  console.log(`    ${chalk.dim('Cost:')} $${run1TotalCost.toFixed(2)} → $${run2TotalCost.toFixed(2)} ${formatDiffInverse(comparison.summary.totalCostDiff, '', true)}`);
  console.log();
}

/**
 * Format duration in compact form
 */
function formatDurationCompact(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m${seconds}s`;
}

function formatDiff(diff: number, suffix: string): string {
  if (diff === 0) return chalk.dim(`0${suffix}`);
  const sign = diff > 0 ? '+' : '';
  const color = diff > 0 ? chalk.green : chalk.red;
  return color(`${sign}${diff.toFixed(1)}${suffix}`);
}

/**
 * Format diff where lower is better (green for negative, red for positive)
 */
function formatDiffInverse(diff: number, suffix: string, isCurrency = false, formatLarge = false): string {
  if (Math.abs(diff) < 0.01) return chalk.dim(isCurrency ? '$0' : `0${suffix}`);
  const sign = diff > 0 ? '+' : '';
  const color = diff < 0 ? chalk.green : chalk.red;  // Inverted: negative is good
  if (isCurrency) {
    return color(`${sign}$${Math.abs(diff).toFixed(2)}`);
  }
  const value = formatLarge ? Math.round(diff).toLocaleString() : diff.toFixed(1);
  return color(`${sign}${value}${suffix}`);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the cases directory for the current project
 */
function getClosedIssuesCasesDir(): string {
  const projectCases = path.join(process.cwd(), '.sniffbench', 'cases');

  // Create if doesn't exist
  if (!fs.existsSync(projectCases)) {
    fs.mkdirSync(projectCases, { recursive: true });
  }

  return projectCases;
}

/**
 * Get colored score display
 */
function getScoreDisplay(score: number): string {
  if (score >= 80) return chalk.green(`${score}%`);
  if (score >= 60) return chalk.yellow(`${score}%`);
  return chalk.red(`${score}%`);
}

/**
 * Get colored difficulty display
 */
function getDifficultyDisplay(difficulty: string): string {
  switch (difficulty) {
    case 'easy':
      return chalk.green('Easy');
    case 'medium':
      return chalk.yellow('Medium');
    case 'hard':
      return chalk.red('Hard');
    default:
      return difficulty;
  }
}
