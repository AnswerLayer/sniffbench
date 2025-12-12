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
import { getAgent, AgentWrapper, AgentResult, AgentEvent } from '../../agents';
import { computeBehaviorMetrics, formatBehaviorMetrics } from '../../metrics';
import {
  Run,
  CaseRun,
  loadRuns,
  saveRuns,
  generateRunId,
  addRun,
  capturePartialAgentConfig,
  performMigration,
  needsMigration,
} from '../../runs';
import {
  loadVariants,
  resolveVariantId,
  getVariant,
  findMatchingVariant,
} from '../../variants';

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
 * Create an animated exploration spinner that shows tool activity
 */
function createExplorationSpinner(agentName: string): {
  spinner: Ora;
  stop: () => void;
  updateWithToolCall: (toolInfo: string) => void;
  toolCalls: string[];
} {
  let stateIndex = 0;
  const toolCalls: string[] = [];

  const getBaseText = () => {
    const state = EXPLORATION_STATES[stateIndex];
    return `${chalk.bold.hex('#D97706')(agentName)} ${state.color(state.text)}`;
  };

  const spinner = ora({
    text: getBaseText(),
    spinner: {
      interval: 80,
      frames: ['◐', '◓', '◑', '◒'],
    },
    color: 'yellow',
  }).start();

  // Cycle through states
  const interval = setInterval(() => {
    stateIndex = (stateIndex + 1) % EXPLORATION_STATES.length;
    const toolCount = toolCalls.length;
    const lastTool = toolCalls[toolCalls.length - 1];
    if (toolCount > 0 && lastTool) {
      spinner.text = `${getBaseText()} ${chalk.dim(`(${toolCount} tools) ${lastTool}`)}`;
    } else {
      spinner.text = getBaseText();
    }
  }, 2000);

  // Update spinner to show tool call info (only actual tool calls, not text output)
  const updateWithToolCall = (toolInfo: string) => {
    if (!toolInfo.trim()) return;

    // Only capture lines that are actual tool calls (formatted by claude-code.ts)
    // Tool calls look like: "  › Read src/file.ts" or "  › Glob **/*.ts"
    const lines = toolInfo.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('›')) {
        // Strip ANSI codes for clean storage
        const clean = trimmed.replace(/\x1b\[[0-9;]*m/g, '').substring(0, 80);
        toolCalls.push(clean);
        spinner.text = `${getBaseText()} ${chalk.dim(`(${toolCalls.length} tools) ${clean}`)}`;
      }
    }
  };

  return {
    spinner,
    toolCalls,
    updateWithToolCall,
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
  compare?: boolean;
  run?: string;  // Save to named run (enables run tracking)
  variant?: string;  // Link run to a registered variant
}

