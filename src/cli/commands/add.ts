import chalk from 'chalk';
import { box } from '../../utils/ui';

export async function addCommand(description: string) {
  console.log(
    box(
      chalk.yellow('Coming soon!\n\n') +
        'This command will:\n' +
        `  • Create a test case for: '${description}'\n` +
        '  • Generate case specification YAML\n' +
        '  • Add validation tests\n' +
        '  • Save to cases/ directory\n\n' +
        chalk.dim('Want to implement this? Check the roadmap!'),
      'sniff add'
    )
  );
}
