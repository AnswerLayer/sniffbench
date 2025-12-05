/**
 * Interview command - conversational comprehension evaluation
 *
 * Inspired by Anthropic Interviewer patterns:
 * - Three stages: Setup → Interview → Grade
 * - Conversational, not rigid
 * - Human-in-the-loop for quality
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { box } from '../../utils/ui';
import { loadCases, getDefaultCasesDir } from '../../cases';
import { Case } from '../../cases/types';

interface InterviewOptions {
  cases?: string;
  agent: string;
  output: string;
  baseline?: boolean;
}

interface Baseline {
  caseId: string;
  question: string;
  answer: string;
  grade: number;
  gradedAt: string;
  gradedBy: string;
  notes?: string;
}

interface BaselineStore {
  version: string;
  repoPath: string;
  createdAt: string;
  baselines: Record<string, Baseline>;
}

/**
 * Get the baseline store path for a project
 */
function getBaselineStorePath(projectRoot: string = process.cwd()): string {
  return path.join(projectRoot, '.sniffbench', 'baselines.json');
}

/**
 * Load existing baselines
 */
function loadBaselines(projectRoot: string): BaselineStore {
  const storePath = getBaselineStorePath(projectRoot);

  if (fs.existsSync(storePath)) {
    try {
      return JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    } catch {
      // Corrupted file, start fresh
    }
  }

  return {
    version: '1.0',
    repoPath: projectRoot,
    createdAt: new Date().toISOString(),
    baselines: {},
  };
}

/**
 * Save baselines
 */