interface Baseline {
  caseId: string;
  question: string;
  answer: string;
  grade: number;
  gradedAt: string;
  gradedBy: string;
  notes?: string;
  behaviorMetrics?: {
    totalTokens: number;
    toolCount: number;
    costUsd: number;
    explorationRatio: number;
    cacheHitRatio: number;
    avgToolDurationMs: number;
    tokensPerTool: number;
    tokensPerRead: number;
    readCount: number;
    inputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
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
 * Format a metric delta with color coding
 * @param label - metric label
 * @param oldVal - baseline value
 * @param newVal - new value
 * @param lowerIsBetter - if true, negative change is good (e.g., tokens, cost)
 */
function formatMetricDelta(
  label: string,
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

  return `${label}: ${oldVal.toLocaleString()} → ${newVal.toLocaleString()} ${color(`${arrow} ${pctStr}`)}`;
}

/**
 * Display metrics comparison between baseline and new result
 */
function displayMetricsComparison(
  baseline: Baseline['behaviorMetrics'],
  newMetrics: Baseline['behaviorMetrics']
): void {
  if (!baseline || !newMetrics) {
    console.log(chalk.dim('    No metrics available for comparison'));
    return;
  }

  console.log(chalk.bold('\n  Metrics Comparison:'));
  console.log(`    ${formatMetricDelta('Tokens', baseline.totalTokens, newMetrics.totalTokens, true)}`);
  console.log(`    ${formatMetricDelta('Tools', baseline.toolCount, newMetrics.toolCount, true)}`);
  console.log(`    ${formatMetricDelta('Cost', baseline.costUsd * 10000, newMetrics.costUsd * 10000, true).replace('Cost', 'Cost ($×10⁴)')}`);
  console.log(`    ${formatMetricDelta('Cache hits', Math.round(baseline.cacheHitRatio * 100), Math.round(newMetrics.cacheHitRatio * 100), false)}`);
}

/**
 * Comparison result for a single case
 */
interface ComparisonResult {
  caseId: string;
  title: string;
  baselineGrade: number;
  baselineAnswer: string;
  newAnswer: string;
  baselineMetrics?: Baseline['behaviorMetrics'];
  newMetrics?: Baseline['behaviorMetrics'];
  durationMs?: number;
  success: boolean;
  error?: string;
}

/**
 * Create readline interface for user input
 */
function createPrompt(): readline.Interface {
  // Ensure stdin is flowing
  if (process.stdin.isPaused()) {
    process.stdin.resume();
  }
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Check if readline is still usable
 */
function isReadlineOpen(rl: readline.Interface): boolean {
  // @ts-ignore - accessing internal property to check state
  return rl.terminal !== undefined && !rl.closed;
}

/** Default timeout for user input (5 minutes) */
const USER_INPUT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Ask user a question and get response with timeout
 */
async function ask(rl: readline.Interface, question: string, timeoutMs: number = USER_INPUT_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    let answered = false;

    const timeout = setTimeout(() => {
      if (!answered) {
        answered = true;
        resolve(''); // Return empty on timeout
      }
    }, timeoutMs);

    // Handle readline close (e.g., stdin EOF)
    const onClose = () => {
      if (!answered) {
        answered = true;
        clearTimeout(timeout);
        resolve('');
      }
    };
    rl.once('close', onClose);

    rl.question(question, (answer) => {
      if (!answered) {
        answered = true;
        clearTimeout(timeout);
        rl.removeListener('close', onClose);
        resolve(answer.trim());
      }
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
  onEvent?: (event: AgentEvent) => void
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
    onEvent,
  });

  return result;
}

/**
 * Run a single interview question
 * Returns the readline interface (may be recreated if stdin was disrupted)
 */
async function runInterviewQuestion(
  caseData: Case,
  agent: AgentWrapper,
  rl: readline.Interface,
  store: BaselineStore,
  projectRoot: string
): Promise<{ grade: number; skipped: boolean; durationMs?: number; model?: string; rl: readline.Interface }> {
  const existingBaseline = store.baselines[caseData.id];

  // Show the question
  console.log(box(caseData.prompt, `Question: ${caseData.title}`));

  if (existingBaseline) {
    console.log(chalk.dim(`  Baseline exists (grade: ${existingBaseline.grade}/10, graded: ${existingBaseline.gradedAt.split('T')[0]})`));
    const regrade = await ask(rl, chalk.cyan('  Re-run and re-grade? (y/N): '));

    if (regrade.toLowerCase() !== 'y') {
      return { grade: existingBaseline.grade, skipped: true, rl };
    }
  }

  // Get agent's response - stream output live with animated spinner at bottom
  console.log('');
  const exploration = createExplorationSpinner(agent.displayName);

  let outputStarted = false;
  const startTime = Date.now();

  let textOutputStarted = false;

  try {
    const result = await getAgentResponse(caseData, agent, projectRoot, (event) => {
      outputStarted = true;

      switch (event.type) {
        case 'tool_start': {
          // Show tool with key input info
          const input = event.tool.input;
          let detail = '';

          // Special handling for Task tool - show subagent type and prompt
          if (event.tool.name === 'Task') {
            const subagentType = input.subagent_type ? `[${input.subagent_type}]` : '';
            const desc = input.description || '';
            const prompt = input.prompt ? String(input.prompt).substring(0, 60) : '';
            detail = `${subagentType} ${desc}`.trim();

            exploration.toolCalls.push(`› ${event.tool.name}`);
            if (!textOutputStarted) exploration.spinner.stop();
            console.log(chalk.yellow(`\n  ⚡ Task ${chalk.bold(subagentType)} ${chalk.dim(desc)}`));
            if (prompt) {
              console.log(chalk.dim(`     "${prompt}${String(input.prompt).length > 60 ? '...' : ''}"`));
            }
            if (!textOutputStarted) exploration.spinner.start();
          } else {
            // Extract most useful input field for display
            if (input.file_path) detail = String(input.file_path).split('/').slice(-2).join('/');
            else if (input.pattern) detail = String(input.pattern);
            else if (input.command) detail = String(input.command).substring(0, 50);
            else if (input.query) detail = String(input.query).substring(0, 40);
            else if (input.path) detail = String(input.path).split('/').slice(-2).join('/');

            const toolInfo = detail ? `${event.tool.name} ${chalk.dim(detail)}` : event.tool.name;
            exploration.toolCalls.push(`› ${event.tool.name}`);

            // Stop spinner, show tool call, restart only if text hasn't started
            if (!textOutputStarted) exploration.spinner.stop();
            console.log(chalk.cyan(`${textOutputStarted ? '\n' : ''}  › ${toolInfo}`));
            if (!textOutputStarted) exploration.spinner.start();
          }

          if (!textOutputStarted) {
            const state = EXPLORATION_STATES[exploration.toolCalls.length % EXPLORATION_STATES.length];
            const baseText = `${chalk.bold.hex('#D97706')(agent.displayName)} ${state.color(state.text)}`;
            exploration.spinner.text = `${baseText} ${chalk.dim(`(${exploration.toolCalls.length} tools)`)}`;
          }
          break;
        }

        case 'tool_end': {
          // Could show truncated result here if desired
          break;
        }

        case 'thinking': {
          // Show thinking/reasoning output between tool calls
          const text = event.text.trim();
          if (text) {
            if (!textOutputStarted) exploration.spinner.stop();
            // Show first line or first 150 chars of thinking
            const firstLine = text.split('\n')[0];
            const display = firstLine.length > 150
              ? firstLine.substring(0, 150) + '...'
              : firstLine;
            console.log(chalk.magenta(`${textOutputStarted ? '\n' : ''}  💭 ${display}`));
            // If there's more content, indicate it
            if (text.includes('\n') || text.length > 150) {
              const lineCount = text.split('\n').length;
              if (lineCount > 1) {
                console.log(chalk.dim(`     (${lineCount} lines of reasoning)`));
              }
            }
            if (!textOutputStarted) exploration.spinner.start();
          }
          break;
        }

        case 'text_delta': {
          // Stream text content to stdout
          if (event.text.trim()) {
            if (!textOutputStarted) {
              textOutputStarted = true;
              exploration.stop();
              console.log(chalk.dim('\n  ─────────────────────────────────────────\n'));
            }
            process.stdout.write(event.text);
          }
          break;
        }

        case 'status': {
          // Only update spinner if text hasn't started
          if (!textOutputStarted) {
            exploration.spinner.text = `${chalk.bold.hex('#D97706')(agent.displayName)} ${chalk.cyan(event.message)}`;
          }
          break;
        }

        // Ignore other event types for now
        default:
          break;
      }
    });

    // Ensure spinner is stopped
    if (!textOutputStarted) {
      exploration.stop();
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    if (textOutputStarted) {
      console.log(chalk.dim('\n\n  ─────────────────────────────────────────'));
    } else {
      console.log(chalk.dim('\n  ─────────────────────────────────────────'));
    }

    if (result.timedOut) {
      console.log(chalk.yellow(`\n  ✗ ${agent.displayName} timed out after ${durationSec}s`));
      console.log(chalk.yellow('  The agent took too long. Consider increasing the timeout.'));
      return { grade: 0, skipped: true, durationMs: result.durationMs, rl };
    }

    if (!result.success) {
      console.log(chalk.red(`\n  ✗ ${agent.displayName} failed: ${result.error}`));
      return { grade: 0, skipped: true, durationMs: result.durationMs, rl };
    }

    console.log(chalk.green(`\n  ✓ ${agent.displayName} completed in ${durationSec}s`) + chalk.dim(` (${result.model})`));

    // Show tools used if available
    if (result.toolsUsed && result.toolsUsed.length > 0) {
      console.log(chalk.dim(`\n  Tools used: ${result.toolsUsed.join(', ')}`));
    }

    // Show behavior metrics
    const behaviorMetrics = computeBehaviorMetrics(result);
    console.log(chalk.bold('\n  Behavior Metrics:'));
    console.log(formatBehaviorMetrics(behaviorMetrics));

    // Recreate readline after agent run - stdin may have been disrupted
    // by the spawned claude process
    if (!isReadlineOpen(rl)) {
      rl.close();
      rl = createPrompt();
    }
    // Ensure stdin is flowing
    if (process.stdin.isPaused()) {
      process.stdin.resume();
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
      behaviorMetrics,
    };

    saveBaselines(projectRoot, store);

    console.log(chalk.green(`\n  ✓ Baseline saved (${grade}/10)`));

    return { grade, skipped: false, durationMs: result.durationMs, model: result.model, rl };
  } catch (err) {
    exploration.stop();
    console.log(chalk.red(`\n  ✗ Failed: ${(err as Error).message}`));
    return { grade: 0, skipped: true, rl };
  }
}

/**
 * Run a single comparison case (no human grading)
 */
async function runComparisonCase(
  caseData: Case,
  agent: AgentWrapper,
  baseline: Baseline,
  projectRoot: string
): Promise<ComparisonResult> {
  // Show the question
  console.log(box(caseData.prompt, `Question: ${caseData.title}`));
  console.log(chalk.dim(`  Baseline grade: ${baseline.grade}/10 (graded: ${baseline.gradedAt.split('T')[0]})`));

  // Get agent's response with animated spinner
  console.log('');
  const exploration = createExplorationSpinner(agent.displayName);
  const startTime = Date.now();
  let textOutputStarted = false;

  try {
    const result = await getAgentResponse(caseData, agent, projectRoot, (event) => {
      switch (event.type) {
        case 'tool_start': {
          const input = event.tool.input;
          let detail = '';

          if (event.tool.name === 'Task') {
            const subagentType = input.subagent_type ? `[${input.subagent_type}]` : '';
            const desc = input.description || '';
            exploration.toolCalls.push(`› ${event.tool.name}`);
            if (!textOutputStarted) exploration.spinner.stop();
            console.log(chalk.yellow(`\n  ⚡ Task ${chalk.bold(subagentType)} ${chalk.dim(desc)}`));
            if (!textOutputStarted) exploration.spinner.start();
          } else {
            if (input.file_path) detail = String(input.file_path).split('/').slice(-2).join('/');
            else if (input.pattern) detail = String(input.pattern);
            else if (input.command) detail = String(input.command).substring(0, 50);
            else if (input.query) detail = String(input.query).substring(0, 40);
            else if (input.path) detail = String(input.path).split('/').slice(-2).join('/');

            const toolInfo = detail ? `${event.tool.name} ${chalk.dim(detail)}` : event.tool.name;
            exploration.toolCalls.push(`› ${event.tool.name}`);

            if (!textOutputStarted) exploration.spinner.stop();
            console.log(chalk.cyan(`${textOutputStarted ? '\n' : ''}  › ${toolInfo}`));
            if (!textOutputStarted) exploration.spinner.start();
          }

          if (!textOutputStarted) {
            const state = EXPLORATION_STATES[exploration.toolCalls.length % EXPLORATION_STATES.length];
            const baseText = `${chalk.bold.hex('#D97706')(agent.displayName)} ${state.color(state.text)}`;
            exploration.spinner.text = `${baseText} ${chalk.dim(`(${exploration.toolCalls.length} tools)`)}`;
          }
          break;
        }

        case 'text_delta': {
          if (event.text.trim()) {
            if (!textOutputStarted) {
              textOutputStarted = true;
              exploration.stop();
              console.log(chalk.dim('\n  ─────────────────────────────────────────\n'));
            }
            process.stdout.write(event.text);
          }
          break;
        }

        default:
          break;
      }
    });

    // Ensure spinner is stopped
    if (!textOutputStarted) {
      exploration.stop();
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    if (textOutputStarted) {
      console.log(chalk.dim('\n\n  ─────────────────────────────────────────'));
    } else {
      console.log(chalk.dim('\n  ─────────────────────────────────────────'));
    }

    if (result.timedOut) {
      console.log(chalk.yellow(`\n  ✗ ${agent.displayName} timed out after ${durationSec}s`));
      return {
        caseId: caseData.id,
        title: caseData.title,
        baselineGrade: baseline.grade,
        baselineAnswer: baseline.answer,
        newAnswer: '',
        baselineMetrics: baseline.behaviorMetrics,
        success: false,
        error: 'Timed out',
      };
    }

    if (!result.success) {
      console.log(chalk.red(`\n  ✗ ${agent.displayName} failed: ${result.error}`));
      return {
        caseId: caseData.id,
        title: caseData.title,
        baselineGrade: baseline.grade,
        baselineAnswer: baseline.answer,
        newAnswer: '',
        baselineMetrics: baseline.behaviorMetrics,
        success: false,
        error: result.error,
      };
    }

    console.log(chalk.green(`\n  ✓ ${agent.displayName} completed in ${durationSec}s`) + chalk.dim(` (${result.model})`));

    // Compute and display metrics comparison
    const newMetrics = computeBehaviorMetrics(result);
    displayMetricsComparison(baseline.behaviorMetrics, newMetrics);

    return {
      caseId: caseData.id,
      title: caseData.title,
      baselineGrade: baseline.grade,
      baselineAnswer: baseline.answer,
      newAnswer: result.answer,
      baselineMetrics: baseline.behaviorMetrics,
      newMetrics,
      durationMs: result.durationMs,
      success: true,
    };

  } catch (err) {
    exploration.stop();
    console.log(chalk.red(`\n  ✗ Failed: ${(err as Error).message}`));
    return {
      caseId: caseData.id,
      title: caseData.title,
      baselineGrade: baseline.grade,
      baselineAnswer: baseline.answer,
      newAnswer: '',
      baselineMetrics: baseline.behaviorMetrics,
      success: false,
      error: (err as Error).message,
    };
  }
}

/**
 * Display comparison summary
 */
function displayComparisonSummary(results: ComparisonResult[]): void {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  // Calculate aggregate metrics changes
  let totalTokensBaseline = 0;
  let totalTokensNew = 0;
  let totalCostBaseline = 0;
  let totalCostNew = 0;

  for (const r of successful) {
    if (r.baselineMetrics && r.newMetrics) {
      totalTokensBaseline += r.baselineMetrics.totalTokens;
      totalTokensNew += r.newMetrics.totalTokens;
      totalCostBaseline += r.baselineMetrics.costUsd;
      totalCostNew += r.newMetrics.costUsd;
    }
  }

  const tokenDelta = totalTokensNew - totalTokensBaseline;
  const tokenPct = totalTokensBaseline > 0 ? ((tokenDelta / totalTokensBaseline) * 100).toFixed(1) : '0';
  const costDelta = totalCostNew - totalCostBaseline;
  const costPct = totalCostBaseline > 0 ? ((costDelta / totalCostBaseline) * 100).toFixed(1) : '0';

  const tokenColor = tokenDelta <= 0 ? chalk.green : chalk.red;
  const costColor = costDelta <= 0 ? chalk.green : chalk.red;

  const summaryLines = [
    chalk.bold('Comparison Summary\n'),
    `Cases compared: ${successful.length}/${results.length}`,
    failed.length > 0 ? chalk.yellow(`Failed: ${failed.length}`) : '',
    '',
    chalk.bold('Aggregate Metrics:'),
    `  Tokens: ${totalTokensBaseline.toLocaleString()} → ${totalTokensNew.toLocaleString()} ${tokenColor(`(${tokenDelta >= 0 ? '+' : ''}${tokenPct}%)`)}`,
    `  Cost: $${totalCostBaseline.toFixed(4)} → $${totalCostNew.toFixed(4)} ${costColor(`(${costDelta >= 0 ? '+' : ''}${costPct}%)`)}`,
    '',
    chalk.dim('Note: Run with LLM-judge (coming soon) for answer quality comparison'),
  ].filter(Boolean);

  console.log(box(summaryLines.join('\n'), 'Results'));
}

/**
 * Main interview command
 */
export async function interviewCommand(options: InterviewOptions) {
  const projectRoot = process.cwd();
  const isCompareMode = options.compare === true;
  const isRunMode = !!options.run;

  // Migrate baselines if needed
  if (needsMigration(projectRoot)) {
    console.log(chalk.dim('  Migrating baselines.json to runs.json format...'));
    performMigration(projectRoot);
  }

  // Header - different for each mode
  if (isCompareMode) {
    console.log(box(
      chalk.bold('Baseline Comparison\n\n') +
      chalk.dim('Compare new agent responses against existing baselines.\n') +
      chalk.dim('Metrics will be compared; answer quality requires LLM-judge (coming soon).'),
      'sniff interview --compare'
    ));
  } else {
    const labelInfo = options.run
      ? chalk.dim(`Results will be saved to run: ${chalk.cyan(options.run)}`)
      : chalk.dim('Results will be saved to a new run with auto-generated ID.');
    console.log(box(
      chalk.bold('Comprehension Interview\n\n') +
      chalk.dim('Test how well your agent understands this codebase.\n') +
      labelInfo,
      'sniff interview'
    ));
  }

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

  // Always initialize run tracking (--run flag just provides optional label)
  const agentConfig = await capturePartialAgentConfig(agent, projectRoot);

  // Handle variant linking
  let variantId: string | undefined;
  if (options.variant) {
    // Explicit variant provided
    const variantStore = loadVariants(projectRoot);
    const resolvedId = resolveVariantId(variantStore, options.variant);
    if (!resolvedId) {
      console.log(chalk.red(`\n  Variant not found: ${options.variant}`));
      console.log(chalk.dim('  Use `sniff variant list` to see available variants.\n'));
      return;
    }
    const variant = getVariant(variantStore, resolvedId)!;
    variantId = variant.id;
    console.log(chalk.dim(`\n  Using variant: ${variant.name} (${variant.id})`));
  } else {
    // Try auto-matching to an existing variant
    const variantStore = loadVariants(projectRoot);
    const matchingVariant = findMatchingVariant(variantStore, agentConfig);
    if (matchingVariant) {
      variantId = matchingVariant.id;
      console.log(chalk.dim(`\n  Auto-linked to variant: ${matchingVariant.name}`));
    }
  }

  // Add variantId to agent config if linked
  if (variantId) {
    agentConfig.variantId = variantId;
  }

  const currentRun: Run = {
    id: generateRunId(),
    label: options.run,  // undefined if --run not provided
    createdAt: new Date().toISOString(),
    agent: agentConfig,
    cases: {},
  };
  console.log(chalk.dim(`\n  Run ID: ${currentRun.id}${options.run ? ` [${options.run}]` : ''}`));

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

  // In compare mode, we need baselines to compare against
  if (isCompareMode && baselineCount === 0) {
    console.log(chalk.red('\n  No baselines found to compare against.'));
    console.log(chalk.yellow('  Run `sniff interview` first to establish baselines.\n'));
    return;
  }

  // Filter cases to only those with baselines in compare mode
  const casesToRun = isCompareMode
    ? cases.filter(c => store.baselines[c.id])
    : cases;

  if (isCompareMode && casesToRun.length === 0) {
    console.log(chalk.red('\n  No matching cases found with baselines.'));
    console.log(chalk.yellow('  Run `sniff interview` first to establish baselines.\n'));
    return;
  }

  // Show available questions
  console.log(chalk.bold(`\n  Questions to ${isCompareMode ? 'compare' : 'cover'}:\n`));
  for (const c of casesToRun) {
    const hasBaseline = store.baselines[c.id];
    const status = hasBaseline
      ? chalk.green(`✓ ${hasBaseline.grade}/10`)
      : chalk.dim('○ not graded');
    console.log(`  ${status}  ${chalk.bold(c.id)}: ${c.title}`);
  }

  // Create prompt - may be recreated if stdin is disrupted during agent run
  let rl = createPrompt();

  try {
    // Ask if user wants to continue
    const promptText = isCompareMode
      ? chalk.cyan('\n  Start comparison? (Y/n): ')
      : chalk.cyan('\n  Start interview? (Y/n): ');
    const proceed = await ask(rl, promptText);

    if (proceed.toLowerCase() === 'n') {
      console.log(chalk.dim(`\n  ${isCompareMode ? 'Comparison' : 'Interview'} cancelled.\n`));
      return;
    }

    console.log(chalk.dim(`\n  Starting ${isCompareMode ? 'comparison' : 'interview'}...\n`));
    console.log(chalk.dim('  ═══════════════════════════════════════════════════\n'));

    if (isCompareMode) {
      // Compare mode - run all cases against baselines
      const comparisonResults: ComparisonResult[] = [];

      for (let i = 0; i < casesToRun.length; i++) {
        const caseData = casesToRun[i];
        const baseline = store.baselines[caseData.id];

        console.log(chalk.bold(`\n  [${i + 1}/${casesToRun.length}] ${caseData.title}`));
        console.log(chalk.dim(`  Difficulty: ${caseData.difficulty}\n`));

        const result = await runComparisonCase(caseData, agent, baseline, projectRoot);
        comparisonResults.push(result);

        if (i < casesToRun.length - 1) {
          const next = await ask(rl, chalk.cyan('\n  Continue to next question? (Y/n/q to quit): '));

          if (next.toLowerCase() === 'q' || next.toLowerCase() === 'n') {
            console.log(chalk.dim('\n  Comparison paused.\n'));
            break;
          }
        }
      }

      // Summary for compare mode
      console.log(chalk.dim('\n  ═══════════════════════════════════════════════════\n'));
      displayComparisonSummary(comparisonResults);

    } else {
      // Normal interview mode
      const results: { caseId: string; grade: number; skipped: boolean; model?: string }[] = [];

      for (let i = 0; i < casesToRun.length; i++) {
        const caseData = casesToRun[i];

        console.log(chalk.bold(`\n  [${i + 1}/${casesToRun.length}] ${caseData.title}`));
        console.log(chalk.dim(`  Difficulty: ${caseData.difficulty}\n`));

        const result = await runInterviewQuestion(caseData, agent, rl, store, projectRoot);
        // Update rl in case it was recreated after agent run
        rl = result.rl;
        results.push({
          caseId: caseData.id,
          grade: result.grade,
          skipped: result.skipped,
          model: result.model,
        });

        // Copy baseline to run if case wasn't skipped
        if (!result.skipped) {
          const baseline = store.baselines[caseData.id];
          if (baseline) {
            const caseRun: CaseRun = {
              answer: baseline.answer,
              grade: baseline.grade,
              gradedAt: baseline.gradedAt,
              gradedBy: baseline.gradedBy,
              notes: baseline.notes,
              behaviorMetrics: baseline.behaviorMetrics || {
                totalTokens: 0,
                toolCount: 0,
                costUsd: 0,
                explorationRatio: 0,
                cacheHitRatio: 0,
                avgToolDurationMs: 0,
                tokensPerTool: 0,
                tokensPerRead: 0,
                readCount: 0,
                inputTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
              },
            };
            currentRun.cases[caseData.id] = caseRun;

            // Update model from first case result
            if (result.model && currentRun.agent.model === 'unknown') {
              currentRun.agent.model = result.model;
            }
          }
        }

        if (i < casesToRun.length - 1) {
          const next = await ask(rl, chalk.cyan('\n  Continue to next question? (Y/n/q to quit): '));

          if (next.toLowerCase() === 'q' || next.toLowerCase() === 'n') {
            console.log(chalk.dim('\n  Interview paused. Run again to continue.\n'));
            break;
          }
        }
      }

      // Save run to runs.json
      if (Object.keys(currentRun.cases).length > 0) {
        const runStore = loadRuns(projectRoot);
        addRun(runStore, currentRun);
        saveRuns(projectRoot, runStore);
      }

      // Summary for interview mode
      console.log(chalk.dim('\n  ═══════════════════════════════════════════════════\n'));

      const completed = results.filter(r => !r.skipped);
      const totalGrade = completed.reduce((sum, r) => sum + r.grade, 0);
      const avgGrade = completed.length > 0 ? (totalGrade / completed.length).toFixed(1) : 'N/A';

      const summaryLines = [
        chalk.bold('Interview Summary\n'),
        `Questions answered: ${completed.length}/${results.length}`,
        `Average grade: ${avgGrade}/10`,
        '',
      ];

      summaryLines.push(chalk.dim(`Run saved: ${currentRun.id}`));
      if (currentRun.label) {
        summaryLines.push(chalk.dim(`Label: ${currentRun.label}`));
      }

      console.log(box(summaryLines.join('\n'), 'Results'));
    }

  } finally {
    rl.close();
  }
}
