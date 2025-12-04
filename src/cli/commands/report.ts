import chalk from 'chalk';
import { box } from '../../utils/ui';

interface ReportOptions {
  format: string;
  output?: string;
}

export async function reportCommand(options: ReportOptions) {
  const outputFile = options.output || `report.${options.format}`;

  console.log(
    box(
      chalk.yellow('Coming soon!\n\n') +
        'This command will:\n' +
        '  • Load evaluation results\n' +
        `  • Generate ${options.format} report\n` +
        '  • Include metrics, charts, and analysis\n' +
        `  • Save to ${outputFile}\n\n` +
        chalk.dim('Want to implement this? Check the roadmap!'),
      'sniff report'
    )
  );
}
