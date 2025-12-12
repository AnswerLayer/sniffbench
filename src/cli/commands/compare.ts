/**
 * Compare command - compare two evaluation runs
 */

import chalk from 'chalk';
import { box } from '../../utils/ui';
import {
  loadRuns,
  getRun,
  resolveRunId,
  diffAgentConfig,
  performMigration,
  needsMigration,
  Run,
  CaseRun,
} from '../../runs';
import {
  loadVariants,
  getVariant,
} from '../../variants';

/**
 * Format a metric delta with color coding
 */
function formatMetricDelta(
  oldVal: number,
  newVal: number,
  lowerIsBetter: boolean = false
): string {
  const delta = newVal - oldVal;
  const pctChange = oldVal > 0 ? ((delta / oldVal) * 100) : 0;
  const pctStr = pctChange >= 0 ? `+${pctChange.toFixed(1)}%` : `${pctChange.toFixed(1)}%`;

  let color: typeof chalk.green;
  if (delta === 0) {
    color = chalk.dim;
  } else if ((delta < 0 && lowerIsBetter) || (delta > 0 && !lowerIsBetter)) {
    color = chalk.green;
  } else {
    color = chalk.red;
  }

  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  return color(`${arrow} ${pctStr}`);
}

/**
 * Format a date string for display
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export async function compareCommand(run1Id: string, run2Id: string) {
  const projectRoot = process.cwd();

  // Migrate baselines if needed
  if (needsMigration(projectRoot)) {
    console.log(chalk.dim('  Migrating baselines.json to runs.json format...'));
    performMigration(projectRoot);
  }

  const store = loadRuns(projectRoot);

  // Resolve run IDs
  const resolvedId1 = resolveRunId(store, run1Id);
  const resolvedId2 = resolveRunId(store, run2Id);

  if (!resolvedId1) {
    console.log(chalk.red(`\n  Run not found: ${run1Id}`));
    console.log(chalk.dim('  Use `sniff runs list` to see available runs.\n'));
    return;
  }

  if (!resolvedId2) {
    console.log(chalk.red(`\n  Run not found: ${run2Id}`));
    console.log(chalk.dim('  Use `sniff runs list` to see available runs.\n'));
    return;
  }

  const run1 = getRun(store, resolvedId1)!;
  const run2 = getRun(store, resolvedId2)!;

  // Load variants for variant info display
  const variantStore = loadVariants(projectRoot);
  const variant1 = run1.agent.variantId ? getVariant(variantStore, run1.agent.variantId) : undefined;
  const variant2 = run2.agent.variantId ? getVariant(variantStore, run2.agent.variantId) : undefined;

  // Header
  console.log(box(
    chalk.bold('Run Comparison\n\n') +
    chalk.dim('Comparing two evaluation runs side-by-side.'),
    'sniff compare'
  ));

  // Run info
  console.log(chalk.bold('\n  Run Information:\n'));
  console.log(chalk.dim('  ─'.repeat(40)));

  const label1 = run1.label ? chalk.cyan(`[${run1.label}]`) : '';
  const label2 = run2.label ? chalk.cyan(`[${run2.label}]`) : '';

  console.log(`  ${chalk.bold('Run 1:')} ${run1.id.substring(0, 20)} ${label1}`);
  console.log(`         Created: ${formatDate(run1.createdAt)}`);
  console.log(`         Agent: ${run1.agent.name} ${run1.agent.version || ''}`);
  console.log(`         Model: ${run1.agent.model}`);
  if (variant1) {
    console.log(`         Variant: ${chalk.magenta(variant1.name)}${variant1.description ? chalk.dim(` - ${variant1.description}`) : ''}`);
  }

  console.log('');

  console.log(`  ${chalk.bold('Run 2:')} ${run2.id.substring(0, 20)} ${label2}`);
  console.log(`         Created: ${formatDate(run2.createdAt)}`);
  console.log(`         Agent: ${run2.agent.name} ${run2.agent.version || ''}`);
  console.log(`         Model: ${run2.agent.model}`);
  if (variant2) {
    console.log(`         Variant: ${chalk.magenta(variant2.name)}${variant2.description ? chalk.dim(` - ${variant2.description}`) : ''}`);
  }

  // Config diff
  const configDiffs = diffAgentConfig(run1.agent, run2.agent);
  if (configDiffs.length > 0) {
    console.log(chalk.bold('\n  Configuration Changes:\n'));
    console.log(chalk.dim('  ─'.repeat(40)));
    for (const diff of configDiffs) {
      console.log(`  ${diff.field}: ${chalk.red(diff.old)} → ${chalk.green(diff.new)}`);
    }
  } else {
    console.log(chalk.dim('\n  No configuration changes detected.\n'));
  }

  // Find common cases
  const cases1 = Object.keys(run1.cases);
  const cases2 = Object.keys(run2.cases);
  const commonCases = cases1.filter(c => cases2.includes(c));
  const onlyIn1 = cases1.filter(c => !cases2.includes(c));
  const onlyIn2 = cases2.filter(c => !cases1.includes(c));

  // Case comparison
  console.log(chalk.bold('\n  Case Comparison:\n'));
  console.log(chalk.dim('  ─'.repeat(40)));

  if (commonCases.length === 0) {
    console.log(chalk.yellow('  No common cases to compare.'));
    if (onlyIn1.length > 0) {
      console.log(chalk.dim(`  Cases only in run 1: ${onlyIn1.join(', ')}`));
    }
    if (onlyIn2.length > 0) {
      console.log(chalk.dim(`  Cases only in run 2: ${onlyIn2.join(', ')}`));
    }
    return;
  }

  // Header for case table
  console.log(chalk.dim('  Case ID                Grade 1   Grade 2   Tokens          Cost'));
  console.log(chalk.dim('  ' + '─'.repeat(75)));

  // Aggregate metrics
  let totalTokens1 = 0;
  let totalTokens2 = 0;
  let totalCost1 = 0;
  let totalCost2 = 0;
  let totalGrade1 = 0;
  let totalGrade2 = 0;
  let gradedCount = 0;

  for (const caseId of commonCases) {
    const case1 = run1.cases[caseId];
    const case2 = run2.cases[caseId];

    const grade1 = case1.grade !== undefined ? `${case1.grade}/10` : 'N/A';
    const grade2 = case2.grade !== undefined ? `${case2.grade}/10` : 'N/A';

    const tokens1 = case1.behaviorMetrics?.totalTokens || 0;
    const tokens2 = case2.behaviorMetrics?.totalTokens || 0;
    const tokenDelta = formatMetricDelta(tokens1, tokens2, true);

    const cost1 = case1.behaviorMetrics?.costUsd || 0;
    const cost2 = case2.behaviorMetrics?.costUsd || 0;
    const costDelta = formatMetricDelta(cost1, cost2, true);

    console.log(
      `  ${caseId.padEnd(22)} ${grade1.padEnd(9)} ${grade2.padEnd(9)} ` +
      `${tokens1.toLocaleString().padStart(6)} → ${tokens2.toLocaleString().padEnd(6)} ${tokenDelta.padEnd(12)} ` +
      `$${cost1.toFixed(4)} → $${cost2.toFixed(4)} ${costDelta}`
    );

    // Aggregate
    totalTokens1 += tokens1;
    totalTokens2 += tokens2;
    totalCost1 += cost1;
    totalCost2 += cost2;

    if (case1.grade !== undefined && case2.grade !== undefined) {
      totalGrade1 += case1.grade;
      totalGrade2 += case2.grade;
      gradedCount++;
    }
  }

  // Summary
  console.log(chalk.dim('\n  ' + '─'.repeat(75)));
  console.log(chalk.bold('\n  Aggregate Summary:\n'));

  const avgGrade1 = gradedCount > 0 ? (totalGrade1 / gradedCount).toFixed(1) : 'N/A';
  const avgGrade2 = gradedCount > 0 ? (totalGrade2 / gradedCount).toFixed(1) : 'N/A';

  console.log(`  Cases compared: ${commonCases.length}`);
  if (gradedCount > 0) {
    console.log(`  Average grade: ${avgGrade1} → ${avgGrade2} ${formatMetricDelta(totalGrade1 / gradedCount, totalGrade2 / gradedCount, false)}`);
  }
  console.log(`  Total tokens: ${totalTokens1.toLocaleString()} → ${totalTokens2.toLocaleString()} ${formatMetricDelta(totalTokens1, totalTokens2, true)}`);
  console.log(`  Total cost: $${totalCost1.toFixed(4)} → $${totalCost2.toFixed(4)} ${formatMetricDelta(totalCost1, totalCost2, true)}`);

  // Show cases only in one run
  if (onlyIn1.length > 0) {
    console.log(chalk.dim(`\n  Cases only in run 1: ${onlyIn1.join(', ')}`));
  }
  if (onlyIn2.length > 0) {
    console.log(chalk.dim(`  Cases only in run 2: ${onlyIn2.join(', ')}`));
  }

  console.log('');
}
