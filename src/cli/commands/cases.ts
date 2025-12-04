import chalk from 'chalk';

export async function casesCommand() {
  console.log(chalk.bold.cyan('\nAvailable Test Cases\n'));

  const cases = [
    {
      id: 'bootstrap-001',
      title: 'Add error handling to unprotected API calls',
      difficulty: 'easy',
      language: 'python',
    },
  ];

  console.log(
    chalk.gray('┌─────────────────┬──────────────────────────────────────┬────────────┬──────────┐')
  );
  console.log(
    chalk.gray('│') +
      chalk.cyan(' ID              ') +
      chalk.gray('│') +
      chalk.green(' Title                                ') +
      chalk.gray('│') +
      chalk.yellow(' Difficulty ') +
      chalk.gray('│') +
      chalk.blue(' Language ') +
      chalk.gray('│')
  );
  console.log(
    chalk.gray('├─────────────────┼──────────────────────────────────────┼────────────┼──────────┤')
  );

  cases.forEach((c) => {
    console.log(
      chalk.gray('│') +
        ` ${chalk.cyan(c.id.padEnd(15))}` +
        chalk.gray('│') +
        ` ${chalk.green(c.title.padEnd(36))} ` +
        chalk.gray('│') +
        ` ${chalk.yellow(c.difficulty.padEnd(10))} ` +
        chalk.gray('│') +
        ` ${chalk.blue(c.language.padEnd(8))} ` +
        chalk.gray('│')
    );
  });

  console.log(
    chalk.gray('└─────────────────┴──────────────────────────────────────┴────────────┴──────────┘')
  );
  console.log(chalk.dim('\nMore cases coming soon. Want to contribute one?\n'));
}
