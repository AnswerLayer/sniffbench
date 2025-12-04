import chalk from 'chalk';
import { box } from '../../utils/ui';

export async function statusCommand() {
  const status =
    chalk.bold('Sniffbench Status\n\n') +
    chalk.green('✓') +
    ' Sniffbench is installed\n' +
    chalk.yellow('○') +
    ' No configuration found (run ' +
    chalk.cyan('sniff init') +
    ')\n' +
    chalk.yellow('○') +
    ' No evaluation history\n\n' +
    chalk.bold('Available Features:\n') +
    '  • CLI commands: ' +
    chalk.green('Ready') +
    '\n' +
    '  • Docker sandboxing: ' +
    chalk.yellow('In development') +
    '\n' +
    '  • Bootstrap cases: ' +
    chalk.yellow('In development') +
    '\n' +
    '  • Agent wrappers: ' +
    chalk.yellow('In development') +
    '\n' +
    '  • Metrics system: ' +
    chalk.yellow('In development') +
    '\n\n' +
    chalk.dim('Version: 0.1.0 (alpha)');

  console.log(box(status, 'Status'));
}
