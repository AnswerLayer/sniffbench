/**
 * Runs subcommands - list, show, delete runs
 */

import chalk from 'chalk';
import { box, padVisible } from '../../utils/ui';
import {
  loadRuns,
  saveRuns,
  listRuns,
  getRun,
  deleteRun,
  resolveRunId,
  performMigration,
  getMigrationInfo,
  formatAgentConfig,
  Run,
} from '../../runs';

/**
 * Format a date string for display
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) {
    return 'Invalid date';
  }
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a run for list display
 */
function formatRunRow(run: Run): string {
  const caseCount = Object.keys(run.cases).length;
  const gradedCount = Object.values(run.cases).filter(c => c.grade !== undefined).length;
  const avgGrade = gradedCount > 0
    ? (Object.values(run.cases).reduce((sum, c) => sum + (c.grade || 0), 0) / gradedCount).toFixed(1)
    : 'N/A';

  // Truncate visible text BEFORE applying colors, then pad the colored result
  const idCol = run.id.substring(0, 20);
  const labelText = run.label ? `[${run.label}]` : '';
  const labelCol = padVisible(labelText ? chalk.cyan(labelText.substring(0, 18)) : '', 20);
  const dateCol = padVisible(chalk.dim(formatDate(run.createdAt)), 22);
  const agentCol = padVisible(chalk.yellow(run.agent.name.substring(0, 12)), 12);
  const modelCol = padVisible(chalk.dim(run.agent.model.substring(0, 20)), 20);
  const casesCol = padVisible(`${gradedCount}/${caseCount} cases`, 12);
  const gradeCol = gradedCount > 0 ? chalk.green(`${avgGrade}/10`) : chalk.dim('not graded');

  return `  ${idCol}  ${labelCol}  ${dateCol}  ${agentCol}  ${modelCol}  ${casesCol}  ${gradeCol}`;
}

/**
 * List all runs
 */
export async function runsListCommand(options: { json?: boolean }): Promise<void> {
  const projectRoot = process.cwd();

  // Check for migration
  const migrationInfo = getMigrationInfo(projectRoot);
  if (migrationInfo.needed) {
    console.log(chalk.yellow('\n  Migrating baselines.json to runs.json format...'));
    const migrated = performMigration(projectRoot);
    if (migrated) {
      console.log(chalk.green(`  ✓ Migrated ${migrationInfo.baselineCount} baseline(s)\n`));
    }
  }

  const store = loadRuns(projectRoot);
  const runs = listRuns(store);

  if (options.json) {
    console.log(JSON.stringify(runs, null, 2));
    return;
  }

  if (runs.length === 0) {
    console.log(box(
      chalk.dim('No runs found.\n\n') +
      chalk.dim('Run `sniff interview --run <label>` to create a new run.'),
      'Runs'
    ));
    return;
  }

  console.log(box(
    chalk.bold(`${runs.length} run${runs.length === 1 ? '' : 's'}\n\n`) +
    chalk.dim('ID                    Label                 Date                 Agent         Cases       Grade\n') +
    chalk.dim('─'.repeat(100)) + '\n' +
    runs.map(formatRunRow).join('\n'),
    'Runs'
  ));
}

/**
 * Show details of a specific run
 */
export async function runsShowCommand(options: { id: string; json?: boolean }): Promise<void> {
  const projectRoot = process.cwd();

  // Check for migration
  const migrationInfo = getMigrationInfo(projectRoot);
  if (migrationInfo.needed) {
    performMigration(projectRoot);
  }

  const store = loadRuns(projectRoot);

  // Resolve ID (could be label or partial ID)
  const runId = resolveRunId(store, options.id);
  if (!runId) {
    console.log(chalk.red(`\n  Run not found: ${options.id}`));
    console.log(chalk.dim('  Use `sniff runs list` to see available runs.\n'));
    return;
  }

  const run = getRun(store, runId);
  if (!run) {
    console.log(chalk.red(`\n  Run not found: ${runId}\n`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(run, null, 2));
    return;
  }

  // Display run details
  const cases = Object.entries(run.cases);
  const gradedCases = cases.filter(([_, c]) => c.grade !== undefined);
  const avgGrade = gradedCases.length > 0
    ? (gradedCases.reduce((sum, [_, c]) => sum + (c.grade || 0), 0) / gradedCases.length).toFixed(1)
    : 'N/A';

  const header = [
    chalk.bold('Run Details\n'),
    `ID: ${run.id}`,
    run.label ? `Label: ${chalk.cyan(run.label)}` : '',
    `Created: ${formatDate(run.createdAt)}`,
    '',
    chalk.bold('Agent Configuration:'),
    formatAgentConfig(run.agent),
    '',
    chalk.bold('Summary:'),
    `Cases: ${gradedCases.length}/${cases.length} graded`,
    `Average Grade: ${avgGrade}/10`,
  ].filter(Boolean).join('\n');

  console.log(box(header, `Run: ${run.id.substring(0, 20)}`));

  // Display case results
  if (cases.length > 0) {
    console.log(chalk.bold('\n  Case Results:\n'));
    console.log(chalk.dim('  Case ID                Grade    Graded By    Notes'));
    console.log(chalk.dim('  ' + '─'.repeat(70)));

    for (const [caseId, caseRun] of cases) {
      const grade = caseRun.grade !== undefined
        ? chalk.green(`${caseRun.grade}/10`)
        : chalk.dim('N/A');
      const gradedBy = caseRun.gradedBy || chalk.dim('-');
      const notes = caseRun.notes
        ? chalk.dim(caseRun.notes.substring(0, 30) + (caseRun.notes.length > 30 ? '...' : ''))
        : chalk.dim('-');

      console.log(`  ${caseId.padEnd(22)} ${grade.padEnd(12)} ${gradedBy.padEnd(12)} ${notes}`);
    }
    console.log('');
  }
}

/**
 * Delete a run
 */
export async function runsDeleteCommand(options: { id: string; force?: boolean }): Promise<void> {
  const projectRoot = process.cwd();

  // Check for migration first
  const migrationInfo = getMigrationInfo(projectRoot);
  if (migrationInfo.needed) {
    performMigration(projectRoot);
  }

  const store = loadRuns(projectRoot);

  // Resolve ID
  const runId = resolveRunId(store, options.id);
  if (!runId) {
    console.log(chalk.red(`\n  Run not found: ${options.id}`));
    console.log(chalk.dim('  Use `sniff runs list` to see available runs.\n'));
    return;
  }

  const run = getRun(store, runId);
  if (!run) {
    console.log(chalk.red(`\n  Run not found: ${runId}\n`));
    return;
  }

  // Confirm deletion unless --force
  if (!options.force) {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const caseCount = Object.keys(run.cases).length;
    const label = run.label ? ` (${run.label})` : '';

    const answer = await new Promise<string>((resolve) => {
      rl.question(
        chalk.yellow(`\n  Delete run ${runId}${label} with ${caseCount} case(s)? (y/N): `),
        resolve
      );
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log(chalk.dim('\n  Cancelled.\n'));
      return;
    }
  }

  // Delete the run
  const deleted = deleteRun(store, runId);
  if (deleted) {
    saveRuns(projectRoot, store);
    console.log(chalk.green(`\n  ✓ Deleted run: ${runId}\n`));
  } else {
    console.log(chalk.red(`\n  Failed to delete run: ${runId}\n`));
  }
}
