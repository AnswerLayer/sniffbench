import chalk from 'chalk';
import ora from 'ora';
import { box } from '../../utils/ui';
import { checkDocker } from '../../sandbox';

export async function statusCommand() {
  const spinner = ora('Checking system status...').start();

  // Check Docker availability
  const dockerStatus = await checkDocker();
  spinner.stop();

  // Build status display
  let lines: string[] = [];

  lines.push(chalk.bold('System Status\n'));

  // Sniffbench installed
  lines.push(chalk.green('✓') + ' Sniffbench is installed');

  // Docker status
  if (dockerStatus.available) {
    lines.push(chalk.green('✓') + ` Docker ${dockerStatus.version} is running`);
  } else {
    lines.push(chalk.red('✗') + ` Docker: ${dockerStatus.error}`);
    if (dockerStatus.suggestion) {
      // Indent the suggestion
      const suggestionLines = dockerStatus.suggestion.split('\n');
      lines.push(chalk.dim('  ' + suggestionLines[0]));
      for (let i = 1; i < suggestionLines.length; i++) {
        lines.push(chalk.dim('  ' + suggestionLines[i]));
      }
    }
  }

  // Configuration status (TODO: implement config detection)
  lines.push(chalk.yellow('○') + ' No configuration found (run ' + chalk.cyan('sniff init') + ')');

  // Evaluation history (TODO: implement history)
  lines.push(chalk.yellow('○') + ' No evaluation history');

  lines.push('');
  lines.push(chalk.bold('Features:'));
  lines.push('  • CLI commands: ' + chalk.green('Ready'));
  lines.push('  • Docker sandboxing: ' + (dockerStatus.available ? chalk.green('Ready') : chalk.red('Unavailable')));
  lines.push('  • Bootstrap cases: ' + chalk.yellow('Coming soon'));
  lines.push('  • Agent wrappers: ' + chalk.yellow('Coming soon'));
  lines.push('  • Metrics system: ' + chalk.yellow('Coming soon'));

  lines.push('');
  lines.push(chalk.dim('Version: 0.1.0 (alpha)'));

  console.log(box(lines.join('\n'), 'sniff status'));
}
