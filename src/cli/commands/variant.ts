/**
 * Variant subcommands - register, list, show, diff, delete variants
 */

import chalk from 'chalk';
import { box } from '../../utils/ui';
import { capturePartialAgentConfig, diffAgentConfig, formatAgentConfig } from '../../runs';
import {
  loadVariants,
  saveVariants,
  listVariants,
  getVariant,
  findVariantByName,
  registerVariant,
  deleteVariant,
  resolveVariantId,
  hashAgentConfig,
  Variant,
} from '../../variants';
import { ClaudeCodeAgent } from '../../agents/claude-code';

/**
 * Format a date string for display
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a variant for list display
 */
function formatVariantRow(variant: Variant): string {
  const date = chalk.dim(formatDate(variant.createdAt));
  const name = chalk.cyan(variant.name);
  const desc = variant.description
    ? chalk.dim(variant.description.substring(0, 40) + (variant.description.length > 40 ? '...' : ''))
    : chalk.dim('-');
  const model = chalk.yellow(variant.snapshot.model.substring(0, 20));

  return `  ${variant.id.substring(0, 20)}  ${name.padEnd(20)}  ${date}  ${model}  ${desc}`;
}

/**
 * Register a new variant
 */
export async function variantRegisterCommand(
  name: string,
  options: { description?: string; changes?: string[] }
): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);

  // Check for duplicate name
  const existing = findVariantByName(store, name);
  if (existing) {
    console.log(chalk.red(`\n  A variant with name "${name}" already exists.`));
    console.log(chalk.dim(`  ID: ${existing.id}`));
    console.log(chalk.dim('  Use a different name or delete the existing variant.\n'));
    return;
  }

  // Capture current ambient config
  console.log(chalk.dim('  Capturing current agent configuration...'));
  const agent = new ClaudeCodeAgent();
  const snapshot = await capturePartialAgentConfig(agent, projectRoot);

  // Register the variant
  const variant = registerVariant(store, snapshot, {
    name,
    description: options.description,
    changes: options.changes,
  });

  // Save
  saveVariants(projectRoot, store);

  console.log(box(
    chalk.bold('Variant Registered\n\n') +
    `ID: ${variant.id}\n` +
    `Name: ${chalk.cyan(variant.name)}\n` +
    (variant.description ? `Description: ${variant.description}\n` : '') +
    '\n' +
    chalk.bold('Captured Configuration:\n') +
    formatAgentConfig(variant.snapshot),
    'sniff variant register'
  ));
}

/**
 * List all variants
 */
export async function variantListCommand(options: { json?: boolean }): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);
  const variants = listVariants(store);

  if (options.json) {
    console.log(JSON.stringify(variants, null, 2));
    return;
  }

  if (variants.length === 0) {
    console.log(box(
      chalk.dim('No variants registered.\n\n') +
      chalk.dim('Use `sniff variant register <name>` to register the current configuration as a variant.'),
      'Variants'
    ));
    return;
  }

  console.log(box(
    chalk.bold(`${variants.length} variant${variants.length === 1 ? '' : 's'}\n\n`) +
    chalk.dim('ID                    Name                  Created              Model                 Description\n') +
    chalk.dim('─'.repeat(110)) + '\n' +
    variants.map(formatVariantRow).join('\n'),
    'Variants'
  ));
}

/**
 * Show details of a specific variant
 */
export async function variantShowCommand(options: { id: string; json?: boolean }): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);

  // Resolve ID (could be name or partial ID)
  const variantId = resolveVariantId(store, options.id);
  if (!variantId) {
    console.log(chalk.red(`\n  Variant not found: ${options.id}`));
    console.log(chalk.dim('  Use `sniff variant list` to see available variants.\n'));
    return;
  }

  const variant = getVariant(store, variantId);
  if (!variant) {
    console.log(chalk.red(`\n  Variant not found: ${variantId}\n`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(variant, null, 2));
    return;
  }

  // Display variant details
  const configHash = hashAgentConfig(variant.snapshot);

  const content = [
    chalk.bold('Variant Details\n'),
    `ID: ${variant.id}`,
    `Name: ${chalk.cyan(variant.name)}`,
    variant.description ? `Description: ${variant.description}` : '',
    `Created: ${formatDate(variant.createdAt)}`,
    `Config Hash: ${configHash}`,
    '',
    variant.changes && variant.changes.length > 0 ? [
      chalk.bold('Declared Changes:'),
      ...variant.changes.map(c => `  - ${c}`),
      '',
    ].join('\n') : '',
    chalk.bold('Configuration Snapshot:'),
    formatAgentConfig(variant.snapshot),
  ].filter(Boolean).join('\n');

  console.log(box(content, `Variant: ${variant.name}`));
}