function saveBaselines(projectRoot: string, store: BaselineStore): void {
  const storePath = getBaselineStorePath(projectRoot);
  const dir = path.dirname(storePath);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

/**
 * Create readline interface for user input
 */
function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask user a question and get response
 */
async function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Ask user for a grade (1-10)
 */
async function askGrade(rl: readline.Interface): Promise<number> {
  while (true) {
    const input = await ask(rl, chalk.cyan('\n  Grade this answer (1-10): '));

    const grade = parseInt(input, 10);
    if (grade >= 1 && grade <= 10) {
      return grade;
    }

    console.log(chalk.yellow('  Please enter a number between 1 and 10'));
  }
}

/**
 * Display the grading scale
 */
function showGradingScale(): void {
  console.log(chalk.dim('\n  Grading scale:'));
  console.log(chalk.dim('    1-3: Poor - Missing key information, incorrect, or confused'));
  console.log(chalk.dim('    4-5: Fair - Partially correct but incomplete or has errors'));
  console.log(chalk.dim('    6-7: Good - Mostly correct with minor gaps'));
  console.log(chalk.dim('    8-9: Great - Thorough and accurate'));
  console.log(chalk.dim('    10:  Perfect - Comprehensive, insightful, expert-level'));
}

/**
 * Format an agent's answer for display
 */
function formatAnswer(answer: string, maxLines: number = 30): string {
  const lines = answer.split('\n');
  if (lines.length <= maxLines) {
    return answer;
  }

  const truncated = lines.slice(0, maxLines).join('\n');
  return truncated + chalk.dim(`\n\n  ... (${lines.length - maxLines} more lines)`);
}

/**
 * Simulate agent response (placeholder - will integrate with real agent)
 */
async function getAgentResponse(caseData: Case, _agent: string): Promise<string> {
  // TODO: Integrate with actual agent wrapper
  // For now, return a placeholder that indicates the agent would explore

  return `[Agent would explore the codebase and answer:]

${caseData.prompt}

---
This is a placeholder response. In the full implementation, the agent
(${_agent}) would:

1. Analyze the codebase using allowed tools (read, grep, glob, search)
2. Build understanding of the relevant areas
3. Provide a detailed answer based on what it finds

To implement:
- Connect to Claude Code SDK or other agent wrappers
- Capture the agent's exploration and final answer
- Track tool usage for efficiency metrics`;
}

/**
 * Run a single interview question
 */
async function runInterviewQuestion(
  caseData: Case,
  agent: string,
  rl: readline.Interface,
  store: BaselineStore,
  projectRoot: string
): Promise<{ grade: number; skipped: boolean }> {
  const existingBaseline = store.baselines[caseData.id];

  // Show the question
  console.log(box(caseData.prompt, `Question: ${caseData.title}`));

  if (existingBaseline) {
    console.log(chalk.dim(`  Baseline exists (grade: ${existingBaseline.grade}/10, graded: ${existingBaseline.gradedAt.split('T')[0]})`));
    const regrade = await ask(rl, chalk.cyan('  Re-run and re-grade? (y/N): '));

    if (regrade.toLowerCase() !== 'y') {
      return { grade: existingBaseline.grade, skipped: true };
    }
  }

  // Get agent's response
  const spinner = ora('Agent is exploring the codebase...').start();

  try {
    const answer = await getAgentResponse(caseData, agent);
    spinner.succeed('Agent completed');

    // Display the answer
    console.log(chalk.dim('\n  ─────────────────────────────────────────'));
    console.log(chalk.bold('  Agent\'s Answer:\n'));
    console.log(formatAnswer(answer).split('\n').map(l => '  ' + l).join('\n'));
    console.log(chalk.dim('\n  ─────────────────────────────────────────'));

    // Show grading scale and ask for grade
    showGradingScale();
    const grade = await askGrade(rl);

    // Optional notes
    const notes = await ask(rl, chalk.dim('  Notes (optional, press Enter to skip): '));

    // Save baseline
    store.baselines[caseData.id] = {
      caseId: caseData.id,
      question: caseData.prompt,
      answer,
      grade,
      gradedAt: new Date().toISOString(),
      gradedBy: 'human',
      notes: notes || undefined,
    };

    saveBaselines(projectRoot, store);

    console.log(chalk.green(`\n  ✓ Baseline saved (${grade}/10)`));

    return { grade, skipped: false };
  } catch (err) {
    spinner.fail(`Failed: ${(err as Error).message}`);
    return { grade: 0, skipped: true };
  }
}

/**
 * Main interview command
 */
export async function interviewCommand(options: InterviewOptions) {
  const projectRoot = process.cwd();

  // Header
  console.log(box(
    chalk.bold('Comprehension Interview\n\n') +
    chalk.dim('Test how well your agent understands this codebase.\n') +
    chalk.dim('You\'ll grade each answer on a 1-10 scale to establish baselines.'),
    'sniff interview'
  ));

  // Load comprehension cases
  const spinner = ora('Loading comprehension cases...').start();
  const casesDir = getDefaultCasesDir();

  const cases = await loadCases(casesDir, {
    category: 'comprehension',
    ids: options.cases?.split(',').map(c => c.trim()),
  });

  if (cases.length === 0) {
    spinner.warn('No comprehension cases found');
    console.log(chalk.yellow('\nMake sure comprehension cases exist in:'));
    console.log(chalk.cyan(`  ${casesDir}/comprehension/`));
    return;
  }

  spinner.succeed(`Found ${cases.length} comprehension question${cases.length === 1 ? '' : 's'}`);

  // Load existing baselines
  const store = loadBaselines(projectRoot);
  const baselineCount = Object.keys(store.baselines).length;

  if (baselineCount > 0) {
    console.log(chalk.dim(`\n  ${baselineCount} existing baseline${baselineCount === 1 ? '' : 's'} found\n`));
  }

  // Show available questions
  console.log(chalk.bold('\n  Questions to cover:\n'));
  for (const c of cases) {
    const hasBaseline = store.baselines[c.id];
    const status = hasBaseline
      ? chalk.green(`✓ ${hasBaseline.grade}/10`)
      : chalk.dim('○ not graded');
    console.log(`  ${status}  ${chalk.bold(c.id)}: ${c.title}`);
  }

  // Create prompt
  const rl = createPrompt();

  try {
    // Ask if user wants to continue
    const proceed = await ask(rl, chalk.cyan('\n  Start interview? (Y/n): '));

    if (proceed.toLowerCase() === 'n') {
      console.log(chalk.dim('\n  Interview cancelled.\n'));
      return;
    }

    console.log(chalk.dim('\n  Starting interview...\n'));
    console.log(chalk.dim('  ═══════════════════════════════════════════════════\n'));

    // Run each question
    const results: { caseId: string; grade: number; skipped: boolean }[] = [];

    for (let i = 0; i < cases.length; i++) {
      const caseData = cases[i];

      console.log(chalk.bold(`\n  [${i + 1}/${cases.length}] ${caseData.title}`));
      console.log(chalk.dim(`  Difficulty: ${caseData.difficulty}\n`));

      const result = await runInterviewQuestion(caseData, options.agent, rl, store, projectRoot);
      results.push({ caseId: caseData.id, ...result });

      if (i < cases.length - 1) {
        const next = await ask(rl, chalk.cyan('\n  Continue to next question? (Y/n/q to quit): '));

        if (next.toLowerCase() === 'q' || next.toLowerCase() === 'n') {
          console.log(chalk.dim('\n  Interview paused. Run again to continue.\n'));
          break;
        }
      }
    }

    // Summary
    console.log(chalk.dim('\n  ═══════════════════════════════════════════════════\n'));

    const completed = results.filter(r => !r.skipped);
    const totalGrade = completed.reduce((sum, r) => sum + r.grade, 0);
    const avgGrade = completed.length > 0 ? (totalGrade / completed.length).toFixed(1) : 'N/A';

    const summaryLines = [
      chalk.bold('Interview Summary\n'),
      `Questions answered: ${completed.length}/${results.length}`,
      `Average grade: ${avgGrade}/10`,
      '',
      chalk.dim(`Baselines saved to: ${getBaselineStorePath(projectRoot)}`),
    ];

    console.log(box(summaryLines.join('\n'), 'Results'));

  } finally {
    rl.close();
  }
}
