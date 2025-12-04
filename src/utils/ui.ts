import chalk from 'chalk';

export function box(content: string, title?: string): string {
  const lines = content.split('\n');
  const maxLength = Math.max(...lines.map((l) => stripAnsi(l).length));
  const width = Math.max(maxLength + 2, title ? stripAnsi(title).length + 4 : 0);

  const top = title
    ? chalk.gray('╭─') + chalk.bold(` ${title} `) + chalk.gray('─'.repeat(width - title.length - 3) + '╮')
    : chalk.gray('╭' + '─'.repeat(width + 2) + '╮');

  const middle = lines
    .map((line) => {
      const padding = width - stripAnsi(line).length;
      return chalk.gray('│') + ` ${line}${' '.repeat(padding)} ` + chalk.gray('│');
    })
    .join('\n');

  const bottom = chalk.gray('╰' + '─'.repeat(width + 2) + '╯');

  return `\n${top}\n${middle}\n${bottom}\n`;
}

// Simple ANSI code stripper for length calculation
function stripAnsi(str: string): string {
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}