/**
 * Compare two variants (config diff only, no run data)
 */
export async function variantDiffCommand(id1: string, id2: string, options: { json?: boolean }): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);

  // Resolve both IDs
  const variantId1 = resolveVariantId(store, id1);
  const variantId2 = resolveVariantId(store, id2);

  if (!variantId1) {
    console.log(chalk.red(`\n  Variant not found: ${id1}`));
    console.log(chalk.dim('  Use `sniff variant list` to see available variants.\n'));
    return;
  }

  if (!variantId2) {
    console.log(chalk.red(`\n  Variant not found: ${id2}`));
    console.log(chalk.dim('  Use `sniff variant list` to see available variants.\n'));
    return;
  }

  const variant1 = getVariant(store, variantId1)!;
  const variant2 = getVariant(store, variantId2)!;

  // Compute diff
  const diffs = diffAgentConfig(variant1.snapshot, variant2.snapshot);

  if (options.json) {
    console.log(JSON.stringify({
      variant1: { id: variant1.id, name: variant1.name },
      variant2: { id: variant2.id, name: variant2.name },
      differences: diffs,
    }, null, 2));
    return;
  }

  // Display comparison
  console.log(box(
    chalk.bold('Variant Comparison\n\n') +
    chalk.dim('Comparing configuration differences between two variants.'),
    'sniff variant diff'
  ));

  console.log(chalk.bold('\n  Variants:\n'));
  console.log(chalk.dim('  ─'.repeat(40)));
  console.log(`  ${chalk.bold('Variant 1:')} ${variant1.name} (${variant1.id.substring(0, 16)})`);
  console.log(`             ${chalk.dim(formatDate(variant1.createdAt))}`);
  console.log('');
  console.log(`  ${chalk.bold('Variant 2:')} ${variant2.name} (${variant2.id.substring(0, 16)})`);
  console.log(`             ${chalk.dim(formatDate(variant2.createdAt))}`);

  // Show declared changes if any
  if (variant1.changes && variant1.changes.length > 0) {
    console.log(chalk.bold('\n  Variant 1 Declared Changes:'));
    for (const change of variant1.changes) {
      console.log(chalk.dim(`    - ${change}`));
    }
  }

  if (variant2.changes && variant2.changes.length > 0) {
    console.log(chalk.bold('\n  Variant 2 Declared Changes:'));
    for (const change of variant2.changes) {
      console.log(chalk.dim(`    - ${change}`));
    }
  }

  // Show config diff
  if (diffs.length > 0) {
    console.log(chalk.bold('\n  Configuration Differences:\n'));
    console.log(chalk.dim('  ─'.repeat(40)));
    for (const diff of diffs) {
      console.log(`  ${diff.field}: ${chalk.red(diff.old)} → ${chalk.green(diff.new)}`);
    }
  } else {
    console.log(chalk.dim('\n  No configuration differences detected.\n'));
  }

  console.log('');
}

/**
 * Delete a variant
 */
export async function variantDeleteCommand(options: { id: string; force?: boolean }): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);

  // Resolve ID
  const variantId = resolveVariantId(store, options.id);
  if (!variantId) {
    console.log(chalk.red(`\n  Variant not found: ${options.id}`));
    console.log(chalk.dim('  Use `sniff variant list` to see available variants.\n'));
    return;
  }

  const variant = getVariant(store, variantId);
  if (!variant) {
    console.log(chalk.red(`\n  Variant not found: ${variantId}\n`));
    return;
  }

  // Confirm deletion unless --force
  if (!options.force) {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(
        chalk.yellow(`\n  Delete variant "${variant.name}" (${variantId})? (y/N): `),
        resolve
      );
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log(chalk.dim('\n  Cancelled.\n'));
      return;
    }
  }

  // Delete the variant
  const deleted = deleteVariant(store, variantId);
  if (deleted) {
    saveVariants(projectRoot, store);
    console.log(chalk.green(`\n  ✓ Deleted variant: ${variant.name} (${variantId})\n`));
  } else {
    console.log(chalk.red(`\n  Failed to delete variant: ${variantId}\n`));
  }
}
