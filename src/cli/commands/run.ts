import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { box } from '../../utils/ui';
import { loadCases, getDefaultCasesDir, CaseResult } from '../../cases';
import { runCases, ProgressUpdate } from '../../evaluation';
import { checkDocker } from '../../sandbox';

interface RunOptions {
  agent: string;
  cases?: string;
  output: string;
  timeout?: number;
  network?: boolean;
}

export async function runCommand(options: RunOptions) {
  console.log(box(chalk.bold(`Sniffbench Evaluation\n`) + chalk.dim(`Agent: ${options.agent}`), 'sniff run'));

  // Check Docker first
  const spinner = ora('Checking Docker availability...').start();
  const dockerStatus = await checkDocker();

  if (!dockerStatus.available) {
    spinner.fail(`Docker is not available: ${dockerStatus.error}`);
    if (dockerStatus.suggestion) {
      console.log(chalk.dim('\n' + dockerStatus.suggestion));
    }
    console.log(chalk.yellow('\nRun `sniff doctor` for more details.'));
    process.exit(1);
  }
  spinner.succeed(`Docker ${dockerStatus.version} is ready`);

  // Load cases
  spinner.start('Loading test cases...');
  const casesDir = getDefaultCasesDir();

  // Parse case filter if provided
  const caseIds = options.cases?.split(',').map((c) => c.trim());

  const cases = await loadCases(casesDir, {
    ids: caseIds,
  });

  if (cases.length === 0) {
    spinner.warn('No test cases found');
    console.log(
      chalk.yellow('\nTo add test cases, create YAML files in:\n') +
        chalk.cyan(`  ${casesDir}\n\n`) +
        chalk.dim('See cases/bootstrap/example-case-spec.yaml for format.')
    );
    return;
  }

  spinner.succeed(`Loaded ${cases.length} test case${cases.length === 1 ? '' : 's'}`);

  // Display cases to run
  console.log(chalk.dim('\nCases to run:'));
  for (const c of cases) {
    const difficultyColor =
      c.difficulty === 'easy' ? chalk.green : c.difficulty === 'hard' ? chalk.red : chalk.yellow;
    console.log(chalk.dim(`  • ${c.id}: ${c.title} [${difficultyColor(c.difficulty)}]`));
  }
  console.log('');

  // Run the cases
  let currentSpinner: ReturnType<typeof ora> | null = null;

  const onProgress = (update: ProgressUpdate) => {
    if (currentSpinner) {
      if (update.type === 'complete') {
        currentSpinner.succeed(update.message);
      } else if (update.type === 'error') {
        currentSpinner.fail(update.message);
      } else {
        currentSpinner.text = `[${update.caseIndex + 1}/${update.totalCases}] ${update.caseId}: ${update.message}`;
      }
    }

    if (update.type === 'starting') {
      currentSpinner = ora(`[${update.caseIndex + 1}/${update.totalCases}] ${update.caseId}: ${update.message}`).start();
    }
  };

  const onCaseComplete = (result: CaseResult) => {
    if (currentSpinner) {
      if (result.passed) {
        currentSpinner.succeed(`${result.caseId}: ${chalk.green('PASSED')} (${formatDuration(result.durationMs)})`);
      } else if (result.timedOut) {
        currentSpinner.fail(`${result.caseId}: ${chalk.yellow('TIMEOUT')}`);
      } else if (result.error) {
        currentSpinner.fail(`${result.caseId}: ${chalk.red('ERROR')} - ${result.error}`);
      } else {
        currentSpinner.fail(`${result.caseId}: ${chalk.red('FAILED')} (exit code ${result.exitCode})`);
      }
      currentSpinner = null;
    }
  };

  try {
    const result = await runCases(cases, {
      agent: options.agent,
      timeoutSeconds: options.timeout || 300,
      networkEnabled: options.network || false,
      onProgress,
      onCaseComplete,
    });

    // Display summary
    console.log('');
    const summaryLines = [
      chalk.bold('Run Summary\n'),
      `Run ID: ${chalk.cyan(result.runId)}`,
      `Duration: ${formatDuration(result.completedAt.getTime() - result.startedAt.getTime())}`,
      '',
      `${chalk.green('✓')} Passed: ${result.summary.passed}`,
      `${chalk.red('✗')} Failed: ${result.summary.failed}`,
      result.summary.timedOut > 0 ? `${chalk.yellow('⏱')} Timed out: ${result.summary.timedOut}` : null,
      '',
      chalk.bold(`Score: ${Math.round((result.summary.passed / result.summary.total) * 100)}%`),
    ].filter(Boolean);

    console.log(box(summaryLines.join('\n'), 'Results'));

    // Save results to file
    const outputDir = path.resolve(options.output);
    fs.mkdirSync(outputDir, { recursive: true });

    const outputFile = path.join(outputDir, `${result.runId}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
    console.log(chalk.dim(`Results saved to: ${outputFile}`));

    // Exit with appropriate code
    if (result.summary.failed > 0 || result.summary.timedOut > 0) {
      process.exit(1);
    }
  } catch (err) {
    // Note: currentSpinner may have been cleared by callbacks
    console.error(chalk.red(`\nError: ${(err as Error).message}`));
    process.exit(1);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}
