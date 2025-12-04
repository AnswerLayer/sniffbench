import chalk from 'chalk';
import { box } from '../../utils/ui';

export async function compareCommand(run1: string, run2: string) {
  console.log(
    box(
      chalk.yellow('Coming soon!\n\n') +
        'This command will:\n' +
        `  • Load results from ${run1}\n` +
        `  • Load results from ${run2}\n` +
        '  • Compare metrics side-by-side\n' +
        '  • Highlight significant differences\n' +
        '  • Show which agent performed better\n\n' +
        chalk.dim('Want to implement this? Check the roadmap!'),
      'sniff compare'
    )
  );
}
