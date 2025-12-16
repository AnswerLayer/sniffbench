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
import {
  runsListCommand,
  runsShowCommand,
  runsDeleteCommand,
} from './commands/runs';
import {
  variantRegisterCommand,
  variantListCommand,
  variantShowCommand,
  variantDiffCommand,
  variantDeleteCommand,
  variantBuildCommand,
  variantPruneCommand,
  variantUseCommand,
  variantUnuseCommand,
  variantActiveCommand,
  variantsBuildCommand,
  variantsPruneCommand,
  variantsCleanCommand,
} from './commands/variant';
import {
  closedIssuesScanCommand,
  closedIssuesAddCommand,
  closedIssuesListCommand,
  closedIssuesRunCommand,
} from './commands/closed-issues';

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
  .option('--run <label>', 'Save results to a named run (enables run tracking)')
  .option('--variant <name>', 'Link run to a registered variant (auto-detects if not provided)')
  .option('--use-variant <name>', 'Run in sandboxed variant container')
  .action(interviewCommand);

// Runs command with subcommands
const runsCmd = program
  .command('runs')
  .description('Manage evaluation runs');

runsCmd
  .command('list')
  .description('List all runs')
  .option('--json', 'Output as JSON')
  .action(runsListCommand);

runsCmd
  .command('show')
  .description('Show details of a specific run')
  .argument('<id>', 'Run ID or label')
  .option('--json', 'Output as JSON')
  .action((id, opts) => runsShowCommand({ id, ...opts }));

runsCmd
  .command('delete')
  .description('Delete a run')
  .argument('<id>', 'Run ID or label')
  .option('-f, --force', 'Skip confirmation')
  .action((id, opts) => runsDeleteCommand({ id, ...opts }));

// Default to list if no subcommand
runsCmd.action(() => runsListCommand({}));

// Variant command (singular) - operate on ONE variant
const variantCmd = program
  .command('variant')
  .description('Operate on a single variant');

variantCmd
  .command('register')
  .description('Register current configuration as a named variant')
  .argument('<name>', 'Variant name (e.g., "control", "with-linear-mcp")')
  .option('-d, --description <text>', 'Description of the variant')
  .option('-c, --changes <changes...>', 'List of explicit changes in this variant')
  .option('-a, --agent <name>', 'Agent type to capture config for', 'claude-code')
  .option('-b, --build', 'Build container image after registration')
  .option('-f, --force', 'Overwrite existing variant with same name')
  .action((name, opts) => variantRegisterCommand(name, opts));

variantCmd
  .command('show')
  .description('Show details of a specific variant')
  .argument('<name>', 'Variant ID or name')
  .option('--json', 'Output as JSON')
  .action((name, opts) => variantShowCommand({ id: name, ...opts }));

variantCmd
  .command('build')
  .description('Build or rebuild container image for a variant')
  .argument('<name>', 'Variant ID or name')
  .option('-v, --verbose', 'Show detailed build output')
  .option('--claude-version <version>', 'Claude Code version to install (e.g., 2.0.55)')
  .action((name, opts) => variantBuildCommand(name, opts));

variantCmd
  .command('prune')
  .description('Remove container image for a variant (keeps variant config)')
  .argument('<name>', 'Variant ID or name')
  .option('-f, --force', 'Skip confirmation')
  .action((name, opts) => variantPruneCommand(name, opts));

variantCmd
  .command('delete')
  .description('Delete a variant')
  .argument('<name>', 'Variant ID or name')
  .option('-f, --force', 'Skip confirmation')
  .action((name, opts) => variantDeleteCommand({ id: name, ...opts }));

variantCmd
  .command('use')
  .description('Activate a variant for subsequent interviews')
  .argument('<name>', 'Variant ID or name')
  .action((name) => variantUseCommand(name));

variantCmd
  .command('unuse')
  .description('Deactivate the current variant')
  .action(() => variantUnuseCommand());

variantCmd
  .command('active')
  .description('Show the currently active variant')
  .action(() => variantActiveCommand());

// Default: show active variant
variantCmd.action(() => variantActiveCommand());

// Variants command (plural) - operate on MANY variants
const variantsCmd = program
  .command('variants')
  .description('List, compare, and bulk-manage variants');

variantsCmd
  .command('list')
  .description('List all registered variants')
  .option('--json', 'Output as JSON')
  .action(variantListCommand);

variantsCmd
  .command('diff')
  .description('Compare configuration between two variants')
  .argument('<variant1>', 'First variant ID or name')
  .argument('<variant2>', 'Second variant ID or name')
  .option('--json', 'Output as JSON')
  .action((id1, id2, opts) => variantDiffCommand(id1, id2, opts));

variantsCmd
  .command('build')
  .description('Build container images for all variants')
  .option('--filter <pattern>', 'Only build variants matching pattern')
  .option('-v, --verbose', 'Show detailed build output')
  .option('--claude-version <version>', 'Claude Code version to install')
  .action((opts) => variantsBuildCommand(opts));

variantsCmd
  .command('prune')
  .description('Remove all variant container images')
  .option('-f, --force', 'Skip confirmation')
  .action((opts) => variantsPruneCommand(opts));

variantsCmd
  .command('clean')
  .description('Delete stale variants (never built or image missing)')
  .option('-f, --force', 'Skip confirmation')
  .action((opts) => variantsCleanCommand(opts));

// Default: list all variants
variantsCmd.action(() => variantListCommand({}));

// Closed Issues command - evaluate agents using real closed issues
const closedIssuesCmd = program
  .command('closed-issues')
  .description('Evaluate agents using real closed issues from repositories');

closedIssuesCmd
  .command('scan')
  .description('Scan repository for closed issues suitable for evaluation')
  .argument('[repo-path]', 'Path to repository', '.')
  .option('-n, --max-issues <n>', 'Maximum issues to return', '50')
  .option('--max-pr-size <lines>', 'Maximum PR size in lines', '500')
  .option('--max-files <n>', 'Maximum files changed', '10')
  .option('--since <date>', 'Only issues merged after this date (YYYY-MM-DD)')
  .option('--require-tests', 'Only include issues with test changes')
  .option('--all', 'Show all issues including excluded ones')
  .option('--json', 'Output as JSON')
  .action((repoPath, opts) => closedIssuesScanCommand(repoPath, opts));

closedIssuesCmd
  .command('add')
  .description('Add a specific closed issue as a test case')
  .argument('<issue>', 'Issue reference (owner/repo#123 or #123)')
  .option('-r, --repo <path>', 'Path to repository clone')
  .action((issueRef, opts) => closedIssuesAddCommand(issueRef, opts));

closedIssuesCmd
  .command('list')
  .description('List all extracted closed-issue cases')
  .option('--json', 'Output as JSON')
  .action(closedIssuesListCommand);

closedIssuesCmd
  .command('run')
  .description('Run agent on closed-issue cases')
  .option('-c, --case <id>', 'Specific case ID to run')
  .option('--agent <name>', 'Agent to evaluate', 'claude-code')
  .option('--variant <name>', 'Use a specific variant')
  .option('-o, --output <dir>', 'Output directory')
  .action(closedIssuesRunCommand);

// Default: list closed-issue cases
closedIssuesCmd.action(() => closedIssuesListCommand({}));

program.parse();
