#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init';
import { runCommand } from './commands/run';
import { addCommand } from './commands/add';
import { compareCommand } from './commands/compare';
import { reportCommand } from './commands/report';
import {
  casesListCommand,
  casesShowCommand,
  casesCategoriesCommand,
  casesLanguagesCommand,
} from './commands/cases';
import { statusCommand } from './commands/status';
import { doctorCommand } from './commands/doctor';
import { interviewCommand } from './commands/interview';

const program = new Command();

program
  .name('sniff')
  .description('A benchmark suite for coding agents. Think pytest, but for evaluating AI assistants.')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize sniffbench for a repository')
  .argument('[path]', 'Path to repository', '.')
  .action(initCommand);

program
  .command('run')
  .description('Run evaluation suite on specified agent')
  .option('--agent <name>', 'Agent to evaluate (claude-code, cursor, aider)', 'claude-code')
  .option('--cases <cases>', 'Specific test cases to run (comma-separated)')
  .option('--output <dir>', 'Output directory for results', 'results')
  .option('--timeout <seconds>', 'Timeout per case in seconds', '300')
  .option('--network', 'Enable network access in sandbox (disabled by default)')
  .action((opts) => runCommand({ ...opts, timeout: parseInt(opts.timeout, 10) }));

program
  .command('add')
  .description('Add a new test case to the suite')
  .argument('<description>', 'Description of the test case')
  .action(addCommand);

program
  .command('compare')
  .description('Compare results from two evaluation runs')
  .argument('<run1>', 'First run ID')
  .argument('<run2>', 'Second run ID')
  .action(compareCommand);

program
  .command('report')
  .description('Generate evaluation report')
  .option('--format <type>', 'Output format (html, json, markdown)', 'html')
  .option('--output <file>', 'Output file path')
  .action(reportCommand);

// Cases command with subcommands
const casesCmd = program
  .command('cases')
  .description('Manage and view test cases');

casesCmd
  .command('list')
  .description('List all test cases')
  .option('-c, --category <category>', 'Filter by category')
  .option('-l, --language <language>', 'Filter by language')
  .option('-d, --difficulty <difficulty>', 'Filter by difficulty (easy, medium, hard)')
  .option('-s, --source <source>', 'Filter by source (bootstrap, generated, manual, imported)')
  .option('-t, --tags <tags...>', 'Filter by tags')
  .option('--json', 'Output as JSON')
  .action(casesListCommand);

casesCmd
  .command('show')
  .description('Show details of a specific case')
  .argument('<id>', 'Case ID')
  .option('--json', 'Output as JSON')
  .option('-e, --edit', 'Open in editor ($EDITOR or vim)')
  .action((id, opts) => casesShowCommand({ id, ...opts }));

casesCmd
  .command('categories')
  .description('List available categories')
  .action(casesCategoriesCommand);

casesCmd
  .command('languages')
  .description('List available languages')
  .action(casesLanguagesCommand);

// Default to list if no subcommand
casesCmd.action(() => casesListCommand({}));

program
  .command('status')
  .description('Show sniffbench status and configuration')
  .action(statusCommand);

program
  .command('doctor')
  .description('Run diagnostics and check system requirements')
  .action(doctorCommand);

program
  .command('interview')
  .description('Run comprehension interview to test agent understanding')
  .option('--agent <name>', 'Agent to evaluate', 'claude-code')
  .option('--cases <cases>', 'Specific case IDs to run (comma-separated)')
  .option('--output <dir>', 'Output directory for results', 'results')
  .option('--compare', 'Compare new responses against existing baselines')
  .action(interviewCommand);

program.parse();
