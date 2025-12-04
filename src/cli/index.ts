#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init';
import { runCommand } from './commands/run';
import { addCommand } from './commands/add';
import { compareCommand } from './commands/compare';
import { reportCommand } from './commands/report';
import { casesCommand } from './commands/cases';
import { statusCommand } from './commands/status';

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
  .action(runCommand);

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

program
  .command('cases')
  .description('List available test cases')
  .action(casesCommand);

program
  .command('status')
  .description('Show sniffbench status and configuration')
  .action(statusCommand);

program.parse();
