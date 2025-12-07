/**
 * Interview command - conversational comprehension evaluation
 *
 * Inspired by Anthropic Interviewer patterns:
 * - Three stages: Setup → Interview → Grade
 * - Conversational, not rigid
 * - Human-in-the-loop for quality
 */

import chalk from 'chalk';
import ora, { Ora } from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { box } from '../../utils/ui';
import { loadCases, getDefaultCasesDir } from '../../cases';
import { Case } from '../../cases/types';
import { getAgent, AgentWrapper, AgentResult } from '../../agents';

/**
 * Exploration status messages - cycles through these while agent works
 */
const EXPLORATION_STATES = [
  { text: 'Reading files', color: chalk.cyan },
  { text: 'Scanning structure', color: chalk.blue },
  { text: 'Analyzing code', color: chalk.magenta },
  { text: 'Finding patterns', color: chalk.yellow },
  { text: 'Building context', color: chalk.green },
  { text: 'Connecting dots', color: chalk.cyan },
];

/**
 * Create an animated exploration spinner
 */
function createExplorationSpinner(agentName: string): { spinner: Ora; stop: () => void } {
  let stateIndex = 0;
  const spinner = ora({
    text: `${chalk.bold.hex('#D97706')(agentName)} ${EXPLORATION_STATES[0].color(EXPLORATION_STATES[0].text)}`,
    spinner: {
      interval: 80,
      frames: ['◐', '◓', '◑', '◒'],
    },
    color: 'yellow',
  }).start();

  // Cycle through states
  const interval = setInterval(() => {
    stateIndex = (stateIndex + 1) % EXPLORATION_STATES.length;
    const state = EXPLORATION_STATES[stateIndex];
    spinner.text = `${chalk.bold.hex('#D97706')(agentName)} ${state.color(state.text)}`;
  }, 2000);

  return {
    spinner,
    stop: () => {
      clearInterval(interval);
      spinner.stop();
    },
  };
}

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
 * Run agent on a comprehension question
 */
async function getAgentResponse(
  caseData: Case,
  agent: AgentWrapper,
  cwd: string,
  onOutput?: (chunk: string) => void
): Promise<AgentResult> {
  // Build the prompt for the agent
  // We frame it as a comprehension question about the codebase
  const prompt = `You are being evaluated on your understanding of this codebase.

Please answer the following question by exploring the codebase:

${caseData.prompt}

Be concise but accurate. Focus on the key points with specific file references where relevant. Aim for a clear, well-organized answer that a developer could quickly scan.`;

  const result = await agent.run(prompt, {
    cwd,
    timeoutMs: (caseData.expectations?.maxTimeSeconds || 300) * 1000,
    onOutput,
  });

  return result;
}

/**
 * Run a single interview question
 */
async function runInterviewQuestion(
  caseData: Case,
  agent: AgentWrapper,
  rl: readline.Interface,
  store: BaselineStore,
  projectRoot: string
): Promise<{ grade: number; skipped: boolean; durationMs?: number }> {
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

  // Get agent's response - stream output live with animated spinner
  console.log('');
  const exploration = createExplorationSpinner(agent.displayName);

  let outputStarted = false;
  const startTime = Date.now();

  try {
    const result = await getAgentResponse(caseData, agent, projectRoot, (chunk) => {
      // Stop spinner and show separator when first output arrives
      if (!outputStarted) {
        outputStarted = true;
        exploration.stop();
        console.log(chalk.dim('\n  ─────────────────────────────────────────\n'));
      }
      process.stdout.write(chunk);
    });

    // Ensure spinner is stopped
    exploration.stop();

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    if (!outputStarted) {
      console.log(chalk.dim('\n  ─────────────────────────────────────────'));
    } else {
      console.log(chalk.dim('\n\n  ─────────────────────────────────────────'));
    }

    if (result.timedOut) {
      console.log(chalk.yellow(`\n  ✗ ${agent.displayName} timed out after ${durationSec}s`));
      console.log(chalk.yellow('  The agent took too long. Consider increasing the timeout.'));
      return { grade: 0, skipped: true, durationMs: result.durationMs };
    }

    if (!result.success) {
      console.log(chalk.red(`\n  ✗ ${agent.displayName} failed: ${result.error}`));
      return { grade: 0, skipped: true, durationMs: result.durationMs };
    }

    console.log(chalk.green(`\n  ✓ ${agent.displayName} completed in ${durationSec}s`));

    // Show tools used if available
    if (result.toolsUsed && result.toolsUsed.length > 0) {
      console.log(chalk.dim(`\n  Tools used: ${result.toolsUsed.join(', ')}`));
    }

    // Show grading scale and ask for grade
    showGradingScale();
    const grade = await askGrade(rl);

    // Optional notes
    const notes = await ask(rl, chalk.dim('  Notes (optional, press Enter to skip): '));

    // Save baseline
    store.baselines[caseData.id] = {
      caseId: caseData.id,
      question: caseData.prompt,
      answer: result.answer,
      grade,
      gradedAt: new Date().toISOString(),
      gradedBy: 'human',
      notes: notes || undefined,
    };

    saveBaselines(projectRoot, store);

    console.log(chalk.green(`\n  ✓ Baseline saved (${grade}/10)`));

    return { grade, skipped: false, durationMs: result.durationMs };
  } catch (err) {
    exploration.stop();
    console.log(chalk.red(`\n  ✗ Failed: ${(err as Error).message}`));
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

  // Get the agent
  let agent: AgentWrapper;
  try {
    agent = getAgent(options.agent);
  } catch (err) {
    console.log(chalk.red(`\n  Error: ${(err as Error).message}`));
    return;
  }

  // Check agent availability
  const spinner = ora(`Checking ${agent.displayName} availability...`).start();
  const available = await agent.isAvailable();

  if (!available) {
    spinner.fail(`${agent.displayName} is not available`);
    console.log(chalk.yellow(`\n  Make sure '${options.agent}' is installed and in your PATH.`));
    console.log(chalk.dim(`  For Claude Code: https://claude.ai/code`));
    return;
  }

  const version = await agent.getVersion();
  spinner.succeed(`${agent.displayName} ${version ? `(${version})` : ''} is ready`);

  // Load comprehension cases
  spinner.start('Loading comprehension cases...');
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

      const result = await runInterviewQuestion(caseData, agent, rl, store, projectRoot);
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
