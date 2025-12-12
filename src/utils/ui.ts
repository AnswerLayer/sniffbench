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

/**
 * Strip ANSI escape codes from a string for length calculation
 */
export function stripAnsi(str: string): string {
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * Get visible width of a string (excluding ANSI codes)
 */
export function visibleWidth(str: string): number {
  return stripAnsi(str).length;
}

/**
 * Pad a string to a target width based on visible characters.
 * If the visible text is longer than width, truncates before styling.
 *
 * @param str - The string (may contain ANSI codes)
 * @param width - Target visible width
 * @param align - 'left' (padEnd) or 'right' (padStart)
 */
export function padVisible(str: string, width: number, align: 'left' | 'right' = 'left'): string {
  const visible = stripAnsi(str);
  const currentWidth = visible.length;

  if (currentWidth >= width) {
    // Truncate: need to rebuild with truncated visible text
    // This is tricky with ANSI codes, so we truncate the visible part
    // and hope the styling is at the boundaries
    const truncated = visible.substring(0, width);
    // Try to preserve styling by finding where visible text maps to original
    // For simplicity, if truncation needed, return plain truncated text
    return truncated;
  }

  const padding = ' '.repeat(width - currentWidth);
  return align === 'left' ? str + padding : padding + str;
}
