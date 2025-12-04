import chalk from 'chalk';
import { box } from '../../utils/ui';

interface RunOptions {
  agent: string;
  cases?: string;
  output: string;
}

export async function runCommand(options: RunOptions) {
  console.log(
    box(
      chalk.yellow('Coming soon!\n\n') +
        'This command will:\n' +
        '  • Load test cases from cases/bootstrap/\n' +
        '  • Spin up Docker containers for isolation\n' +
        `  • Run ${options.agent} through each test\n` +
        '  • Collect metrics and generate scores\n' +
        `  • Save results to ${options.output}/\n\n` +
        chalk.dim('Want to implement this? Check the roadmap!'),
      'sniff run'
    )
  );
}
