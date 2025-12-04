import chalk from 'chalk';
import { box } from '../../utils/ui';

export async function initCommand(path: string) {
  console.log(
    box(
      chalk.yellow('Coming soon!\n\n') +
        'This command will:\n' +
        '  • Analyze your codebase structure\n' +
        '  • Create .sniffbench/ config directory\n' +
        '  • Generate initial test cases\n\n' +
        chalk.dim('Want to implement this? Check the roadmap!'),
      'sniff init'
    )
  );
}
