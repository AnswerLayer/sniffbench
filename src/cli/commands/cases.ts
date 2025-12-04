/**
 * Cases command - list, filter, and show test cases
 */

import chalk from 'chalk';
import ora from 'ora';
import { spawn } from 'child_process';
import { box } from '../../utils/ui';
import {
  loadCases,
  getDefaultCasesDir,
  listCategories,
  listLanguages,
  getCaseById,
} from '../../cases/loader';
import { Case, CaseDifficulty, CaseSource } from '../../cases/types';

interface CasesListOptions {
  category?: string;
  language?: string;
  difficulty?: string;
  source?: string;
  tags?: string[];
  json?: boolean;
}

interface CasesShowOptions {
  id: string;
  json?: boolean;
  edit?: boolean;
}

/**
 * List cases with optional filtering
 */
export async function casesListCommand(options: CasesListOptions) {
  const spinner = ora('Loading cases...').start();

  try {
    const casesDir = getDefaultCasesDir();

    const cases = await loadCases(casesDir, {
      category: options.category,
      language: options.language,
      difficulty: options.difficulty as CaseDifficulty | undefined,
      source: options.source as CaseSource | undefined,
      tags: options.tags,
    });

    spinner.stop();

    if (options.json) {
      console.log(JSON.stringify(cases, null, 2));
      return;
    }

    if (cases.length === 0) {
      console.log(chalk.yellow('No cases found matching the criteria.'));
      console.log(chalk.dim('\nTip: Try running without filters, or add cases to:'));
      console.log(chalk.cyan(`  ${casesDir}`));
      return;
    }

    // Group by category for nicer display
    const byCategory = groupByCategory(cases);

    console.log(box(chalk.bold(`Found ${cases.length} case${cases.length === 1 ? '' : 's'}`), 'sniff cases'));

    for (const [category, categoryCases] of Object.entries(byCategory)) {
      console.log(chalk.bold.blue(`\n${category}:`));

      for (const c of categoryCases) {
        const difficultyColor = getDifficultyColor(c.difficulty);
        const sourceLabel = getSourceLabel(c.source);

        console.log(
          `  ${chalk.cyan(c.id.padEnd(20))} ${c.title.substring(0, 40).padEnd(42)} ` +
            `${difficultyColor(c.difficulty.padEnd(8))} ${sourceLabel}`
        );
      }
    }

    // Show summary
    console.log(chalk.dim('\n─────────────────────────────────────────────────────────────────────────────'));
    console.log(chalk.dim(`Use ${chalk.cyan('sniff cases show <id>')} to view case details`));
  } catch (err) {
    spinner.fail('Failed to load cases');
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
}

/**
 * Show details of a specific case
 */
export async function casesShowCommand(options: CasesShowOptions) {
  const spinner = ora('Loading case...').start();

  try {
    const casesDir = getDefaultCasesDir();
    const caseData = await getCaseById(casesDir, options.id);

    spinner.stop();

    if (!caseData) {
      console.log(chalk.red(`Case not found: ${options.id}`));
      console.log(chalk.dim('\nTip: Use `sniff cases list` to see available cases.'));
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(caseData, null, 2));
      return;
    }

    // Open in editor if --edit flag is passed
    if (options.edit && caseData._sourcePath) {
      const editor = process.env.EDITOR || 'vim';
      const child = spawn(editor, [caseData._sourcePath], {
        stdio: 'inherit',
      });

      child.on('exit', (code) => {
        process.exit(code || 0);
      });
    } else {
      // Display case details in terminal
      displayCase(caseData);
    }
  } catch (err) {
    spinner.fail('Failed to load case');
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
}

/**
 * Show available categories
 */
export async function casesCategoriesCommand() {
  const spinner = ora('Loading categories...').start();

  try {
    const casesDir = getDefaultCasesDir();
    const categories = await listCategories(casesDir);

    spinner.stop();

    if (categories.length === 0) {
      console.log(chalk.yellow('No categories found.'));
      return;
    }

    console.log(chalk.bold('Available categories:'));
    for (const cat of categories) {
      console.log(`  ${chalk.cyan(cat)}`);
    }
  } catch (err) {
    spinner.fail('Failed to load categories');
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
}

/**
 * Show available languages
 */
export async function casesLanguagesCommand() {
  const spinner = ora('Loading languages...').start();

  try {
    const casesDir = getDefaultCasesDir();
    const languages = await listLanguages(casesDir);

    spinner.stop();

    if (languages.length === 0) {
      console.log(chalk.yellow('No languages found.'));
      return;
    }

    console.log(chalk.bold('Available languages:'));
    for (const lang of languages) {
      console.log(`  ${chalk.cyan(lang)}`);
    }
  } catch (err) {
    spinner.fail('Failed to load languages');
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
}

// =============================================================================
// Helpers
// =============================================================================

function groupByCategory(cases: Case[]): Record<string, Case[]> {
  const result: Record<string, Case[]> = {};

  for (const c of cases) {
    if (!result[c.category]) {
      result[c.category] = [];
    }
    result[c.category].push(c);
  }

  return result;
}

function getDifficultyColor(difficulty: CaseDifficulty): (text: string) => string {
  switch (difficulty) {
    case 'easy':
      return chalk.green;
    case 'medium':
      return chalk.yellow;
    case 'hard':
      return chalk.red;
    default:
      return chalk.white;
  }
}

function getSourceLabel(source: CaseSource): string {
  switch (source) {
    case 'bootstrap':
      return chalk.dim('[bootstrap]');
    case 'generated':
      return chalk.magenta('[generated]');
    case 'manual':
      return chalk.blue('[manual]');
    case 'imported':
      return chalk.cyan('[imported]');
    default:
      return '';
  }
}

function displayCase(c: Case): void {
  const difficultyColor = getDifficultyColor(c.difficulty);

  const lines = [
    chalk.bold(c.title),
    '',
    `${chalk.dim('ID:')}        ${chalk.cyan(c.id)}`,
    `${chalk.dim('Category:')} ${c.category}`,
    `${chalk.dim('Language:')} ${c.language}`,
    `${chalk.dim('Difficulty:')} ${difficultyColor(c.difficulty)}`,
    `${chalk.dim('Source:')}   ${c.source}`,
  ];

  if (c.tags && c.tags.length > 0) {
    lines.push(`${chalk.dim('Tags:')}     ${c.tags.map((t) => chalk.cyan(t)).join(', ')}`);
  }

  if (c.rubric) {
    const rubricStr = typeof c.rubric === 'string' ? c.rubric : `extends ${c.rubric.extends}`;
    lines.push(`${chalk.dim('Rubric:')}   ${rubricStr}`);
  }

  if (c.version) {
    lines.push(`${chalk.dim('Version:')}  ${c.version}`);
  }

  console.log(box(lines.join('\n'), 'Case Details'));

  // Show prompt
  console.log(chalk.bold('\nPrompt:'));
  console.log(chalk.dim('─'.repeat(60)));
  console.log(c.prompt.trim());
  console.log(chalk.dim('─'.repeat(60)));

  // Show files
  if (c.files && c.files.length > 0) {
    console.log(chalk.bold('\nFiles:'));
    for (const file of c.files) {
      const readonlyLabel = file.readonly ? chalk.yellow(' (readonly)') : '';
      const refLabel = file.ref ? chalk.dim(` → ${file.ref}`) : '';
      console.log(`  ${chalk.cyan(file.path)}${readonlyLabel}${refLabel}`);

      if (file.content) {
        // Show first few lines of content
        const lines = file.content.split('\n');
        const preview = lines.slice(0, 5);
        for (const line of preview) {
          console.log(chalk.dim(`    ${line}`));
        }
        if (lines.length > 5) {
          console.log(chalk.dim(`    ... (${lines.length - 5} more lines)`));
        }
      }
    }
  }

  // Show expectations
  if (c.expectations) {
    console.log(chalk.bold('\nExpectations:'));
    if (c.expectations.maxTimeSeconds) {
      console.log(`  ${chalk.dim('Max time:')} ${c.expectations.maxTimeSeconds}s`);
    }
    if (c.expectations.maxTokens) {
      console.log(`  ${chalk.dim('Max tokens:')} ${c.expectations.maxTokens}`);
    }
    if (c.expectations.maxIterations) {
      console.log(`  ${chalk.dim('Max iterations:')} ${c.expectations.maxIterations}`);
    }
    if (c.expectations.allowedTools) {
      console.log(`  ${chalk.dim('Allowed tools:')} ${c.expectations.allowedTools.join(', ')}`);
    }
    if (c.expectations.disallowedTools) {
      console.log(`  ${chalk.dim('Disallowed tools:')} ${c.expectations.disallowedTools.join(', ')}`);
    }
  }

  // Show notes
  if (c.notes) {
    console.log(chalk.bold('\nNotes:'));
    console.log(chalk.dim(c.notes));
  }

  // Show source path
  if (c._sourcePath) {
    console.log(chalk.dim(`\nSource: ${c._sourcePath}`));
  }
}
