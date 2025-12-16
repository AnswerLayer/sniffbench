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
  ScanOptions,
  ScanResult,
  ClosedIssueCase,
} from '../../closed-issues';
import { getDefaultCasesDir, loadCases } from '../../cases/loader';

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
}

interface AddCommandOptions {
  repo?: string;
}

interface ListCommandOptions {
  json?: boolean;
}

interface RunCommandOptions {
  case?: string;
  agent?: string;
  variant?: string;
  output?: string;
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
    const absolutePath = path.resolve(repoPath);

    const scanOptions: ScanOptions = {
      repoPath: absolutePath,
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
    console.log(
      chalk.dim(`\nTo add an issue as a case: ${chalk.cyan('sniff closed-issues add <owner/repo#number>')}`)
    );
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

    spinner.text = `Running ${cases.length} case${cases.length === 1 ? '' : 's'}...`;

    // For now, output the cases that would be run
    // Full implementation would use the interview command logic
    spinner.succeed(`Ready to run ${cases.length} case${cases.length === 1 ? '' : 's'}`);

    console.log();
    console.log(box(chalk.bold('Closed Issues Run'), 'closed-issues run'));
    console.log();

    for (const c of cases) {
      const closedIssueCase = c as ClosedIssueCase;
      console.log(`  ${chalk.cyan(c.id)}`);
      console.log(`    ${chalk.dim('Issue:')} ${closedIssueCase.closedIssue?.issueUrl || 'N/A'}`);
      console.log(`    ${chalk.dim('PR:')}    ${closedIssueCase.closedIssue?.prUrl || 'N/A'}`);
      console.log();
    }

    console.log(chalk.yellow('Note: Full run integration coming soon.'));
    console.log(chalk.dim('For now, use sniff interview with the case ID.'));

  } catch (err) {
    spinner.fail('Run failed');
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
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
